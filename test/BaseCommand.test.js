const { stdout } = require('stdout-stderr')
const { Command } = require('@oclif/core')

jest.mock('@adobe/aio-lib-core-config')
const mockAioConfig = require('@adobe/aio-lib-core-config')

const mockConfigLoader = require('@adobe/aio-cli-lib-app-config')
jest.mock('@adobe/aio-cli-lib-app-config')
// const getMockConfig = require('./data-mocks/config-loader')

const libEnv = require('@adobe/aio-lib-env')
jest.mock('@adobe/aio-lib-env')

const TheCommand = require('../src/BaseCommand')

jest.mock('inquirer')
const inquirer = require('inquirer')
const mockExtensionPrompt = jest.fn()
inquirer.createPromptModule = jest.fn().mockReturnValue(mockExtensionPrompt)

beforeEach(() => {
  libEnv.getCliEnv.mockReturnValue('prod')
  mockConfigLoader.load.mockReset()

  inquirer.createPromptModule.mockClear()
  mockExtensionPrompt.mockReset()
})

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
  const cmd = new TheCommand()

  expect(cmd.getLaunchUrlPrefix).toBeDefined()
  expect(typeof cmd.getLaunchUrlPrefix).toBe('function')
})

test('getLaunchUrlPrefix() warns on older url', async () => {
  const cmd = new TheCommand()

  mockAioConfig.get.mockReturnValue('some-url/apps/some-param')
  expect(cmd.getLaunchUrlPrefix()).toBe('some-url/custom-apps/some-param')
  expect(stdout.output).toMatch('Warning: your environment variables contains an older version of AIO_LAUNCH_URL_PREFIX')

  mockAioConfig.get.mockReturnValue('some-url/myapps/some-param')
  expect(cmd.getLaunchUrlPrefix()).toBe('some-url/custom-apps/some-param')
  expect(stdout.output).toMatch('Warning: your environment variables contains an older version of AIO_LAUNCH_URL_PREFIX')

  mockAioConfig.get.mockReturnValue('some-url/custom-apps/some-param')
  expect(cmd.getLaunchUrlPrefix()).toBe('some-url/custom-apps/some-param')
  expect(stdout.output).toMatch('')

  mockAioConfig.get.mockReturnValue(null)
  expect(cmd.getLaunchUrlPrefix()).toEqual(expect.stringContaining('https://'))
})

test('getLaunchUrlPrefix() uses stage launch prefix', async () => {
  const cmd = new TheCommand()
  libEnv.getCliEnv.mockReturnValue('stage')
  expect(cmd.getLaunchUrlPrefix()).toBe('https://experience-stage.adobe.com/?devMode=true#/custom-apps/?localDevUrl=')
})

// describe('getFullConfig', () => {
//   test('keeps cache', async () => {
//     const cmd = new TheCommand()
//     mockConfigLoader.load.mockResolvedValue({ a: 'hello' })
//     const config = await cmd.getFullConfig()
//     const config2 = await cmd.getFullConfig()
//     expect(config).toEqual({ a: 'hello' })
//     expect(config).toEqual(config2)
//     expect(mockConfigLoader.load).toHaveBeenCalledTimes(1)
//   })
//   test('with options', async () => {
//     const cmd = new TheCommand()
//     mockConfigLoader.load.mockResolvedValue({ a: 'hello' })
//     const config = await cmd.getFullConfig({ someOptions: {} })
//     expect(config).toEqual({ a: 'hello' })
//     expect(mockConfigLoader.load).toHaveBeenCalledWith({ someOptions: {}, validateAppConfig: false })
//   })
//   test('with validateAppConfig=true', async () => {
//     const cmd = new TheCommand()
//     mockConfigLoader.load.mockResolvedValue({ a: 'hello' })
//     const config = await cmd.getFullConfig({ someOptions: {}, validateAppConfig: true })
//     expect(config).toEqual({ a: 'hello' })
//     expect(mockConfigLoader.load).toHaveBeenCalledWith({ someOptions: {}, validateAppConfig: true })
//   })
// })

// describe('getConfigFileForKey', () => {
//   test('returns empty object if not found', async () => {
//     mockConfigLoader.load.mockResolvedValue(getMockConfig('exc', {}))
//     const cmd = new TheCommand()
//     expect(await cmd.getConfigFileForKey('notexist.key.abc')).toEqual({})
//     expect(mockConfigLoader.load).toHaveBeenCalledWith({ validateAppConfig: false })
//   })
//   test('returns file and key if found', async () => {
//     const config = getMockConfig('exc', {})
//     const cmd = new TheCommand()
//     mockConfigLoader.load.mockResolvedValue(config)
//     expect(await cmd.getConfigFileForKey('extensions')).toEqual(config.includeIndex.extensions)
//   })
// })

// describe('getAppExtConfigs', () => {
//   test('no extension flags', async () => {
//     const config = getMockConfig('app-exc-nui', {})
//     mockConfigLoader.load.mockResolvedValue(config)
//     const cmd = new TheCommand()
//     expect(await cmd.getAppExtConfigs({})).toEqual(config.all)
//     expect(mockConfigLoader.load).toHaveBeenCalledWith({ validateAppConfig: false })
//   })
//   test('with options', async () => {
//     const config = getMockConfig('app-exc-nui', {})
//     mockConfigLoader.load.mockResolvedValue(config)
//     const cmd = new TheCommand()
//     expect(await cmd.getAppExtConfigs({}, { some: 'options' })).toEqual(config.all)
//     expect(mockConfigLoader.load).toHaveBeenCalledWith({ some: 'options', validateAppConfig: false })
//   })
//   test('-e exc -e asset', async () => {
//     const config = getMockConfig('app-exc-nui', {})
//     mockConfigLoader.load.mockResolvedValue(config)
//     const cmd = new TheCommand()
//     expect(await cmd.getAppExtConfigs({ extension: ['exc', 'asset'] }))
//       .toEqual({
//         'dx/excshell/1': config.all['dx/excshell/1'],
//         'dx/asset-compute/worker/1': config.all['dx/asset-compute/worker/1']
//       })
//   })
//   test('-e application', async () => {
//     const config = getMockConfig('app-exc-nui', {})
//     mockConfigLoader.load.mockResolvedValue(config)
//     const cmd = new TheCommand()
//     expect(await cmd.getAppExtConfigs({ extension: ['application'] }))
//       .toEqual({ application: config.all.application })
//   })

//   test('-e application, { validateAppConfig: true }', async () => {
//     const config = getMockConfig('app-exc-nui', {})
//     mockConfigLoader.load.mockResolvedValue(config)
//     const cmd = new TheCommand()
//     expect(await cmd.getAppExtConfigs({ extension: ['application'] }, { validateAppConfig: true }))
//       .toEqual({ application: config.all.application })
//     expect(mockConfigLoader.load).toHaveBeenCalledWith({ validateAppConfig: true })
//   })

//   test('-e exc -e notexists', async () => {
//     const config = getMockConfig('app-exc-nui', {})
//     mockConfigLoader.load.mockResolvedValue(config)
//     const cmd = new TheCommand()
//     await expect(async () => await cmd.getAppExtConfigs({ extension: ['exc', 'notexists'] }))
//       .rejects.toThrow('No matching extension implementation found for flag \'-e notexists\'')
//   })

//   test('-e dx (matches more than one)', async () => {
//     const config = getMockConfig('app-exc-nui', {})
//     mockConfigLoader.load.mockResolvedValue(config)
//     const cmd = new TheCommand()
//     await expect(async () => await cmd.getAppExtConfigs({ extension: ['dx'] }))
//       .rejects.toThrow('Flag \'-e dx\' matches multiple extension implementation')
//   })
// })

test('init', async () => {
  const cmd = new TheCommand([])
  cmd.config = {}
  await cmd.init()
  expect(cmd.prompt).toBe(mockExtensionPrompt)
  expect(inquirer.createPromptModule).toHaveBeenCalledWith({ output: process.stderr })
})

test('catch', async () => {
  const cmd = new TheCommand([])
  cmd.error = jest.fn()
  await cmd.catch(new Error('fake error'))
  expect(cmd.error).toHaveBeenCalledWith('fake error')
})

test('will change error message when aio app outside of the application root', async () => {
  const cmd = new TheCommand([])
  cmd.error = jest.fn()
  await cmd.catch(new Error('ENOENT: no such file or directory, open \'package.json\''))

  const errorList = [
    'ENOENT: no such file or directory, open \'package.json\''
  ]
  expect(cmd.error).toHaveBeenCalledWith(errorList.join('\n'))
})

test('will change error message when aio app outside of the application root (--verbose)', async () => {
  const cmd = new TheCommand(['--verbose'])
  cmd.error = jest.fn()
  await cmd.catch(new Error('ENOENT: no such file or directory, open \'package.json\''))

  const errorList = [
    'Error: ENOENT: no such file or directory, open \'package.json\''
  ]
  expect(cmd.error).toHaveBeenCalledWith(expect.stringContaining(errorList.join('\n')))
})

test('will handle errors without stack traces when using --verbose flag', async () => {
  const cmd = new TheCommand(['--verbose'])
  cmd.error = jest.fn()
  const errorWithoutStack = new Error('fake error')
  delete errorWithoutStack.stack
  await cmd.catch(errorWithoutStack)

  expect(cmd.error).toHaveBeenCalledWith(expect.stringContaining('fake error'))
})

test('will handle errors without stack traces when not using --verbose flag', async () => {
  const cmd = new TheCommand([])
  cmd.error = jest.fn()
  const errorWithoutStack = new Error('fake error')
  delete errorWithoutStack.stack
  await cmd.catch(errorWithoutStack)

  expect(cmd.error).toHaveBeenCalledWith(expect.stringContaining('fake error'))
})
