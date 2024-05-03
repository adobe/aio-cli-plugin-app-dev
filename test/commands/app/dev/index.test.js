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

/* eslint-disable no-unused-vars */
const TheCommand = require('../../../../src/commands/app/dev')
const BaseCommand = require('../../../../src/BaseCommand')

const cloneDeep = require('lodash.clonedeep')
const open = require('open')
const { ux } = require('@oclif/core')

const { runDev: mockRunDev } = require('../../../../src/lib/run-dev')
const mockHelpers = require('../../../../src/lib/app-helper')
const mockFS = require('fs-extra')
const mockConfig = require('@adobe/aio-lib-core-config')

jest.mock('open', () => jest.fn())
jest.mock('../../../../src/lib/run-dev')
jest.mock('../../../../src/lib/app-helper')
jest.mock('fs-extra')

jest.mock('node:https', () => {
  return {
    createServer: jest.fn((_, cb) => {
      const req = {}
      const res = {
        writeHead: jest.fn(),
        end: jest.fn()
      }
      cb && cb(req, res) // call right away
      return {
        listen: jest.fn((_, fn) => {
          fn && fn() // call right away
        }),
        close: jest.fn()
      }
    })
  }
})

const mockConfigData = {
  app: {
    hasFrontend: true,
    hasBackend: true
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRunDev.mockReset()
  mockHelpers.runInProcess.mockReset()

  mockConfig.get = jest.fn().mockReturnValue({ globalConfig: 'seems-legit' })

  mockFS.exists.mockReset()
  mockFS.existsSync.mockReset()
  mockFS.writeFile.mockReset()
  mockFS.readFile.mockReset()
  mockFS.ensureDir.mockReset()

  ux.action = {
    stop: jest.fn(),
    start: jest.fn()
  }
  open.mockReset()
  ux.wait = jest.fn()
})

afterEach(() => {
  jest.clearAllMocks()
})

describe('run command definition', () => {
  test('exports', async () => {
    expect(typeof TheCommand).toEqual('function')
    expect(TheCommand.prototype instanceof BaseCommand).toBeTruthy()
  })

  test('description', async () => {
    expect(TheCommand.description).toBeDefined()
  })

  test('aliases', async () => {
    expect(TheCommand.aliases).toEqual([])
  })

  test('flags', async () => {
    expect(typeof TheCommand.flags.open).toBe('object')
    expect(typeof TheCommand.flags.open.description).toBe('string')
    expect(TheCommand.flags.open.default).toEqual(false)

    expect(typeof TheCommand.flags.extension).toBe('object')
    expect(typeof TheCommand.flags.extension.description).toBe('string')
    expect(TheCommand.flags.extension.multiple).toEqual(false)
    expect(TheCommand.flags.extension.char).toEqual('e')
  })
})

describe('run', () => {
  let command
  const mockFindCommandRun = jest.fn()
  const mockFindCommandLoad = jest.fn().mockReturnValue({
    run: mockFindCommandRun
  })

  beforeEach(() => {
    mockFindCommandLoad.mockClear()
    mockFindCommandRun.mockReset()

    command = new TheCommand()
    command.error = jest.fn()
    command.log = jest.fn()
    command.config = {
      runHook: jest.fn(),
      findCommand: jest.fn().mockReturnValue({
        load: mockFindCommandLoad
      }),
      dataDir: '/data/dir'
    }
    command.appConfig = cloneDeep(mockConfigData)
    command.getAppExtConfigs = jest.fn()
    command.getLaunchUrlPrefix = jest.fn(() => 'https://my.launch.prefix/?localDevUrl=')
  })

  // test('app:run with no ui and no manifest should fail: default config', async () => {
  //   command.argv = []
  //   command.appConfig.app.hasFrontend = false
  //   command.appConfig.app.hasBackend = false
  //   command.getAppExtConfigs.mockResolvedValueOnce(createAppConfig(command.appConfig))

  //   await command.run()
  //   expect(command.error).toHaveBeenCalledWith(Error('nothing to run.. there is no frontend and no manifest.yml, are you in a valid app?'))
  // })

  test('run, no flags', async () => {
    command.argv = []
    const appConfig = {
      hooks: {
      },
      app: {
        hasFrontend: true,
        hasBackend: true
      }
    }

    command.getAppExtConfigs.mockResolvedValueOnce({ myextension: appConfig })
    mockRunDev.mockResolvedValue({ frontEndUrl: 'https://localhost:9080', actionUrls: {} })

    await command.run()
    expect(command.log).toHaveBeenCalledWith('press CTRL+C to terminate the dev environment') // success
    expect(command.error).not.toHaveBeenCalled()
  })

  test('run with --extension flag', async () => {
    const myExtension = 'myextension'
    command.argv = ['--extension', myExtension]
    const appConfig = {
      hooks: {
      },
      app: {
        hasFrontend: true,
        hasBackend: true
      }
    }

    command.getAppExtConfigs.mockResolvedValueOnce({ someOtherExtension: {}, [myExtension]: appConfig })
    mockRunDev.mockResolvedValue({ frontEndUrl: 'https://localhost:9080', actionUrls: {} })

    await command.run()
    expect(command.log).toHaveBeenCalledWith('press CTRL+C to terminate the dev environment') // success
    expect(command.error).not.toHaveBeenCalled()
  })

  test('run with --open flag', async () => {
    command.argv = []
    const appConfig = {
      hooks: {
      },
      app: {
        hasFrontend: true,
        hasBackend: true
      }
    }

    command.getAppExtConfigs.mockResolvedValueOnce({ myextension: appConfig })
    mockRunDev.mockResolvedValue({ frontEndUrl: 'https://localhost:9080', actionUrls: {} })

    await command.run()
    expect(command.log).toHaveBeenCalledWith('press CTRL+C to terminate the dev environment') // success
    expect(command.error).not.toHaveBeenCalled()
  })
})
