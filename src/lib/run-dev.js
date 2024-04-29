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

const aioLogger = require('@adobe/aio-lib-core-logging')('@adobe/aio-cli-plugin-app-dev:run-dev', { level: process.env.LOG_LEVEL, provider: 'winston' })
const { serve } = require('./serve')
const cloneDeep = require('lodash.clonedeep')
const Cleanup = require('./cleanup')

/**
 * @typedef {object} RunDevReturnObject
 * @property {string} frontendUrl the url for the front-end (if any)
 * @property {object} actionUrls the object with a list of action urls
 */

/**
 * The serve function that runs the http server to serve the actions, and the web source.
 *
 * @param {object} options the options for the http server
 * @param {object} config the config for the app
 * @param {object} _inprocHookRunner the in-process hook runner for the app
 * @returns {RunDevReturnObject} the object returned
 */
async function runDev (options = {}, config, _inprocHookRunner) {
  /* parcel bundle options */
  const bundleOptions = {
    shouldDisableCache: true,
    shouldContentHash: true,
    shouldOptimize: false
  }

  aioLogger.debug('config.manifest is', JSON.stringify(config.manifest.full.packages, null, 2))

  const devConfig = cloneDeep(config)
  const cleanup = new Cleanup()

  try {
    const serveOptions = {
      bundle: bundleOptions,
      parcel: options.parcel
    }

    const { frontendUrl, actionUrls, serverCleanup } = await serve(serveOptions, devConfig, _inprocHookRunner)
    cleanup.add(() => serverCleanup(), 'cleaning up serve...')

    cleanup.wait()
    return { frontendUrl, actionUrls }
  } catch (e) {
    aioLogger.error('unexpected error, cleaning up...')
    await cleanup.run()
    throw e
  }
}

module.exports = runDev
