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

const execa = require('execa')
const fs = require('fs-extra')
const path = require('node:path')
const aioLogger = require('@adobe/aio-lib-core-logging')('@adobe/aio-cli-plugin-app-dev:lib-app-helper', { level: process.env.LOG_LEVEL, provider: 'winston' })

// eslint-disable-next-line jsdoc/require-property
/**
 * @typedef {object} ChildProcess
 */

/**
 * @param {string} hookPath to be require()'d and run. Should export an async function that takes a config object as its only argument
 * @param {object} config which will be passed to the hook
 * @returns {Promise<*>} whatever the hook returns
 */
async function runInProcess (hookPath, config) {
  if (hookPath) {
    try {
      const hook = require(path.resolve(hookPath))
      aioLogger.debug('runInProcess: running project hook in process')
      return hook(config)
    } catch (e) {
      aioLogger.debug('runInProcess: error running project hook in process, running as package script instead')
      return runScript(hookPath)
    }
  } else {
    aioLogger.debug('runInProcess: undefined hookPath')
  }
}

/**
 * Runs a package script in a child process
 *
 * @param {string} command to run
 * @param {string} dir to run command in
 * @param {string[]} cmdArgs args to pass to command
 * @returns {Promise<ChildProcess>} child process
 */
async function runScript (command, dir, cmdArgs = []) {
  if (!command) {
    return null
  }
  if (!dir) {
    dir = process.cwd()
  }

  if (cmdArgs.length) {
    command = `${command} ${cmdArgs.join(' ')}`
  }

  // we have to disable IPC for Windows (see link in debug line below)
  const isWindows = process.platform === 'win32'
  const ipc = isWindows ? null : 'ipc'

  const child = execa.command(command, {
    stdio: ['inherit', 'inherit', 'inherit', ipc],
    shell: true,
    cwd: dir,
    preferLocal: true
  })

  if (isWindows) {
    aioLogger.debug(`os is Windows, so we can't use ipc when running ${command}`)
    aioLogger.debug('see: https://github.com/adobe/aio-cli-plugin-app/issues/372')
  } else {
    // handle IPC from possible aio-run-detached script
    child.on('message', message => {
      if (message.type === 'long-running-process') {
        const { pid, logs } = message.data
        aioLogger.debug(`Found ${command} event hook long running process (pid: ${pid}). Registering for SIGTERM`)
        aioLogger.debug(`Log locations for ${command} event hook long-running process (stdout: ${logs.stdout} stderr: ${logs.stderr})`)
        process.on('exit', () => {
          try {
            aioLogger.debug(`Killing ${command} event hook long-running process (pid: ${pid})`)
            process.kill(pid, 'SIGTERM')
          } catch (_) {
          // do nothing if pid not found
          }
        })
      }
    })
  }

  return child
}

/**
 * Writes an object to a file
 *
 * @param {string} file path
 * @param {object} config object to write
 */
function writeConfig (file, config) {
  fs.ensureDirSync(path.dirname(file))
  fs.writeJSONSync(file, config, { spaces: 2 })
}

/**
 * The fastest way to determine an empty object, since it short-circuits.
 * (JSON.stringify is ten to 100 times slower objectively, and wasteful)
 * https://stackoverflow.com/a/59787784
 *
 * @param {object} obj the object to test
 * @returns {boolean} true if it's empty
 */
function isEmptyObject (obj) {
  let name
  for (name in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, name)) {
      return false
    }
  }
  return true
}

/**
 * Transforms the request body to the expected raw format.
 *
 * @param {string | object} body the request body
 * @returns {string} expected raw format (base64 or empty string)
 */
function bodyTransformToRaw (body) {
  if (typeof body === 'string') {
    return Buffer.from(body).toString('base64')
  } else if (typeof body === 'object') {
    // body can be the empty object
    if (!isEmptyObject(body)) {
      if (Buffer.isBuffer(body)) {
        return body.toString('base64')
      } else {
        return Buffer.from(JSON.stringify(body)).toString('base64')
      }
    }
  }

  return ''
}

module.exports = {
  bodyTransformToRaw,
  isEmptyObject,
  runInProcess,
  runScript,
  writeConfig
}
