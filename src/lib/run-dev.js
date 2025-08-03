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

const cloneDeep = require('lodash.clonedeep')
const express = require('express')
const fs = require('fs-extra')
const path = require('node:path')
const https = require('node:https')
const crypto = require('node:crypto')
const livereload = require('livereload')
const connectLiveReload = require('connect-livereload')
const { bundle } = require('@adobe/aio-lib-web')
const getPort = require('get-port')
const rtLib = require('@adobe/aio-lib-runtime')
const coreLogger = require('@adobe/aio-lib-core-logging')
const { getReasonPhrase } = require('http-status-codes')

const utils = require('./app-helper')
const { SERVER_HOST, SERVER_DEFAULT_PORT, BUNDLER_DEFAULT_PORT, DEV_API_PREFIX, DEV_API_WEB_PREFIX, BUNDLE_OPTIONS, CHANGED_ASSETS_PRINT_LIMIT } = require('./constants')
const RAW_CONTENT_TYPES = ['application/octet-stream', 'multipart/form-data']

/* global Request, Response */

/**
 * @typedef {object} ActionRequestContext
 * @property {object} contextItem the action or sequence object
 * @property {string} contextItemName the action or sequence name
 * @property {object} contextItemParams the action or sequence params
 * @property {string} packageName the package name
 * @property {object} actionConfig the whole action config
 */

/**
 * @typedef {object} RunDevReturnObject
 * @property {string} frontendUrl the url for the front-end (if any)
 * @property {object} actionUrls the object with a list of action urls
 */

/**
 * @typedef {object} ActionResponse
 * @property {object} headers the response headers
 * @property {object} statusCode the HTTP status code
 * @property {object} body the response body
 */

/**
 * The function that runs the http server to serve the actions, and the web source.
 *
 * @param {object} runOptions the run options
 * @param {object} config the config for the app
 * @param {object} _inprocHookRunner the in-process hook runner for the app
 * @returns {RunDevReturnObject} the object returned
 */
async function runDev (runOptions, config, _inprocHookRunner) {
  const bundleOptions = cloneDeep(BUNDLE_OPTIONS)
  const devConfig = cloneDeep(config)
  const distFolder = devConfig.actions.dist

  const serveLogger = coreLogger('serve', { level: process.env.LOG_LEVEL, provider: 'winston' })
  serveLogger.debug('config.manifest is', JSON.stringify(devConfig.manifest?.full?.packages, null, 2))

  const actionConfig = devConfig.manifest?.full?.packages
  const hasFrontend = devConfig.app.hasFrontend
  const hasBackend = devConfig.app.hasBackend
  const httpsSettings = runOptions?.parcel?.https

  serveLogger.debug('hasBackend', hasBackend)
  serveLogger.debug('hasFrontend', hasFrontend)
  serveLogger.debug('httpsSettings', JSON.stringify(httpsSettings, null, 2))

  // set up environment variables for openwhisk
  process.env.__OW_API_KEY = process.env.AIO_RUNTIME_AUTH
  process.env.__OW_NAMESPACE = process.env.AIO_RUNTIME_NAMESPACE
  process.env.__OW_API_HOST = process.env.AIO_RUNTIME_APIHOST
  // set up environment variables for aio
  // this can be read as truthy, it will not exist in Runtime
  // ex. console.log('AIO_DEV ', process.env.AIO_DEV ? 'dev' : 'prod')
  process.env.AIO_DEV = 'true'

  const serverPortToUse = parseInt(process.env.PORT) || SERVER_DEFAULT_PORT
  const serverPort = await getPort({ port: serverPortToUse })

  let actionUrls = {}
  if (hasBackend) {
    // note: 3rd arg, _isLocalDev is not used in RuntimeLib
    // there is no such thing as --local anymore
    const tempActionUrls = rtLib.utils.getActionUrls(devConfig, true /* isRemoteDev */, false /* isLocalDev */, false /* legacy */)
    actionUrls = Object.entries(tempActionUrls).reduce((acc, [key, value]) => {
      const url = new URL(value)
      url.port = serverPort
      url.hostname = SERVER_HOST
      acc[key] = url.toString()
      return acc
    }, {})
  }

  let serverOptions
  if (httpsSettings) {
    const cert = fs.readFileSync(httpsSettings.cert, 'utf-8')
    const key = fs.readFileSync(httpsSettings.key, 'utf-8')
    serverOptions = {
      key,
      cert
    }
  }

  let subscription
  if (hasFrontend) {
    const liveReloadServer = livereload.createServer({ https: serverOptions })
    liveReloadServer.watch(devConfig.web.distDev)
    serveLogger.info(`Watching web folder ${devConfig.web.distDev}...`)
    liveReloadServer.server.once('connection', () => {
      setTimeout(() => {
        liveReloadServer.refresh('/')
      }, 100)
    })

    utils.writeConfig(devConfig.web.injectedConfig, actionUrls)

    const bundlerPortToUse = parseInt(process.env.BUNDLER_PORT) || BUNDLER_DEFAULT_PORT
    const bundlerPort = await getPort({ port: bundlerPortToUse })

    if (bundlerPort !== bundlerPortToUse) {
      serveLogger.info(`Could not use bundler port ${bundlerPortToUse}, using port ${bundlerPort} instead`)
    }

    const entries = devConfig.web.src + '/**/*.html'
    bundleOptions.serveOptions = {
      port: bundlerPort,
      https: httpsSettings
    }

    const bundler = await bundle(entries, devConfig.web.distDev, bundleOptions, serveLogger.debug.bind(serveLogger))
    await bundler.run() // run it once

    subscription = await bundler.watch((err, event) => {
      if (err) {
        // fatal error
        throw err
      }

      serveLogger.info(`${event.changedAssets.size} static asset(s) changed`)
      const limit = runOptions.verbose ? Infinity : CHANGED_ASSETS_PRINT_LIMIT
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
  }

  const app = express()

  const middlewareOptions = {
    inflate: false, // the same behavior in the cloud
    limit: '1MB' // the same limits in the cloud
  }
  app.use(express.text({ ...middlewareOptions, type: 'text/plain' }))
  app.use(express.json({ ...middlewareOptions, strict: false }))
  app.use(express.urlencoded({ ...middlewareOptions, extended: true }))
  app.use(express.raw({ ...middlewareOptions, type: RAW_CONTENT_TYPES }))

  if (hasFrontend) {
    app.use(connectLiveReload())
    app.use(express.static(devConfig.web.distDev))
  }

  // serveAction needs to clear cache for each request, so we get live changes
  app.all(`/${DEV_API_WEB_PREFIX}/*`, (req, res) => serveWebAction(req, res, actionConfig, distFolder))
  app.all(`/${DEV_API_PREFIX}/*`, (req, res) => serveWebAction(req, res, actionConfig, distFolder))

  const server = https.createServer(serverOptions, app)
  server.listen(serverPort, SERVER_HOST, () => {
    if (serverPort !== serverPortToUse) {
      serveLogger.info(`Could not use server port ${serverPortToUse}, using port ${serverPort} instead`)
    }
    serveLogger.info(`server running on port : ${serverPort}`)
  })

  let frontendUrl
  if (hasFrontend) {
    frontendUrl = `${httpsSettings ? 'https:' : 'http:'}//${SERVER_HOST}:${serverPort}`
  }

  const serverCleanup = async () => {
    serveLogger.debug('shutting down http server ...')
    await server?.close()
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
  return getReasonPhrase(statusCode)
}

/**
 * Determines if an action is a web action.
 *
 * @param {object} action the action object
 * @returns {boolean} true if it is a web action
 */
function isWebAction (action) {
  const toBoolean = (value) => (value !== 'no' && value !== 'false' && value !== false && value !== undefined)

  const webExportValue = action?.annotations?.['web-export']
  const webValue = action?.web

  return (toBoolean(webExportValue) || toBoolean(webValue))
}

/**
 * Determines if an action is a raw web action.
 *
 * @param {object} action the action object
 * @returns {boolean} true if it is a web action
 */
function isRawWebAction (action) {
  const raw = 'raw'
  const webExportValue = action?.annotations?.['web-export']
  const webValue = action?.web

  return (webExportValue === raw || webValue === raw)
}

/**
 * Invoke a sequence.
 *
 * @param {object} params the parameters
 * @param {ActionRequestContext} params.actionRequestContext the ActionRequestContext object
 * @param {object} params.logger the logger object
 * @returns {ActionResponse} the action response object
 */
async function invokeSequence ({ actionRequestContext, logger }) {
  const { distFolder, contextActionLoader, contextItem: sequence, contextItemParams: sequenceParams, actionConfig, packageName } = actionRequestContext
  const actions = sequence?.actions?.split(',') ?? []
  logger.info('actions to call', sequence?.actions)

  // for the first action, we pass in the sequence params
  // subsequent actions get the last action's response as params (plus select params)
  let lastActionResponse = null

  for (let i = 0; i < actions.length; i++) {
    const actionName = actions[i].trim()
    const action = actionConfig?.[packageName]?.actions[actionName]
    const actionParams = (i === 0)
      ? sequenceParams
      : {
          __ow_headers: sequenceParams.__ow_headers,
          __ow_method: sequenceParams.__ow_method,
          ...actionConfig?.[packageName]?.inputs,
          ...action?.inputs,
          ...lastActionResponse
        }

    const context = { distFolder, contextActionLoader, packageName, contextItem: action, contextItemName: actionName, contextItemParams: actionParams }
    if (action) {
      logger.info('calling action', actionName)
      lastActionResponse = await invokeAction({ actionRequestContext: context, logger })
      const isError = lastActionResponse.statusCode >= 400
      logger.debug('action response for', actionName, JSON.stringify(lastActionResponse, null, 2))
      // we short circuit the actions if the status code is an error
      if (isError) {
        break
      }
    } else {
      logger.error(`Sequence component ${actionName} does not exist.`)
      lastActionResponse = { statusCode: 400, body: { error: 'Sequence component does not exist.' } }
      break
    }
  }

  return lastActionResponse
}

/**
 * Load the action function based on the context.
 *
 * @param {object} params the parameters
 * @param {string} params.distFolder the dist folder
 * @param {string} params.packageName the package name
 * @param {string} params.actionName the action name
 * @returns {object} the action function
 */
async function defaultActionLoader ({ distFolder, packageName, actionName }) {
  const actionFolder = path.join(distFolder, packageName, actionName)
  const actionPath = `${actionFolder}-temp/index.js`
  delete require.cache[actionPath]
  return require(actionPath)?.main
}

/**
 * Invoke an action.
 *
 * @param {object} params the parameters
 * @param {ActionRequestContext} params.actionRequestContext the ActionRequestContext object
 * @param {object} params.logger the logger object
 * @returns {ActionResponse} the action response
 */
async function invokeAction ({ actionRequestContext, logger }) {
  const { distFolder, packageName, contextActionLoader, contextItem: action, contextItemName: actionName, contextItemParams: params } = actionRequestContext
  // check if action is protected
  if (action?.annotations?.['require-adobe-auth']) {
    // http header keys are case-insensitive
    const owHeaders = Object.keys(params.__ow_headers ?? {})
      .reduce((obj, header) => {
        obj[header.toLowerCase()] = params.__ow_headers[header]
        return obj
      }, {})

    const requiredAuthHeaders = ['authorization', 'x-gw-ims-org-id']
    for (const headerKey of requiredAuthHeaders) {
      if (!owHeaders?.[headerKey]) {
        return {
          statusCode: 401,
          body: { error: `cannot authorize request, reason: missing ${headerKey} header` }
        }
      }
    }
  }

  // if we run an action, we will restore the process.env after the call
  // we must do this before we load the action because code can execute on require/import
  const preCallEnv = { ...process.env }
  const originalCwd = process.cwd()
  // generate an activationID just like openwhisk
  process.env.__OW_ACTIVATION_ID = crypto.randomBytes(16).toString('hex')

  let actionFunction
  try {
    actionFunction = await contextActionLoader({ distFolder, packageName, actionName })
  } catch (e) {
    const message = `${actionName} action not found, or does not export main`
    logger.error(message)
    return {
      statusCode: 400,
      body: { error: `Response is not valid 'message/http'. ${message}` }
    }
  }

  if (actionFunction) {
    try {
      process.chdir(path.dirname(action.function))
      process.env.__OW_ACTION_NAME = `/${process.env.__OW_NAMESPACE}/${packageName}/${actionName}`
      const response = await actionFunction(params)
      delete process.env.__OW_ACTION_NAME

      let statusCode, headers, body

      if (response) {
        headers = response.headers
        /* short-circuit: if there is an error property in the dictionary, then we only return the error contents
           e.g.
              {
                error: {
                  statusCode: 400,
                  body: {
                    error: 'some error message'
                  }
                }
              }
        */
        if (response.error) {
          statusCode = response.error.statusCode
          body = response.error.body
        } else {
          statusCode = response.statusCode
          body = response.body
        }
      } else { // no response data
        statusCode = 204
        body = ''
      }

      statusCode = statusCode || 200 // this is the OW default if omitted
      body = body || ''
      const isError = statusCode >= 400
      const isObject = typeof response === 'object' && !Array.isArray(response)

      return {
        ...(isObject && !isError ? response : {}), // pass all the other properties as well if an object, and not an error
        headers,
        statusCode,
        body
      }
    } catch (e) {
      const statusCode = 400
      logger.error(e) // log the stacktrace

      return {
        statusCode,
        body: { error: 'Response is not valid \'message/http\'.' }
      }
    } finally {
      logger.debug('restoring process.env and cwd')
      process.env = preCallEnv // restore the environment variables
      process.chdir(originalCwd) // restore the original working directory
    }
  } else {
    // this case the action returned an error object, so we should use it
    const statusCode = 400
    logger.error(`${actionName} action not found, or does not export main`)
    const body = { error: 'Response is not valid \'message/http\'.' }

    return {
      statusCode,
      body
    }
  }
}

/**
 * Sends a http status response according to the parameters.
 *
 * @param {object} params the parameters
 * @param {ActionResponse} params.actionResponse the actionResponse
 * @param {Response} params.res the http response object
 * @param {object} params.logger the logger object
 * @returns {Response} the response
 */
function httpStatusResponse ({ actionResponse, res, logger }) {
  const { statusCode, headers, body } = actionResponse
  const isError = statusCode >= 400
  const logMessage = `${statusCode} ${statusCodeMessage(statusCode)}`

  if (isError) {
    logger.error(logMessage)
  } else {
    logger.info(logMessage)
  }

  if (headers) {
    res.set(headers)
  }

  return res
    .status(statusCode)
    .send(body)
}

/**
 * Express path handler to handle web action API calls.
 *
 * @param {Request} req the http request
 * @param {Response} res the http response
 * @param {object} actionConfig the action configuration
 * @param {string} distFolder the dist folder (contains built action source)
 * @param {Function} actionLoader function that will load an action
 * @returns {Response} the response
 */
async function serveWebAction (req, res, actionConfig, distFolder, actionLoader = defaultActionLoader) {
  const url = req.params[0]
  const [packageName, contextItemName, ...restofPath] = url.split('/')
  const action = actionConfig[packageName]?.actions?.[contextItemName]
  const sequence = actionConfig[packageName]?.sequences?.[contextItemName]
  const owPath = restofPath.join('/')
  const combinedInputs = { ...actionConfig?.[packageName]?.inputs, ...action?.inputs }

  let invoker, contextItem

  if (sequence) {
    invoker = invokeSequence
    contextItem = sequence
  } else if (action) {
    invoker = invokeAction
    contextItem = action
  } else {
    invoker = null
  }

  const actionLogger = coreLogger(`serveWebAction ${contextItemName}`, { level: process.env.LOG_LEVEL, provider: 'winston' })
  const contextItemParams = createActionParametersFromRequest({ req, contextItem, actionInputs: combinedInputs })
  contextItemParams.__ow_path = owPath
  actionLogger.debug('contextItemParams =', contextItemParams)

  const actionRequestContext = {
    packageName,
    contextItemName,
    contextItemParams,
    actionConfig,
    distFolder,
    contextActionLoader: actionLoader
  }

  if (invoker && !sequence) {
    if (!isWebAction(contextItem)) {
      actionLogger.warn('serving non-web action : this call will fail without credentials when deployed.')
    }
    actionRequestContext.contextItem = contextItem
    const actionResponse = await invoker({ actionRequestContext, logger: actionLogger })
    actionLogger.debug('response for', contextItemName, JSON.stringify(actionResponse, null, 2))
    return httpStatusResponse({ actionResponse, res, logger: actionLogger })
  } else {
    const actionResponse = { statusCode: 404, body: { error: 'The requested resource does not exist.' } }
    return httpStatusResponse({ actionResponse, res, logger: actionLogger })
  }
}

/**
 * Interpolates variables in a string with values from a props object.
 *
 * @param {string} valueString the string to interpolate
 * @param {object} props the object containing the variable values
 * @returns {string} the interpolated string
 * This function now uses the regular expression
 * /\$\{(\w+)\}|\$(\w+)|\{(\w+)\}/g
 * which matches either
 * ${VAR_NAME}, $VAR_NAME, or {VAR_NAME}.
 * The | character in the regular expression denotes "or", so it matches either
 * pattern. The replace function then uses the matched variable name to look up
 * the corresponding value in the provided props object. If the variable is not
 * defined in the props object, it replaces it with an empty string.
 */
function interpolate (valueString, props) {
  // careful with non-string values
  if (typeof valueString !== 'string') {
    if (Array.isArray(valueString)) {
      return valueString.map((value) => interpolate(value, props))
    } else {
      return valueString
    }
  }
  // replace ${VAR_NAME}, $VAR_NAME, or {VAR_NAME} with values from props, but not if they are enclosed in quotes
  // if key is not found on props, the value is returned as is (no replacement)
  const retStr = valueString.replace(/(?<!['"`])\$\{(\w+)\}(?!['"`])|(?<!['"`])\$(\w+)(?!['"`])|(?<!['"`])\{(\w+)\}(?!['"`])/g,
    (_, varName1, varName2, varName3) => {
      const varName = varName1 || varName2 || varName3
      return Object.prototype.hasOwnProperty.call(props, varName) ? props[varName] : ''
    })
  return retStr
}

/**
 * Create action parameters.
 *
 * @param {object} param the parameters
 * @param {Request} param.req the request object
 * @param {object} param.contextItem the context item (action or sequence)
 * @param {object} param.actionInputs the action inputs
 * @returns {object} the action parameters
 */
function createActionParametersFromRequest ({ req, contextItem, actionInputs = {} }) {
  // note we clone action so if env vars change between runs it is reflected - jm
  const action = { inputs: {} }
  Object.entries(actionInputs).forEach(([key, value]) => {
    action.inputs[key] = interpolate(value, process.env)
  })

  const params = {
    __ow_headers: {
      ...req.headers,
      'x-forwarded-for': '127.0.0.1'
    },
    __ow_query: req.query,
    __ow_method: req.method.toLowerCase(),
    ...req.query,
    ...action.inputs
  }

  const isJson = req.is('application/json')
  const isFormData = req.is('application/x-www-form-urlencoded')
  const isRaw = isRawWebAction(contextItem)

  if (params.__ow_method === 'post' && req.body !== null) {
    if (isRaw) {
      if (isFormData) {
        params.__ow_body = new URLSearchParams(req.body).toString() // convert json back to query string
      } else {
        params.__ow_body = utils.bodyTransformToRaw(req.body)
      }
    } else if (isJson || isFormData) { // body is parsed by express middleware into json
      Object.assign(params, req.body)
    } else {
      params.__ow_body = utils.bodyTransformToRaw(req.body)
    }
  }

  return params
}

module.exports = {
  defaultActionLoader,
  runDev,
  interpolate,
  serveWebAction,
  httpStatusResponse,
  invokeAction,
  invokeSequence,
  statusCodeMessage,
  isRawWebAction,
  isWebAction,
  createActionParametersFromRequest
}
