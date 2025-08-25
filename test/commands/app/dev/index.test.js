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
const Cleanup = require('../../../../src/lib/cleanup')

const cloneDeep = require('lodash.clonedeep')
const open = require('open')
const { ux } = require('@oclif/core')

const { runDev: mockRunDev } = require('../../../../src/lib/run-dev')
const mockHelpers = require('../../../../src/lib/app-helper')
const mockFS = require('fs-extra')
const mockConfig = require('@adobe/aio-lib-core-config')
const mockHttps = require('node:https')
const { createWatcher } = require('../../../../src/lib/actions-watcher')

jest.mock('open', () => jest.fn())
jest.mock('../../../../src/lib/run-dev')
jest.mock('../../../../src/lib/app-helper')
jest.mock('../../../../src/lib/actions-watcher')
jest.mock('fs-extra')
jest.mock('chokidar')

process.exit = jest.fn()
process.on = jest.fn()

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

  createWatcher.mockReset()
  createWatcher.mockImplementation(() => ({
    watcherCleanup: jest.fn()
  }))
})

afterEach(async () => {
  jest.clearAllMocks()

  // this is to run the cleanup, on SIGINT
  process.on.mockImplementation(async (eventName, fn) => {
    if (eventName === 'SIGINT') {
      // call the fn immediately as if SIGINT was sent
      await fn()
    }
  })
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
    command.error = jest.fn((message) => { throw new Error(message) })
    command.log = jest.fn()
    command.config = {
      runHook: jest.fn(),
      findCommand: jest.fn().mockReturnValue({
        load: mockFindCommandLoad
      }),
      dataDir: '/data/dir'
    }
    command.config.runHook.mockResolvedValue({})
    command.appConfig = cloneDeep(mockConfigData)
    command.getAppExtConfigs = jest.fn()
    command.getLaunchUrlPrefix = jest.fn(() => 'https://my.launch.prefix/?localDevUrl=')
  })

  test('run, verbose flag, one extension', async () => {
    command.argv = ['--verbose']
    const appConfig = {
      actions: {
        src: 'actions'
      },
      manifest: { full: { packages: {} } },
      hooks: {
      },
      app: {
        hasFrontend: true,
        hasBackend: true
      }
    }

    command.getAppExtConfigs.mockResolvedValueOnce({ myextension: appConfig })
    mockRunDev.mockResolvedValue({
      frontEndUrl: 'https://localhost:9080',
      actionUrls: {
        'generic/action1': 'https://localhost:9080/api/v1/web/action1',
        'generic/action2': 'https://localhost:9080/api/v1/action2'
      },
      serverCleanup: () => {}
    })

    await command.run()
    const cleanup = new Cleanup()
    await cleanup.run()
    expect(command.log).toHaveBeenCalledWith('press CTRL+C to terminate the dev environment') // success
    expect(command.error).not.toHaveBeenCalled()
  })

  test('run, no flags, no frontend nor backend', async () => {
    command.argv = []
    const appConfig = {
      manifest: { full: { packages: {} } },
      hooks: {
      },
      app: {
        hasFrontend: false,
        hasBackend: false
      }
    }

    command.getAppExtConfigs.mockResolvedValueOnce({ myextension: appConfig })
    mockRunDev.mockResolvedValue({
      frontEndUrl: 'https://localhost:9080',
      actionUrls: {},
      serverCleanup: () => {}
    })

    await expect(command.run()).rejects.toThrow('nothing to run... there is no frontend and no manifest.yml, are you in a valid app?')
  })

  test('run, no flags, no frontend, has backend', async () => {
    command.argv = []
    const appConfig = {
      manifest: { full: { packages: {} } },
      hooks: {
      },
      app: {
        hasFrontend: false,
        hasBackend: true
      }
    }

    command.getAppExtConfigs.mockResolvedValueOnce({ myextension: appConfig })
    mockRunDev.mockResolvedValue({
      frontEndUrl: 'https://localhost:9080',
      actionUrls: {},
      serverCleanup: () => {}
    })

    await command.run()
    expect(command.log).toHaveBeenCalledWith('press CTRL+C to terminate the dev environment') // success
    expect(command.error).not.toHaveBeenCalled()
  })

  test('run, no flags, has frontend, no backend', async () => {
    command.argv = []
    const appConfig = {
      hooks: {
      },
      app: {
        hasFrontend: true,
        hasBackend: false
      }
    }

    command.getAppExtConfigs.mockResolvedValueOnce({ myextension: appConfig })
    mockRunDev.mockResolvedValue({
      frontEndUrl: 'https://localhost:9080',
      actionUrls: {},
      serverCleanup: () => {}
    })

    await command.run()
    expect(command.log).toHaveBeenCalledWith('press CTRL+C to terminate the dev environment') // success
    expect(command.error).not.toHaveBeenCalled()
  })

  test('run, no flags, runInProcess exception', async () => {
    const errMessage = 'something went wrong with running the process'
    command.argv = []
    const appConfig = {
      manifest: { full: { packages: {} } },
      hooks: {
      },
      app: {
        hasFrontend: true,
        hasBackend: true
      }
    }

    command.getAppExtConfigs.mockResolvedValueOnce({ myextension: appConfig })
    mockRunDev.mockResolvedValue({
      frontEndUrl: 'https://localhost:9080',
      actionUrls: {},
      serverCleanup: () => {}
    })
    mockHelpers.runInProcess.mockRejectedValue(errMessage)

    // an error in runInProcess should not stop the rest of the command
    await command.run()
    expect(command.log).toHaveBeenCalledWith('press CTRL+C to terminate the dev environment') // success
    expect(command.error).not.toHaveBeenCalled()
    expect(command.log).toHaveBeenCalledWith(errMessage)
  })

  test('getOrGenerateCertificates exception', async () => {
    const errMessage = 'this is an error'
    command.argv = []
    const appConfig = {
      manifest: { full: { packages: {} } },
      hooks: {
      },
      app: {
        hasFrontend: true,
        hasBackend: true
      }
    }

    command.getAppExtConfigs.mockResolvedValueOnce({ myextension: appConfig })
    command.getOrGenerateCertificates = jest.fn()
    command.getOrGenerateCertificates.mockRejectedValue(new Error(errMessage))

    await expect(command.run()).rejects.toThrow(errMessage)
  })

  test('runOneExtensionPoint exception', async () => {
    const errMessage = 'this is an error'
    command.argv = []
    const appConfig = {
      manifest: { full: { packages: {} } },
      hooks: {
      },
      app: {
        hasFrontend: true,
        hasBackend: true
      }
    }

    command.getAppExtConfigs.mockResolvedValueOnce({ myextension: appConfig })
    command.runOneExtensionPoint = jest.fn()
    command.runOneExtensionPoint.mockRejectedValue(new Error(errMessage))

    await expect(command.run()).rejects.toThrow(errMessage)
  })

  test('run, no flags, multiple extensions', async () => {
    command.argv = []
    const appConfig = {
      manifest: { full: { packages: {} } },
      hooks: {
      },
      app: {
        hasFrontend: true,
        hasBackend: true
      }
    }

    command.getAppExtConfigs.mockResolvedValueOnce({ myextension: appConfig, anotherextension: appConfig })
    mockRunDev.mockResolvedValue({
      frontEndUrl: 'https://localhost:9080',
      actionUrls: {},
      serverCleanup: () => {}
    })

    await expect(command.run()).rejects.toThrow('Your app implements multiple extensions. You can only run one at the time, please select which extension to run with the \'-e\' flag.')
  })

  test('run with --extension flag (extension found)', async () => {
    const myExtension = 'myextension'
    command.argv = ['--extension', myExtension]
    const appConfig = {
      manifest: { full: { packages: {} } },
      hooks: {
      },
      app: {
        hasFrontend: true,
        hasBackend: true
      }
    }

    command.getAppExtConfigs.mockResolvedValueOnce({ someOtherExtension: {}, [myExtension]: appConfig })
    mockRunDev.mockResolvedValue({
      frontEndUrl: 'https://localhost:9080',
      actionUrls: {},
      serverCleanup: () => {}
    })

    await command.run()
    expect(command.log).toHaveBeenCalledWith('press CTRL+C to terminate the dev environment') // success
    expect(command.error).not.toHaveBeenCalled()
  })

  test('run with --extension flag (extension not found)', async () => {
    const theExtension = 'unknown_extension'
    command.argv = ['--extension', theExtension]
    const appConfig = {
      manifest: { full: { packages: {} } },
      hooks: {
      },
      app: {
        hasFrontend: true,
        hasBackend: true
      }
    }

    command.getAppExtConfigs.mockResolvedValueOnce({ myextension: appConfig })
    mockRunDev.mockResolvedValue({
      frontEndUrl: 'https://localhost:9080',
      actionUrls: {},
      serverCleanup: () => {}
    })

    await expect(command.run()).rejects.toThrow(`extension '${theExtension}' was not found.`)
  })

  test('run with --open flag', async () => {
    command.argv = ['--open']
    const appConfig = {
      manifest: { full: { packages: {} } },
      hooks: {
      },
      app: {
        hasFrontend: true,
        hasBackend: true
      }
    }

    command.getAppExtConfigs.mockResolvedValueOnce({ myextension: appConfig })
    mockRunDev.mockResolvedValue({
      frontEndUrl: 'https://localhost:9080',
      actionUrls: {},
      serverCleanup: () => {}
    })

    await command.run()
    expect(command.log).toHaveBeenCalledWith('press CTRL+C to terminate the dev environment') // success
    expect(command.error).not.toHaveBeenCalled()
  })
})

describe('getOrGenerateCertificates', () => {
  let command
  const mockFindCommandRun = jest.fn()
  const mockFindCommandLoad = jest.fn().mockReturnValue({
    run: mockFindCommandRun
  })

  const certConfig = {
    pubCertPath: 'pub.crt',
    privateKeyPath: 'private.key',
    devKeysDir: 'dev-keys',
    devKeysConfigKey: 'aio.dev-keys'
  }

  beforeEach(() => {
    command = new TheCommand()
    command.config = {
      findCommand: jest.fn().mockReturnValue({
        load: mockFindCommandLoad
      })
    }
  })

  test('no existing certs', async () => {
    await expect(command.getOrGenerateCertificates(certConfig))
      .resolves.toEqual({ cert: certConfig.pubCertPath, key: certConfig.privateKeyPath })
  })

  test('existing certs on disk', async () => {
    mockFS.existsSync.mockImplementation((filePath) => {
      return (filePath === certConfig.pubCertPath) || (filePath === certConfig.privateKeyPath)
    })

    await expect(command.getOrGenerateCertificates(certConfig))
      .resolves.toEqual({ cert: certConfig.pubCertPath, key: certConfig.privateKeyPath })
  })

  test('existing certs in config', async () => {
    mockConfig.get.mockImplementation((key) => {
      if (key === certConfig.devKeysConfigKey) {
        return {
          publicCert: certConfig.pubCertPath,
          privateKey: certConfig.privateKeyPath
        }
      }
    })

    await expect(command.getOrGenerateCertificates(certConfig))
      .resolves.toEqual({ cert: certConfig.pubCertPath, key: certConfig.privateKeyPath })
  })

  test('cannot find cert plugin', async () => {
    command.config.findCommand.mockReturnValue(null)

    await expect(command.getOrGenerateCertificates(certConfig))
      .rejects.toThrow('error while generating certificate - no certificate:generate command found')
  })

  test('cert not accepted in the browser', async () => {
    mockHttps.createServer.mockImplementationOnce(() => {
      return {
        listen: jest.fn((_, fn) => {
          fn && fn() // call right away
        }),
        close: jest.fn()
      }
    })

    await expect(command.getOrGenerateCertificates({ ...certConfig, maxWaitTimeSeconds: 0.5 }))
      .resolves.toEqual({ cert: certConfig.pubCertPath, key: certConfig.privateKeyPath })
  })
})

describe('verifyActionConfig', () => {
  let command

  beforeEach(() => {
    command = new TheCommand()
    command.error = jest.fn(() => {})
  })

  test('good config', async () => {
    const actionConfig = {
      mypackage: {
        sequences: {
          mysequence: {
            actions: 'a,b,c'
          }
        },
        actions: {
          a: {},
          b: {},
          c: {}
        }
      }
    }
    const appConfig = {
      manifest: { full: { packages: actionConfig } }
    }

    await command.verifyActionConfig(appConfig)
    expect(command.error).not.toHaveBeenCalled()
  })

  test('good config (no sequences or actions)', async () => {
    const actionConfig = {
      mypackage: {
      }
    }
    const appConfig = {
      manifest: { full: { packages: actionConfig } }
    }

    await command.verifyActionConfig(appConfig)
    expect(command.error).not.toHaveBeenCalled()
  })

  test('sequence has no actions', async () => {
    const sequenceName = 'mysequence'

    const actionConfig = {
      mypackage: {
        sequences: {
          [sequenceName]: {}
        }
      }
    }
    const appConfig = {
      manifest: { full: { packages: actionConfig } }
    }

    await command.verifyActionConfig(appConfig)
    expect(command.error).toHaveBeenCalledWith(`Actions for the sequence '${sequenceName}' not provided.`)
  })

  test('sequence with action not found', async () => {
    const missingAction = 'z'
    const sequenceName = 'mysequence'

    const actionConfig = {
      mypackage: {
        sequences: {
          [sequenceName]: {
            actions: `a,b,c,${missingAction}`
          }
        },
        actions: {
          a: {},
          b: {},
          c: {}
        }
      }
    }
    const appConfig = {
      manifest: { full: { packages: actionConfig } }
    }

    await command.verifyActionConfig(appConfig)
    expect(command.error).toHaveBeenCalledWith(`Sequence component '${missingAction}' does not exist (sequence = '${sequenceName}')`)
  })

  test('sequence with same name as action', async () => {
    const sequenceName = 'myname'
    const actionName = sequenceName

    const actionConfig = {
      mypackage: {
        sequences: {
          [sequenceName]: {
            actions: 'a'
          }
        },
        actions: {
          a: {},
          [actionName]: {}
        }
      }
    }
    const appConfig = {
      manifest: { full: { packages: actionConfig } }
    }

    await command.verifyActionConfig(appConfig)
    expect(command.error).toHaveBeenCalledWith(`Sequence '${sequenceName}' is already defined as an action under the same package. Actions and sequences can not have the same name in a single package.`)
  })
})
