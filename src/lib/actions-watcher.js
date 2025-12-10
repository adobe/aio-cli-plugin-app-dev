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
const upath = require('upath')
const chokidar = require('chokidar')
const coreLogger = require('@adobe/aio-lib-core-logging')
const { buildActions } = require('@adobe/aio-lib-runtime')
const watchLogger = coreLogger('watcher', { level: process.env.LOG_LEVEL, provider: 'winston' })

/**
 * Handle agent reload after build completes
 * @param {Array<string>} rebuiltActionNames - Names of actions that were rebuilt
 * @param {object} agentContext - Agent context with agents, runner, restate
 */
async function handleAgentReload (rebuiltActionNames, agentContext) {
  const { agents, runner, restate } = agentContext
  
  // Find which rebuilt actions are agents
  const rebuiltAgents = agents.filter(agent => 
    rebuiltActionNames.includes(agent.name)
  )
  
  if (rebuiltAgents.length === 0) {
    return // No agents were rebuilt
  }
  
  watchLogger.info(`Reloading ${rebuiltAgents.length} agent(s)...`)
  
  try {
    // Restart agent processes
    await runner.restartAgents(rebuiltAgents)
    
    // Re-register with Restate
    const agentInfo = runner.getAgentInfo()
    await restate.registerAllAgents(agentInfo)
    
    watchLogger.info('✓ Agents reloaded successfully!')
  } catch (err) {
    watchLogger.error('Error reloading agents:', err.message)
  }
}

/**
 * @typedef {object} WatchReturnObject
 * @property {object} watcher the watcher object
 * @property {Function} cleanup callback function to cleanup available resources
 */

/**
 * @typedef {object} WatcherOptions
 * @property {object} config the app config (see src/lib/config-loader.js)
 * @property {boolean} isLocal whether the deployment is local or not
 * @property {Function} log the app logger
 * @property {object} [watcher] the watcher itself
 */

/**
 * Create a watcher.
 *
 * @param {WatcherOptions} watcherOptions the options for the watcher
 * @returns {WatchReturnObject} the WatchReturnObject
 */
async function createWatcher (watcherOptions) {
  const { config } = watcherOptions

  watchLogger.info(`watching action files at ${config.actions.src}...`)
  const watcher = chokidar.watch(config.actions.src)
  const onChangeHandler = createChangeHandler({ ...watcherOptions, watcher })

  watcher.on('change', onChangeHandler)

  const watcherCleanup = async () => {
    watchLogger.debug('stopping action watcher...')
    await watcher.close()
  }

  return {
    onChangeHandler,
    watcher,
    watcherCleanup
  }
}

/**
 * Simple queue
 */
class Queue {
  constructor () {
    this.queue = []
  }

  get items () {
    return this.queue
  }

  get length () {
    return this.queue.length
  }

  enqueue (element) {
    this.queue.push(element)
  }

  dequeue () {
    return this.queue.shift()
  }
}

/**
 * Create the onChange handler for the watcher.
 *
 * @param {WatcherOptions} watcherOptions the options for the watcher
 * @returns {Function} the onchange handler for the watcher
 */
function createChangeHandler (watcherOptions) {
  const { config, watcher, actionNameFromPath = getActionNameFromPath, agentContext } = watcherOptions

  let buildInProgress = false
  const queue = new Queue()

  const processChange = async (filePath) => {
    try {
      watchLogger.info(`${filePath} has changed. Building action.`)
      const filterActions = actionNameFromPath(filePath, watcherOptions)
      if (!filterActions.length) {
        watchLogger.debug('A non-action file was changed, no build was done.')
      } else {
        await buildActions(config, filterActions, false /* skipCheck */, false /* emptyDist */)
        watchLogger.info(`Build was successful for: ${filterActions.join(',')}`)
        
        // If agent mode, check if any rebuilt actions are agents and restart them
        if (agentContext) {
          await handleAgentReload(filterActions, agentContext)
        }
      }
    } catch (err) {
      watchLogger.error('Error encountered while building actions. Stopping auto refresh.')
      console.error(err)
      await watcher.close()
    }
  }

  return async (filePath) => {
    if (buildInProgress) {
      watchLogger.debug(`${filePath} has changed. A build is in progress. This change will be built after completion of current build.`)
      queue.enqueue(filePath)
      return
    }

    buildInProgress = true

    await processChange(filePath)

    // process the rest of the queue, if any
    let fileToProcess = queue.dequeue()
    while (fileToProcess) {
      await processChange(fileToProcess)
      fileToProcess = queue.dequeue()
    }

    buildInProgress = false
  }
}

/**
 * Util function which returns the actionName from the filePath.
 *
 * @param {string} filePath  path of the file
 * @param {WatcherOptions} watcherOptions the options for the watcher
 * @returns {Array<string>}  All of the actions which match the modified path
 */
function getActionNameFromPath (filePath, watcherOptions) {
  const actionNames = []
  const unixFilePath = upath.toUnix(filePath)
  const { config } = watcherOptions
  Object.entries(config.manifest.full.packages).forEach(([, pkg]) => {
    if (pkg.actions) {
      Object.entries(pkg.actions).forEach(([actionName, action]) => {
        const unixActionFunction = upath.toUnix(action.function)
        if (unixActionFunction.includes(unixFilePath)) {
          actionNames.push(actionName)
        }
      })
    }
  })
  return actionNames
}

module.exports = {
  getActionNameFromPath,
  createWatcher,
  Queue
}
