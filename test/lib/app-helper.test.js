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

const { runInProcess, runScript, writeConfig } = require('../../src/lib/app-helper')
const mockLogger = require('@adobe/aio-lib-core-logging')
const path = require('node:path')
const fs = require('fs-extra')
const execa = require('execa')
const mockAioConfig = require('@adobe/aio-lib-core-config')
const libEnv = require('@adobe/aio-lib-env')

test('exports', () => {
  expect(runInProcess).toBeDefined()
  expect(runScript).toBeDefined()
  expect(writeConfig).toBeDefined()
})

// unmock to test proper returned urls from getActionUrls
jest.unmock('@adobe/aio-lib-runtime')

const mockFetch = jest.fn()
jest.mock('@adobe/aio-lib-core-networking', () => ({
  createFetch: jest.fn(() => mockFetch),
  HttpExponentialBackoff: jest.fn()
}))

jest.mock('execa')
jest.mock('node:path')
jest.mock('fs-extra') // do not touch the real fs
jest.mock('@adobe/aio-lib-env')

beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'linux' })
  execa.mockReset()
  execa.command.mockReset()
  mockAioConfig.get.mockReset()
  mockAioConfig.set.mockReset()
  libEnv.getCliEnv.mockReset()
  mockFetch.mockReset()
})

// const getMockConfig = require('../../data-mocks/config-loader')

// test('runPackageScript', async () => {
//   expect(appHelper.runPackageScript).toBeDefined()
//   expect(appHelper.runPackageScript).toBeInstanceOf(Function)
// })

// test('runPackageScript success', async () => {
//   const scripts = {
//     test: 'some-script some-arg-1 some-arg-2'
//   }
//   fs.readJSON.mockReturnValue({ scripts })

//   const ipcMessage = {
//     type: 'long-running-process',
//     data: {
//       pid: 123,
//       logs: {
//         stdout: 'logs/foo.sh.out.log',
//         stderr: 'logs/foo.sh.err.log'
//       }
//     }
//   }

//   const mockChildProcessOn = jest.fn((eventname, fn) => {
//     if (eventname === 'message') {
//       // call it back right away, for coverage
//       fn(ipcMessage)
//       // now call with a different message type, for coverage
//       fn({
//         type: 'some-other-message',
//         data: {
//           pid: 1234,
//           logs: {
//             stdout: 'logs/bar.sh.out.log',
//             stderr: 'logs/bar.sh.err.log'
//           }
//         }
//       })
//     }
//   })

//   process.kill = jest.fn()
//   process.on = jest.fn((eventname, fn) => {
//     if (eventname === 'exit') {
//       // call it back right away, for coverage
//       fn()
//     }
//   })

//   execa.command.mockReturnValueOnce({
//     on: mockChildProcessOn
//   })

//   await appHelper.runPackageScript('test', '')
//   expect(mockChildProcessOn).toHaveBeenCalledWith('message', expect.any(Function))
//   expect(process.on).toHaveBeenCalledWith('exit', expect.any(Function))
//   expect(process.kill).toHaveBeenCalledWith(ipcMessage.data.pid, 'SIGTERM')

//   return expect(execa.command).toHaveBeenCalledWith(scripts.test,
//     expect.objectContaining({
//       stdio: ['inherit', 'inherit', 'inherit', 'ipc']
//     }))
// })

// test('runPackageScript success (os is Windows)', async () => {
//   const scripts = {
//     test: 'some-script some-arg-1 some-arg-2'
//   }
//   fs.readJSON.mockReturnValue({ scripts })

//   Object.defineProperty(process, 'platform', { value: 'win32' })

//   execa.command.mockReturnValueOnce({
//     on: jest.fn()
//   })

//   await appHelper.runPackageScript('test', '')
//   return expect(execa.command).toHaveBeenCalledWith(scripts.test,
//     expect.objectContaining({
//       stdio: ['inherit', 'inherit', 'inherit', null]
//     }))
// })

// test('runPackageScript success with additional command arg/flag', async () => {
//   // succeeds if npm run-script returns success
//   const scripts = {
//     cmd: 'some-script some-arg-1 some-arg-2'
//   }
//   fs.readJSON.mockReturnValue({ scripts })

//   const mockChildProcessOn = jest.fn()
//   execa.command.mockReturnValueOnce({
//     on: mockChildProcessOn
//   })

//   const cmdExtraArgs = ['--my-flag']
//   await appHelper.runPackageScript('cmd', '', cmdExtraArgs)
//   expect(mockChildProcessOn).toHaveBeenCalledWith('message', expect.any(Function))
//   const finalCommand = `${scripts.cmd} ${cmdExtraArgs.join(' ')}`
//   return expect(execa.command).toHaveBeenCalledWith(finalCommand, expect.any(Object))
// })

// test('runPackageScript logs if package.json does not have matching script', async () => {
//   fs.readdirSync.mockReturnValue(['package.json'])
//   fs.readJSONSync.mockReturnValue({ scripts: { notest: 'some-value' } })
//   // coverage: the error is logged, no error thrown
//   await expect(appHelper.runPackageScript('is-not-a-script', 'does-not-exist'))
//     .resolves.toBeUndefined()
// })

describe('runInProcess', () => {
  const mockOn = jest.fn()

  beforeEach(() => {
    mockOn.mockReset()
    execa.command.mockReturnValue({ on: mockOn })
  })

  test('with script should call runScript', async () => {
    await runInProcess('echo new command who dis?', {})
    expect(mockLogger.debug).toHaveBeenCalledWith('runInProcess: error running project hook in process, running as package script instead')
    expect(execa.command).toHaveBeenCalledWith('echo new command who dis?', expect.any(Object))
  })

  test('with require', async () => {
    const mockReq = jest.fn()
    path.resolve.mockReturnValue('does-not-exist')
    jest.mock('does-not-exist',
      () => mockReq,
      { virtual: true }
    )

    await runInProcess('does-not-exist', {})
    expect(mockReq).toHaveBeenCalled()
    expect(mockLogger.debug).toHaveBeenCalledWith('runInProcess: running project hook in process')
    expect(execa.command).not.toHaveBeenCalled()
  })

  test('fails with no hook-path', async () => {
    await runInProcess(undefined, {})
    expect(execa.command).not.toHaveBeenCalled()
    expect(mockLogger.debug).toHaveBeenCalledWith('runInProcess: undefined hookPath')
  })
})

describe('runScript', () => {
  const mockOn = jest.fn()

  beforeEach(() => {
    mockOn.mockReset()
    execa.command.mockReturnValue({ on: mockOn })
  })

  test('no command', async () => {
    const command = undefined
    const dir = 'somedir'
    const args = undefined // use default []

    await runScript(command, dir, args)
    expect(mockOn).not.toHaveBeenCalled()
    expect(execa.command).not.toHaveBeenCalled()
  })

  test('command, with defined dir, no args', async () => {
    const command = 'somecommand'
    const dir = 'somedir'
    const args = undefined // use default []

    await runScript(command, dir, args)
    expect(mockOn).toHaveBeenCalled()
    expect(execa.command).toHaveBeenCalledWith(command, expect.objectContaining({ cwd: dir }))
  })

  test('command, with defined dir, and args', async () => {
    const command = 'somecommand'
    const dir = 'somedir'
    const args = ['some', 'args']

    await runScript(command, dir, args)
    expect(mockOn).toHaveBeenCalled()
    expect(execa.command).toHaveBeenCalledWith(`${command} ${args.join(' ')}`, expect.objectContaining({ cwd: dir }))
  })

  test('command, with no dir => process.cwd, no args', async () => {
    const command = 'somecommand'
    const dir = undefined // use default `process.cwd()`
    const args = undefined // use default []

    await runScript(command, dir, args)
    expect(mockOn).toHaveBeenCalled()
    expect(execa.command).toHaveBeenCalledWith(command, expect.objectContaining({ cwd: process.cwd() }))
  })

  test('on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })

    const command = 'somecommand'
    const dir = undefined // use default `process.cwd()`
    const args = undefined // use default []

    await runScript(command, dir, args)
    expect(mockOn).not.toHaveBeenCalled()
    expect(execa.command).toHaveBeenCalledWith(command, expect.objectContaining({ cwd: process.cwd() }))
  })

  test('IPC', async () => {
    const ipcMessage = {
      type: 'long-running-process',
      data: {
        pid: 123,
        logs: {
          stdout: 'logs/foo.sh.out.log',
          stderr: 'logs/foo.sh.err.log'
        }
      }
    }

    const mockChildProcessOn = jest.fn((eventname, fn) => {
      if (eventname === 'message') {
        // call it back right away, for coverage
        fn(ipcMessage)
        // now call with a different message type, for coverage
        fn({
          type: 'some-other-message',
          data: {
            pid: 1234,
            logs: {
              stdout: 'logs/bar.sh.out.log',
              stderr: 'logs/bar.sh.err.log'
            }
          }
        })
      }
    })

    process.kill = jest.fn()
    process.on = jest.fn((eventname, fn) => {
      if (eventname === 'exit') {
        // call it back right away, for coverage
        fn()
      }
    })

    execa.command.mockReturnValueOnce({
      on: mockChildProcessOn
    })

    const command = 'somecommand'
    const dir = 'somedir'
    const args = undefined // use default []

    await runScript(command, dir, args)
    expect(mockChildProcessOn).toHaveBeenCalledWith('message', expect.any(Function))
    expect(process.on).toHaveBeenCalledWith('exit', expect.any(Function))
    expect(process.kill).toHaveBeenCalledWith(ipcMessage.data.pid, 'SIGTERM')

    return expect(execa.command).toHaveBeenCalledWith(command,
      expect.objectContaining({
        stdio: ['inherit', 'inherit', 'inherit', 'ipc']
      }))
  })
})

describe('writeConfig', () => {
  beforeEach(() => {
    fs.writeJSONSync.mockReset()
    fs.ensureDirSync.mockReset()
  })
  test('write a json to a file', () => {
    path.dirname.mockReturnValue('the/dir')
    const json = { some: 'config' }
    writeConfig('the/dir/some.file', json)
    expect(fs.ensureDirSync).toHaveBeenCalledWith('the/dir')
    expect(fs.writeJSONSync).toHaveBeenCalledWith('the/dir/some.file', json, { spaces: 2 })
  })
})
