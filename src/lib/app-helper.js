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
const aioLogger = require('@adobe/aio-lib-core-logging')('@adobe/aio-cli-plugin-app:lib-app-helper', { provider: 'debug' })

/**
 * @typedef ChildProcess
 */

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

module.exports = {
  runScript,
  writeConfig
}
