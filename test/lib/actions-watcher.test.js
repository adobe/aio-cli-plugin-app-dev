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
const actionsWatcher = require('../../src/lib/actions-watcher')
const chokidar = require('chokidar')
const mockLogger = require('@adobe/aio-lib-core-logging')
const util = require('node:util')
const { buildActions } = require('@adobe/aio-lib-runtime')
const sleep = util.promisify(setTimeout)
const cloneDeep = require('lodash.clonedeep')

jest.mock('chokidar')
jest.mock('@adobe/aio-lib-runtime')

beforeEach(() => {
  jest.useFakeTimers()

  chokidar.watch.mockReset()
  mockLogger.mockReset()
  buildActions.mockReset()
})

test('exports', () => {
  expect(typeof actionsWatcher).toEqual('function')
})

test('run and cleanup', async () => {
  let onChangeHandler = null

  const mockWatcherInstance = {
    on: jest.fn((event, handler) => {
      if (event === 'change') {
        onChangeHandler = handler
      }
    }),
    close: jest.fn()
  }
  chokidar.watch.mockImplementation(() => mockWatcherInstance)

  const config = {
    actions: {
      src: 'actions'
    }
  }
  const { watcher, watcherCleanup } = await actionsWatcher({ config })
  expect(typeof watcher).toEqual('object')
  expect(typeof watcherCleanup).toEqual('function')

  watcherCleanup()

  expect(mockWatcherInstance.on).toHaveBeenCalledWith('change', onChangeHandler)
  expect(chokidar.watch).toHaveBeenCalledWith(config.actions.src)
  expect(mockWatcherInstance.close).toHaveBeenCalled()
})

test('onChange handler', async () => {
  let onChangeHandler = null
  const mockWatcherInstance = {
    on: jest.fn((event, handler) => {
      if (event === 'change') {
        onChangeHandler = handler
      }
    }),
    close: jest.fn()
  }
  chokidar.watch.mockImplementation(() => mockWatcherInstance)

  const config = {
    actions: {
      src: 'actions'
    }
  }
  await actionsWatcher({ config })
  expect(typeof onChangeHandler).toEqual('function')

  // first onchange
  await onChangeHandler('actions')
  expect(buildActions).toHaveBeenCalledTimes(1)
})

test('onChange handler called multiple times', async () => {
  let onChangeHandler = null
  const mockWatcherInstance = {
    on: jest.fn((event, handler) => {
      if (event === 'change') {
        onChangeHandler = handler
      }
    }),
    close: jest.fn()
  }
  chokidar.watch.mockImplementation(() => mockWatcherInstance)

  const config = {
    actions: {
      src: 'actions'
    }
  }
  await actionsWatcher({ config })
  expect(typeof onChangeHandler).toEqual('function')

  // first onchange
  buildActions.mockImplementation(async () => await sleep(2000))
  onChangeHandler('actions')
  buildActions.mockImplementation(async () => { throw new Error() })

  // second onchange
  onChangeHandler('actions')

  await jest.runAllTimers()

  expect(buildActions).toHaveBeenCalledTimes(1)
})

test('onChange handler calls buildActions with filterActions', async () => {
  let onChangeHandler = null
  const mockWatcherInstance = {
    on: jest.fn((event, handler) => {
      if (event === 'change') {
        onChangeHandler = handler
      }
    }),
    close: jest.fn()
  }
  chokidar.watch.mockImplementation(() => mockWatcherInstance)

  const config = {
    actions: {
      src: 'actions'
    }
  }
  await actionsWatcher({ config })
  expect(typeof onChangeHandler).toEqual('function')

  const filePath = process.platform === 'win32' ? '\\myactions\\action.js' : '/myactions/action.js'

  buildActions.mockImplementation(async () => await sleep(5000))
  onChangeHandler(filePath)

  await jest.runAllTimers()

  expect(buildActions).toHaveBeenCalledWith(
    {}, ['action']
  )
})

// test('on non-action file changed, skip build&deploy', async () => {
//   const { application } = createAppConfig()
//   const cloneApplication = cloneDeep(application)
//   Object.entries(cloneApplication.manifest.full.packages).forEach(([, pkg]) => {
//     if (pkg.actions) {
//       delete pkg.actions
//     }
//   })
//   let onChangeHandler = null
//   const mockWatcherInstance = {
//     on: jest.fn((event, handler) => {
//       if (event === 'change') {
//         onChangeHandler = handler
//       }
//     }),
//     close: jest.fn()
//   }
//   chokidar.watch.mockImplementation(() => mockWatcherInstance)

//   const log = jest.fn()
//   await actionsWatcher({ config: cloneApplication, log })
//   expect(typeof onChangeHandler).toEqual('function')

//   buildAndDeploy.mockImplementation(async () => await sleep(2000))
//   onChangeHandler('/myactions/utils.js')

//   await jest.runAllTimers()

//   expect(buildAndDeploy).not.toHaveBeenCalled()
// })