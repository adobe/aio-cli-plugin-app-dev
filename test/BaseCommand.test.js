const { stdout } = require('stdout-stderr')
const { Command } = require('@oclif/core')
const TheCommand = require('../src/BaseCommand')

jest.mock('@adobe/aio-lib-core-config')
const mockAioConfig = require('@adobe/aio-lib-core-config')

const mockConfigLoader = require('@adobe/aio-cli-lib-app-config')
jest.mock('@adobe/aio-cli-lib-app-config')

const libEnv = require('@adobe/aio-lib-env')
jest.mock('@adobe/aio-lib-env')

jest.mock('inquirer')
const inquirer = require('inquirer')
const mockExtensionPrompt = jest.fn()
inquirer.createPromptModule = jest.fn().mockReturnValue(mockExtensionPrompt)

let command

beforeEach(() => {
  command = new TheCommand()
  command.argv = []
  command.config = {
    runHook: jest.fn()
  }
  command.config.runHook.mockResolvedValue({})

  libEnv.getCliEnv.mockReturnValue('prod')
  mockConfigLoader.load.mockReset()

  inquirer.createPromptModule.mockClear()
  mockExtensionPrompt.mockReset()
})

describe('static tests', () => {
  test('exports', async () => {
    expect(typeof TheCommand).toEqual('function')
    expect(TheCommand.prototype instanceof Command).toBeTruthy()
  })

  test('flags', async () => {
    expect(typeof TheCommand.flags.version).toBe('object')
    expect(typeof TheCommand.flags.version.description).toBe('string')

    expect(typeof TheCommand.flags.verbose).toBe('object')
    expect(TheCommand.flags.verbose.char).toBe('v')
    expect(typeof TheCommand.flags.verbose.description).toBe('string')
  })

  test('args', async () => {
    expect(TheCommand.args).toEqual({})
  })

  test('basecommand defines method', async () => {
    expect(command.catch).toBeDefined()
    expect(command.handleError).toBeDefined()
    expect(command.init).toBeDefined()
    expect(command.getAppExtConfigs).toBeDefined()
    expect(command.getConfigFileForKey).toBeDefined()
    expect(command.getFullConfig).toBeDefined()
    expect(command.getLaunchUrlPrefix).toBeDefined()

    expect(typeof command.catch).toBe('function')
    expect(typeof command.handleError).toBe('function')
    expect(typeof command.init).toBe('function')
    expect(typeof command.getAppExtConfigs).toBe('function')
    expect(typeof command.getConfigFileForKey).toBe('function')
    expect(typeof command.getFullConfig).toBe('function')
    expect(typeof command.getLaunchUrlPrefix).toBe('function')
  })
})

test('init', async () => {
  await command.init()
  expect(command.prompt).toBe(mockExtensionPrompt)
  expect(inquirer.createPromptModule).toHaveBeenCalledWith({ output: process.stderr })
})

describe('getLaunchUrlPrefix', () => {
  test('warns on older url', async () => {
    mockAioConfig.get.mockReturnValue('some-url/apps/some-param')
    expect(command.getLaunchUrlPrefix()).toBe('some-url/custom-apps/some-param')
    expect(stdout.output).toMatch('Warning: your environment variables contains an older version of AIO_LAUNCH_URL_PREFIX')

    mockAioConfig.get.mockReturnValue('some-url/myapps/some-param')
    expect(command.getLaunchUrlPrefix()).toBe('some-url/custom-apps/some-param')
    expect(stdout.output).toMatch('Warning: your environment variables contains an older version of AIO_LAUNCH_URL_PREFIX')

    mockAioConfig.get.mockReturnValue('some-url/custom-apps/some-param')
    expect(command.getLaunchUrlPrefix()).toBe('some-url/custom-apps/some-param')
    expect(stdout.output).toMatch('')

    mockAioConfig.get.mockReturnValue(null)
    expect(command.getLaunchUrlPrefix()).toEqual(expect.stringContaining('https://'))
  })

  test('uses stage launch prefix', async () => {
    libEnv.getCliEnv.mockReturnValue('stage')
    expect(command.getLaunchUrlPrefix()).toBe('https://experience-stage.adobe.com/?devMode=true#/custom-apps/?localDevUrl=')
  })
})

describe('getFullConfig', () => {
  test('keeps cache', async () => {
    mockConfigLoader.load.mockResolvedValue({ a: 'hello' })
    const config = await command.getFullConfig()
    const config2 = await command.getFullConfig()
    expect(config).toEqual({ a: 'hello' })
    expect(config).toEqual(config2)
    expect(mockConfigLoader.load).toHaveBeenCalledTimes(1)
  })

  test('with options', async () => {
    mockConfigLoader.load.mockResolvedValue({ a: 'hello' })
    const config = await command.getFullConfig({ someOptions: {} })
    expect(config).toEqual({ a: 'hello' })
    expect(mockConfigLoader.load).toHaveBeenCalledWith({ someOptions: {}, validateAppConfig: false })
  })

  test('with validateAppConfig=true', async () => {
    mockConfigLoader.load.mockResolvedValue({ a: 'hello' })
    const config = await command.getFullConfig({ someOptions: {}, validateAppConfig: true })
    expect(config).toEqual({ a: 'hello' })
    expect(mockConfigLoader.load).toHaveBeenCalledWith({ someOptions: {}, validateAppConfig: true })
  })
})

describe('getConfigFileForKey', () => {
  test('returns empty object if not found', async () => {
    const mockConfig = {
      includeIndex: {
        somethingElse: {}
      }
    }

    mockConfigLoader.load.mockResolvedValue(mockConfig)
    await expect(command.getConfigFileForKey('notexist.key.abc')).resolves.toEqual({})
    expect(mockConfigLoader.load).toHaveBeenCalledWith({ validateAppConfig: false })
  })

  test('returns file and key if found', async () => {
    const mockConfig = {
      includeIndex: {
        extensions: {
          someOtherThing: {}
        }
      }
    }

    mockConfigLoader.load.mockResolvedValue(mockConfig)
    await expect(command.getConfigFileForKey('extensions')).resolves.toEqual(mockConfig.includeIndex.extensions)
  })
})

describe('catch', () => {
  beforeEach(() => {
    command.error = jest.fn()
  })

  test('error object', async () => {
    await command.catch(new Error('fake error'))
    expect(command.error).toHaveBeenCalledWith('fake error')
  })

  test('will change error message when aio app outside of the application root', async () => {
    await command.catch(new Error('ENOENT: no such file or directory, open \'package.json\''))

    const errorList = [
      'ENOENT: no such file or directory, open \'package.json\''
    ]
    expect(command.error).toHaveBeenCalledWith(errorList.join('\n'))
  })

  test('will change error message when aio app outside of the application root (--verbose)', async () => {
    command.argv = ['--verbose']
    await command.catch(new Error('ENOENT: no such file or directory, open \'package.json\''))

    const errorList = [
      'Error: ENOENT: no such file or directory, open \'package.json\''
    ]
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining(errorList.join('\n')))
  })

  test('will handle errors with diagnostics property when using --verbose flag', async () => {
    command.argv = ['--verbose']
    const errorWithDiagnostics = new Error('fake error')
    errorWithDiagnostics.diagnostics = { some: 'property ' }
    await command.catch(errorWithDiagnostics)

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('fake error'))
  })

  test('will handle errors without stack traces when using --verbose flag', async () => {
    command.argv = ['--verbose']
    const errorWithoutStack = new Error('fake error')
    delete errorWithoutStack.stack
    await command.catch(errorWithoutStack)

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('fake error'))
  })

  test('will handle errors without stack traces when not using --verbose flag', async () => {
    const errorWithoutStack = new Error('fake error')
    delete errorWithoutStack.stack
    await command.catch(errorWithoutStack)

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('fake error'))
  })
})

describe('getAppExtConfigs', () => {
  test('no extension flags', async () => {
    const config = {
      all: {}
    }

    mockConfigLoader.load.mockResolvedValue(config)
    await expect(command.getAppExtConfigs({})).resolves.toEqual(config.all)
    expect(mockConfigLoader.load).toHaveBeenCalledWith({ validateAppConfig: false })
  })

  test('with options', async () => {
    const config = {
      all: {}
    }

    mockConfigLoader.load.mockResolvedValue(config)
    await expect(command.getAppExtConfigs({}, { some: 'options' })).resolves.toEqual(config.all)
    expect(mockConfigLoader.load).toHaveBeenCalledWith({ some: 'options', validateAppConfig: false })
  })

  test('-e exc -e asset', async () => {
    const config = {
      all: {
        'dx/excshell/1': {},
        'dx/asset-compute/worker/1': {}
      }
    }

    mockConfigLoader.load.mockResolvedValue(config)
    await expect(command.getAppExtConfigs({ extension: ['exc', 'asset'] }))
      .resolves.toEqual({
        'dx/excshell/1': config.all['dx/excshell/1'],
        'dx/asset-compute/worker/1': config.all['dx/asset-compute/worker/1']
      })
  })

  test('-e application', async () => {
    const config = {
      all: {
        application: {},
        someOtherExtension: {}
      }
    }

    mockConfigLoader.load.mockResolvedValue(config)
    await expect(command.getAppExtConfigs({ extension: ['application'] }))
      .resolves.toEqual({ application: config.all.application })
  })

  test('-e application, { validateAppConfig: true }', async () => {
    const config = {
      all: {
        application: {},
        someOtherExtension: {}
      }
    }

    mockConfigLoader.load.mockResolvedValue(config)
    await expect(command.getAppExtConfigs({ extension: ['application'] }, { validateAppConfig: true }))
      .resolves.toEqual({ application: config.all.application })
    expect(mockConfigLoader.load).toHaveBeenCalledWith({ validateAppConfig: true })
  })

  test('-e exc -e notexists', async () => {
    const config = {
      all: {
        'dx/excshell/1': {}
      }
    }

    mockConfigLoader.load.mockResolvedValue(config)
    await expect(command.getAppExtConfigs({ extension: ['exc', 'notexists'] }))
      .rejects.toThrow('No matching extension implementation found for flag \'-e notexists\'')
  })

  test('-e dx (matches more than one)', async () => {
    const config = {
      all: {
        'dx/excshell/1': {},
        'dx/foobar/1': {}
      }
    }

    mockConfigLoader.load.mockResolvedValue(config)
    await expect(command.getAppExtConfigs({ extension: ['dx'] }))
      .rejects.toThrow('Flag \'-e dx\' matches multiple extension implementation')
  })
})
