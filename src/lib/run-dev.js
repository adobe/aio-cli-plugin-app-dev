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
/* eslint-disable no-template-curly-in-string */
const aioLogger = require('@adobe/aio-lib-core-logging')('@adobe/aio-cli-plugin-app-dev:run-dev', { level: process.env.LOG_LEVEL, provider: 'winston' })
const rtLib = require('@adobe/aio-lib-runtime')
const rtLibUtils = rtLib.utils
const { bundle } = require('@adobe/aio-lib-web')
const bundleServe = require('./bundle-serve')
const chalk = require('chalk')
const cloneDeep = require('lodash.clonedeep')

const SERVER_DEFAULT_PORT = 9080
const BUNDLER_DEFAULT_PORT = 9090
const Cleanup = require('./cleanup')

const utils = require('./app-helper')
const getPort = require('get-port')

/** @private */
async function runDev (config, options = {}, log = () => {}) {
  /* parcel bundle options */
  const bundleOptions = {
    shouldDisableCache: true,
    shouldContentHash: true,
    shouldOptimize: false,
    ...options.parcel
  }

  aioLogger.debug('config.manifest is', JSON.stringify(config.manifest.full.packages, null, 2))
  const actionConfig = config.manifest.full.packages

  // control variables
  const hasFrontend = config.app.hasFrontend
  const withBackend = config.app.hasBackend
  const isLocal = options.isLocal // applies only for backend

  const serverPortToUse = parseInt(process.env.PORT) || SERVER_DEFAULT_PORT
  const bundlerPortToUse = parseInt(process.env.BUNDLER_PORT) || BUNDLER_DEFAULT_PORT

  const serverPort = await getPort({ port: serverPortToUse })
  const bundlerPort = await getPort({ port: bundlerPortToUse })

  if (serverPort !== serverPortToUse) {
    log(`Could not use server port:${serverPortToUse}, using port:${serverPort} instead`)
  }

  if (bundlerPort !== bundlerPortToUse) {
    log(`Could not use bundler port:${bundlerPortToUse}, using port:${bundlerPort} instead`)
  }
  aioLogger.debug(`hasFrontend ${hasFrontend}`)
  aioLogger.debug(`withBackend ${withBackend}`)
  aioLogger.debug(`isLocal ${isLocal}`)

  let frontEndUrl

  // state
  const devConfig = cloneDeep(config)
  devConfig.envFile = '.env'

  const cleanup = new Cleanup()
  let defaultBundler = null

  try {
    // Build Phase - actions
    if (withBackend) {
      rtLibUtils.checkOpenWhiskCredentials(devConfig)
    }

    // Build Phase - Web Assets, build, inject action url json
    let urls = {}
    if (config.app.hasBackend) {
      urls = rtLibUtils.getActionUrls(devConfig, true /* isRemoteDev */, false /* isLocalDev */, false /* legacy */)
      urls = Object.entries(urls).reduce((acc, [key, value]) => {
        const url = new URL(value)
        url.port = serverPort
        url.hostname = 'localhost'
        acc[key] = url.toString()
        return acc
      }, {})

      log(chalk.blue(chalk.bold('Your actions:')))
      Object.values(urls).forEach(url => log(chalk.blue(chalk.bold(`  -> ${url}`))))
    }

    if (hasFrontend) {
      utils.writeConfig(devConfig.web.injectedConfig, urls)

      const entries = config.web.src + '/**/*.html'
      bundleOptions.serveOptions = {
        port: bundlerPort,
        https: bundleOptions.https
      }
      // TODO: Move this and bundleServe to aio-lib-web so we can remove the parcel dependency
      bundleOptions.additionalReporters = [
        { packageName: '@parcel/reporter-cli', resolveFrom: __filename }
      ]
      defaultBundler = await bundle(entries, config.web.distDev, bundleOptions, log)
    }

    // Deploy Phase - http server
    const options = {
      port: serverPort,
      https: bundleOptions.https,
      dist: config.web.distDev,
      hasFrontend
    }
    const result = await bundleServe(defaultBundler, options, log, actionConfig)
    const { url, serverCleanup } = result
    frontEndUrl = url
    cleanup.add(() => serverCleanup(), 'cleaning up serve...')

    if (!frontEndUrl) {
      devConfig.app.hasFrontend = false
    }

    cleanup.wait()
  } catch (e) {
    aioLogger.error('unexpected error, cleaning up...')
    await cleanup.run()
    throw e
  }
  return frontEndUrl
}

module.exports = runDev
