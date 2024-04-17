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
const https = require('node:https') // built in
const crypto = require('node:crypto')

let actionConfig = null

module.exports = async (bundler, options, log = () => { }, _actionConfig) => {
  actionConfig = _actionConfig

  process.env.__OW_API_KEY = process.env.AIO_runtime_auth
  process.env.__OW_NAMESPACE = process.env.AIO_runtime_namespace

  const cert = fs.readFileSync(options.https.cert, 'utf-8')
  const key = fs.readFileSync(options.https.key, 'utf-8')
  const serverOptions = {
    key,
    cert
  }

  try {
    const { bundleGraph, buildTime } = await bundler.run()
    const bundles = bundleGraph.getBundles()
    console.log(`✨ Built ${bundles.length} bundles in ${buildTime}ms!`)
  } catch (err) {
    console.log(err.diagnostics)
  }

  const app = express()
  app.use(express.json())
  app.use(express.static(options.dist))
  // DONE: serveAction needs to clear cache for each request, so we get live changes
  app.all('/api/v1/web/*', serveAction)

  const port = options.serveOptions.port || Number(process.env.PORT || 9000)
  const server = https.createServer(serverOptions, app)
  server.listen(port, () => {
    console.log('server running on port : ' + port)
  })
  const url = `${options.serveOptions.https ? 'https:' : 'http:'}//localhost:${port}`

  const serverCleanup = async () => {
    console.debug('shutting down server ...')
    await app.close()
    await server.close()
  }

  return {
    url,
    serverCleanup
  }
}

const serveAction = async (req, res, next) => {
  const url = req.params[0]
  const [packageName, actionName, ...path] = url.split('/')
  const action = actionConfig[packageName]?.actions[actionName]

  if (!action) {
    // action could be a sequence ... todo: refactor these 2 paths to 1 action runner
    const sequence = actionConfig[packageName]?.sequences[actionName]
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
      console.log('params = ', params)
      let response = null
      console.log('this is a sequence')
      // for each action in sequence, serveAction
      for (let i = 0; i < actions.length; i++) {
        const actionName = actions[i].trim()
        const action = actionConfig[packageName]?.actions[actionName]
        if (action) {
          process.env.__OW_ACTIVATION_ID = crypto.randomBytes(16).toString('hex')
          delete require.cache[action.function]
          const actionFunction = require(action.function).main
          if (actionFunction) {
            response = await actionFunction(response ?? params)
            if (response.statusCode === 404) {
              throw response
            }
          } else {
            return res
              .status(500)
              .send({ error: `${actionName} action not found, or does not export main` })
          }
        }
      }
      const headers = response.headers || {}
      const status = response.statusCode || 200
      return res
        .set(headers || {})
        .status(status || 200)
        .send(response.body)
    } else {
      return res
        .status(404)
        .send({ error: 'not found (yet)' })
    }
  } else {
    // check if action is protected
    if (action?.annotations?.['require-adobe-auth']) {
      // check if user is authenticated
      if (!req.headers.authorization) {
        return res
          .status(401)
          .send({ error: 'unauthorized' })
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
    console.log('params = ', params)

    if (actionFunction) {
      try {
        const response = await actionFunction(params)
        const headers = response.headers || {}
        const status = response.statusCode || 200

        return res
          .set(headers || {})
          .status(status || 200)
          .send(response.body)
      } catch (e) {
        return res
          .status(500)
          .send({ error: e.message })
      }
    } else {
      return res
        .status(500)
        .send({ error: `${actionName} action not found, or does not export main` })
    }
  }
}
