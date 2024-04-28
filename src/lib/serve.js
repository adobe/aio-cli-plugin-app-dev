/*
Copyright 2024 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const express = require('express')
const fs = require('fs-extra')
const https = require('node:https')
const crypto = require('node:crypto')
const livereload = require('livereload')
const connectLiveReload = require('connect-livereload')
const { bundle } = require('@adobe/aio-lib-web')
const utils = require('./app-helper')
const getPort = require('get-port')
const rtLib = require('@adobe/aio-lib-runtime')
const coreLogger = require('@adobe/aio-lib-core-logging')
const { SERVER_DEFAULT_PORT, BUNDLER_DEFAULT_PORT, DEV_API_PREFIX, DEV_API_WEB_PREFIX } = require('./constants')

module.exports = async function serve (options, devConfig, _inprocHook) {
  const serveLogger = coreLogger('serve', { level: process.env.LOG_LEVEL, provider: 'winston' })

  const actionConfig = devConfig.manifest.full.packages
  const hasFrontend = devConfig.app.hasFrontend
  const hasBackend = devConfig.app.hasBackend
  const httpsSettings = options.parcel.https

  serveLogger.debug('hasBackend', hasBackend)
  serveLogger.debug('hasFrontend', hasFrontend)
  serveLogger.debug('httpsSettings', JSON.stringify(httpsSettings, null, 2))
  serveLogger.debug('actionConfig', JSON.stringify(actionConfig, null, 2))

  // set up environment variables for openwhisk
  process.env.__OW_API_KEY = process.env.AIO_RUNTIME_AUTH
  process.env.__OW_NAMESPACE = process.env.AIO_RUNTIME_NAMESPACE
  process.env.__OW_API_HOST = process.env.AIO_RUNTIME_APIHOST

  const serverPortToUse = parseInt(process.env.PORT) || SERVER_DEFAULT_PORT
  const serverPort = await getPort({ port: serverPortToUse })

  let actionUrls = {}
  if (hasBackend) {
    actionUrls = rtLib.utils.getActionUrls(devConfig, true /* isRemoteDev */, false /* isLocalDev */, false /* legacy */)
    actionUrls = Object.entries(actionUrls).reduce((acc, [key, value]) => {
      const url = new URL(value)
      url.port = serverPort
      url.hostname = 'localhost'
      acc[key] = url.toString()
      return acc
    }, {})
  }

  const cert = fs.readFileSync(httpsSettings.cert, 'utf-8')
  const key = fs.readFileSync(httpsSettings.key, 'utf-8')
  const serverOptions = {
    key,
    cert
  }

  let subscription
  if (hasFrontend) {
    const liveReloadServer = livereload.createServer({ https: serverOptions })
    liveReloadServer.watch(devConfig.web.distDev)
    liveReloadServer.server.once('connection', () => {
      setTimeout(() => {
        liveReloadServer.refresh('/')
      }, 100)
    })

    try {
      utils.writeConfig(devConfig.web.injectedConfig, actionUrls)

      const bundlerPortToUse = parseInt(process.env.BUNDLER_PORT) || BUNDLER_DEFAULT_PORT
      const bundlerPort = await getPort({ port: bundlerPortToUse })

      if (bundlerPort !== bundlerPortToUse) {
        serveLogger.info(`Could not use bundler port ${bundlerPortToUse}, using port ${bundlerPort} instead`)
      }

      const entries = devConfig.web.src + '/**/*.html'
      options.bundle.serveOptions = {
        port: bundlerPort,
        https: httpsSettings
      }
      // TODO: Move this and bundleServe to aio-lib-web so we can remove the parcel dependency
      options.bundle.additionalReporters = [
        { packageName: '@parcel/reporter-cli', resolveFrom: __filename }
      ]

      const bundler = await bundle(entries, devConfig.web.distDev, options.bundle, serveLogger.debug.bind(serveLogger))
      await bundler.run() // run it once

      subscription = await bundler.watch((err, event) => {
        if (err) {
          // fatal error
          throw err
        }

        serveLogger.info(`${event.changedAssets.size} static asset(s) changed`)
        const limit = options.verbose ? Infinity : 5
        if (event.changedAssets.size <= limit) {
          event.changedAssets.forEach((value, key, map) => {
            serveLogger.info('\t-->', value)
          })
        }
        if (event.type === 'buildSuccess') {
          const bundles = event.bundleGraph.getBundles()
          serveLogger.info(`✨ Built ${bundles.length} bundles in ${event.buildTime}ms!`)
        } else if (event.type === 'buildFailure') {
          serveLogger.error(event.diagnostics)
        }
      })
    } catch (err) {
      serveLogger.error(err.diagnostics)
    }
  }

  const app = express()
  app.use(express.json())
  if (hasFrontend) {
    app.use(connectLiveReload())
    app.use(express.static(devConfig.web.distDev))
  }

  // serveAction needs to clear cache for each request, so we get live changes
  app.all(`/${DEV_API_WEB_PREFIX}/*`, (req, res, next) => serveWebAction(req, res, next, actionConfig))
  app.all(`/${DEV_API_PREFIX}/*`, (req, res, next) => serveNonWebAction(req, res, next, actionConfig))

  const server = https.createServer(serverOptions, app)
  server.listen(serverPort, () => {
    if (serverPort !== serverPortToUse) {
      serveLogger.info(`Could not use server port ${serverPortToUse}, using port ${serverPort} instead`)
    }
    serveLogger.info('server running on port : ', serverPort)
  })
  const frontendUrl = `${httpsSettings ? 'https:' : 'http:'}//localhost:${serverPort}`

  const serverCleanup = async () => {
    serveLogger.debug('shutting down http server ...')
    await server.close()
    serveLogger.debug('removing parcel watcher ...')
    await subscription?.unsubscribe()
  }

  return {
    frontendUrl,
    actionUrls,
    serverCleanup
  }
}

/**
 * Gets the HTTP status message for a HTTP status code.
 *
 * @param {number} statusCode the HTTP status code
 * @returns {string} the HTTP status message for the code
 */
function statusCodeMessage (statusCode) {
  switch (statusCode) {
    case 200:
      return 'success'
    case 401:
      return 'unauthorized'
    case 403:
      return 'forbidden'
    case 404:
      return 'not found'
    case 500:
      return 'internal server error'
    default:
      return `unknown error for ${statusCode}`
  }
}

/**
 * Determines if an action is a web action.
 *
 * @param {object} action the action object
 * @returns {boolean} true if it is a web action
 */
function isWebAction (action) {
  const toBoolean = (value) => (value === 'yes' || value === 'true' || value === true)

  const webExportValue = action?.annotations?.['web-export']
  const webValue = action?.web

  return (toBoolean(webExportValue) || toBoolean(webValue))
}

/**
 * Express path handler to handle non-web action API calls.
 * Openwhisk returns 401 when you call a non-web action via HTTP GET.
 *
 * @param {*} req the http request
 * @param {*} res the http response
 * @param {*} _next the next http handler
 * @param {*} actionConfig the action configuration
 * @returns {Response} the response
 */
async function serveNonWebAction (req, res, _next, actionConfig) {
  const url = req.params[0]
  const [, actionName] = url.split('/')
  const actionLogger = coreLogger(`serveNonWebAction ${actionName}`, { level: process.env.LOG_LEVEL, provider: 'winston' })

  const statusCode = 401
  actionLogger.error(`${statusCode} ${statusCodeMessage(statusCode)}`)

  return res
    .status(statusCode)
    .send({ error: statusCodeMessage(statusCode) })
}

/**
 * Express path handler to handle web action API calls.
 *
 * @param {*} req the http request
 * @param {*} res the http response
 * @param {*} _next the next http handler
 * @param {*} actionConfig the action configuration
 * @returns {Response} the response
 */
async function serveWebAction (req, res, _next, actionConfig) {
  const url = req.params[0]
  const [packageName, actionName, ...path] = url.split('/')
  const action = actionConfig[packageName]?.actions[actionName]

  const actionLogger = coreLogger(`serveWebAction ${actionName}`, { level: process.env.LOG_LEVEL, provider: 'winston' })

  if (!action) {
    // action could be a sequence ... todo: refactor these 2 paths to 1 action runner
    const sequence = actionConfig[packageName]?.sequences?.[actionName]
    if (sequence) {
      const actions = sequence.actions?.split(',')
      const params = {
        __ow_body: req.body,
        __ow_headers: req.headers,
        __ow_path: path.join('/'),
        __ow_query: req.query,
        __ow_method: req.method.toLowerCase(),
        ...req.query,
        ...action?.inputs,
        ...(req.is('application/json') ? req.body : {})
      }
      params.__ow_headers['x-forwarded-for'] = '127.0.0.1'
      actionLogger.debug('params = ', params)
      let response = null
      actionLogger.debug('this is a sequence')
      // for each action in sequence, serveAction
      for (let i = 0; i < actions.length; i++) {
        const actionName = actions[i].trim()
        const action = actionConfig[packageName]?.actions[actionName]
        if (action) {
          if (!isWebAction(action)) {
            const statusCode = 404
            actionLogger.error(`${statusCode} ${statusCodeMessage(statusCode)}`)
            return res
              .status(statusCode)
              .send({ error: statusCodeMessage(statusCode) })
          }

          process.env.__OW_ACTIVATION_ID = crypto.randomBytes(16).toString('hex')
          delete require.cache[action.function]
          const actionFunction = require(action.function).main
          if (actionFunction) {
            response = await actionFunction(response ?? params)
            if (response.statusCode === 404) {
              throw response
            }
          } else {
            const message = `${actionName} action not found, or does not export main`
            actionLogger.error(message)

            return res
              .status(500)
              .send({ error: message })
          }
        }
      }

      const headers = response.headers || {}
      const statusCode = response.statusCode || 200
      actionLogger.info(`${statusCode} ${statusCodeMessage(statusCode)}`)

      return res
        .set(headers || {})
        .status(statusCode || 200)
        .send(response.body)
    } else {
      const statusCode = 404
      actionLogger.error(`${statusCode} ${statusCodeMessage(statusCode)}`)

      return res
        .status(statusCode)
        .send({ error: statusCodeMessage(statusCode) })
    }
  } else {
    if (!isWebAction(action)) {
      const statusCode = 404
      actionLogger.error(`${statusCode} ${statusCodeMessage(statusCode)}`)
      return res
        .status(statusCode)
        .send({ error: statusCodeMessage(statusCode) })
    }

    // check if action is protected
    if (action?.annotations?.['require-adobe-auth']) {
      // check if user is authenticated
      if (!req.headers.authorization) {
        const statusCode = 401
        actionLogger.error(`${statusCode} ${statusCodeMessage(statusCode)}`)

        return res
          .status(statusCode)
          .send({ error: statusCodeMessage(statusCode) })
      }
    }
    // todo: what can we learn from action.annotations?
    // todo: action.include?
    // todo: rules, triggers, ...
    // generate an activationID just like openwhisk
    process.env.__OW_ACTIVATION_ID = crypto.randomBytes(16).toString('hex')
    delete require.cache[action.function]
    const actionFunction = require(action.function).main

    const params = {
      __ow_body: req.body,
      __ow_headers: req.headers,
      __ow_path: path.join('/'),
      __ow_query: req.query,
      __ow_method: req.method.toLowerCase(),
      ...req.query,
      ...action.inputs,
      ...(req.is('application/json') ? req.body : {})
    }
    params.__ow_headers['x-forwarded-for'] = '127.0.0.1'
    actionLogger.debug('params = ', params)

    if (actionFunction) {
      try {
        process.env.__OW_ACTION_NAME = actionName
        const response = await actionFunction(params)
        delete process.env.__OW_ACTION_NAME
        const headers = response.headers || {}
        const statusCode = response.statusCode || 200

        actionLogger.info(`${statusCode} ${statusCodeMessage(statusCode)}`)

        return res
          .set(headers || {})
          .status(statusCode || 200)
          .send(response.body)
      } catch (e) {
        const statusCode = 500
        actionLogger.error(`${statusCode} ${statusCodeMessage(statusCode)}`)
        actionLogger.error(e) // log the stacktrace

        return res
          .status(500)
          .send({ error: e.message }) // only send the message, not the stacktrace
      }
    } else {
      const message = `${actionName} action not found, or does not export main`
      actionLogger.error(message)

      return res
        .status(500)
        .send({ error: message })
    }
  }
}
