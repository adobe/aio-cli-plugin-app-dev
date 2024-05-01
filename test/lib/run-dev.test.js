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

const mockLogger = require('@adobe/aio-lib-core-logging')
const {
  runDev, serveWebAction, serveNonWebAction, httpStatusResponse,
  invokeAction, invokeSequence, statusCodeMessage, isRawWebAction, isWebAction
} = require('../../src/lib/run-dev')

jest.useFakeTimers()

jest.mock('connect-livereload')
jest.mock('fs-extra')

jest.mock('livereload', () => {
  return {
    createServer: jest.fn(() => {
      return {
        watch: jest.fn(),
        refresh: jest.fn(),
        server: {
          once: jest.fn((_, fn) => {
            fn() // call right away, coverage
            jest.runOnlyPendingTimers()
          })
        }
      }
    })
  }
})

jest.mock('node:https', () => {
  return {
    createServer: jest.fn(() => {
      return {
        listen: jest.fn((_, fn) => {
          fn() // call right away, coverage
        }),
        close: jest.fn()
      }
    })
  }
})

// unmock to test proper returned urls from getActionUrls
jest.unmock('@adobe/aio-lib-runtime')

// create a Response object
const createRes = ({ mockStatus, mockSend, mockSet = jest.fn() }) => {
  const obj = {
    set: mockSet,
    status: mockStatus,
    send: mockSend
  }
  mockSet.mockReturnValue(obj)
  mockStatus.mockReturnValue(obj)
  mockSend.mockReturnValue(obj)

  return obj
}

// create a Request object
const createReq = ({ url, body, headers = [], query, method = 'GET', is = jest.fn() }) => {
  return {
    body,
    headers,
    query,
    method,
    params: [url],
    is
  }
}

beforeEach(() => {
  mockLogger.mockReset()
})

test('exports', () => {
  expect(runDev).toBeDefined()
  expect(serveWebAction).toBeDefined()
  expect(serveNonWebAction).toBeDefined()
  expect(httpStatusResponse).toBeDefined()
  expect(invokeAction).toBeDefined()
  expect(invokeSequence).toBeDefined()
  expect(isRawWebAction).toBeDefined()
  expect(isWebAction).toBeDefined()
})

describe('isWebAction', () => {
  test('nothing set', () => {
    const action = {}
    expect(isWebAction(action)).toBeFalsy()
  })

  test('action.web "raw", "yes", true, or "true"', () => {
    let action

    action = { web: 'raw' }
    expect(isWebAction(action)).toBeTruthy()

    action = { web: 'yes' }
    expect(isWebAction(action)).toBeTruthy()

    action = { web: true }
    expect(isWebAction(action)).toBeTruthy()

    action = { web: 'true' }
    expect(isWebAction(action)).toBeTruthy()
  })

  test('action.web "no", false, or "false"', () => {
    let action

    action = { web: 'no' }
    expect(isWebAction(action)).toBeFalsy()

    action = { web: false }
    expect(isWebAction(action)).toBeFalsy()

    action = { web: 'false' }
    expect(isWebAction(action)).toBeFalsy()
  })

  test('action.annotations.web-export "raw", "yes", true, or "true"', () => {
    let action

    action = { annotations: { 'web-export': 'raw' } }
    expect(isWebAction(action)).toBeTruthy()

    action = { annotations: { 'web-export': 'yes' } }
    expect(isWebAction(action)).toBeTruthy()

    action = { annotations: { 'web-export': true } }
    expect(isWebAction(action)).toBeTruthy()

    action = { annotations: { 'web-export': 'true' } }
    expect(isWebAction(action)).toBeTruthy()
  })

  test('action.annotations.web-export "no", false, or "false"', () => {
    let action

    action = { annotations: { 'web-export': 'no' } }
    expect(isWebAction(action)).toBeFalsy()

    action = { annotations: { 'web-export': false } }
    expect(isWebAction(action)).toBeFalsy()

    action = { annotations: { 'web-export': 'false' } }
    expect(isWebAction(action)).toBeFalsy()
  })

  test('combination of action.web=no and action.annotations.web-export=yes', () => {
    let action
    const web = 'no'

    action = { web, annotations: { 'web-export': 'raw' } }
    expect(isWebAction(action)).toBeTruthy()

    action = { web, annotations: { 'web-export': 'yes' } }
    expect(isWebAction(action)).toBeTruthy()

    action = { web, annotations: { 'web-export': true } }
    expect(isWebAction(action)).toBeTruthy()

    action = { web, annotations: { 'web-export': 'true' } }
    expect(isWebAction(action)).toBeTruthy()
  })
})

describe('isRawWebAction', () => {
  test('action.web', () => {
    let action

    action = {}
    expect(isRawWebAction(action)).toBeFalsy()

    action = { web: 'raw' }
    expect(isRawWebAction(action)).toBeTruthy()

    action = { web: 'any other string value' }
    expect(isRawWebAction(action)).toBeFalsy()

    action = { web: false }
    expect(isRawWebAction(action)).toBeFalsy()

    action = { web: true }
    expect(isRawWebAction(action)).toBeFalsy()
  })

  test('action.annotations.web-export', () => {
    let action

    action = { annotations: {} }
    expect(isRawWebAction(action)).toBeFalsy()

    action = { annotations: { 'web-export': 'raw' } }
    expect(isRawWebAction(action)).toBeTruthy()

    action = { annotations: { 'web-export': 'any other string value' } }
    expect(isRawWebAction(action)).toBeFalsy()

    action = { annotations: { 'web-export': false } }
    expect(isRawWebAction(action)).toBeFalsy()

    action = { annotations: { 'web-export': true } }
    expect(isRawWebAction(action)).toBeFalsy()
  })
})

describe('statusCodeMessage', () => {
  test('900 - invalid', () => {
    const statusCode = 900
    expect(() => statusCodeMessage(statusCode)).toThrow(`Status code does not exist: ${statusCode}`)
  })

  test('200', () => {
    expect(statusCodeMessage(200)).toEqual('OK')
  })

  test('401', () => {
    expect(statusCodeMessage(401)).toEqual('Unauthorized')
  })

  test('404', () => {
    expect(statusCodeMessage(404)).toEqual('Not Found')
  })

  test('500', () => {
    expect(statusCodeMessage(500)).toEqual('Internal Server Error')
  })
})

describe('httpStatusResponse', () => {
  test('undefined options, throws', () => {
    expect(() => httpStatusResponse()).toThrow()
  })

  test('empty options, throws', () => {
    expect(() => httpStatusResponse({})).toThrow()
  })

  test('200 statusCode (no error)', () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()
    const res = createRes({ mockStatus, mockSend })
    const statusCode = 200

    httpStatusResponse({ statusCode, res, logger: mockLogger })
    expect(mockStatus).toHaveBeenCalledWith(200)
    expect(mockSend).toHaveBeenCalledWith() // no arguments
  })

  test('401 statusCode (error)', () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()
    const res = createRes({ mockStatus, mockSend })
    const statusCode = 401

    httpStatusResponse({ statusCode, res, logger: mockLogger })
    expect(mockStatus).toHaveBeenCalledWith(statusCode)
    expect(mockSend).toHaveBeenCalledWith({ error: 'Unauthorized' })
  })
})

test('serveNonWebAction', () => {
  const mockStatus = jest.fn()
  const mockSend = jest.fn()
  const res = createRes({ mockStatus, mockSend })
  const req = createReq({ url: 'foo/bar' })

  serveNonWebAction(req, res)
  expect(mockStatus).toHaveBeenCalledWith(401)
  expect(mockSend).toHaveBeenCalledWith({ error: 'Unauthorized' })
})

describe('serveWebAction', () => {
  test('action found, not web action', async () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({ url: 'foo/bar' })
    const packageName = 'foo'

    const actionConfig = {
      [packageName]: {
        actions: {
          bar: {
            function: fixturePath('actions/simpleAction.js')
          }
        }
      }
    }

    await serveWebAction(req, res, actionConfig)
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockStatus).toHaveBeenCalledWith(404)
  })

  test('action found, is web action', async () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({ url: 'foo/bar' })
    const packageName = 'foo'

    const actionConfig = {
      [packageName]: {
        actions: {
          bar: {
            function: fixturePath('actions/simpleAction.js'),
            web: true
          }
        }
      }
    }

    await serveWebAction(req, res, actionConfig)
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockStatus).toHaveBeenCalledWith(200)
    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  test('action found, is raw web action', async () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({ url: 'foo/bar' })
    const packageName = 'foo'

    const actionConfig = {
      [packageName]: {
        actions: {
          bar: {
            function: fixturePath('actions/simpleAction.js'),
            web: 'raw'
          }
        }
      }
    }

    await serveWebAction(req, res, actionConfig)
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockStatus).toHaveBeenCalledWith(200)
    expect(mockLogger.warn).toHaveBeenCalledWith('raw web action handling is not implemented yet')
  })

  test('action not found, is sequence', async () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({ url: 'foo/mysequence' })
    const packageName = 'foo'

    const actionConfig = {
      [packageName]: {
        sequences: {
          mysequence: {
            actions: 'bar'
          }
        },
        actions: {
          bar: {
            function: fixturePath('actions/simpleAction.js')
          }
        }
      }
    }

    await serveWebAction(req, res, actionConfig)
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockStatus).toHaveBeenCalledWith(200)
  })

  test('action not found, is not sequence', async () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({ url: 'foo/not_an_action' })
    const packageName = 'foo'

    const actionConfig = {
      [packageName]: {
        actions: {
          bar: {
            function: fixturePath('actions/simpleAction.js')
          }
        }
      }
    }

    await serveWebAction(req, res, actionConfig)
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockStatus).toHaveBeenCalledWith(404)
  })
})

describe('invokeSequence', () => {
  test('undefined sequence', async () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({ url: 'foo/bar' })
    const sequence = undefined
    const actionRequestContext = { owPath: '' }

    await invokeSequence({ req, res, sequence, actionRequestContext, logger: mockLogger })
    expect(mockSend).not.toHaveBeenCalled()
  })

  test('defined sequence (with actions)', async () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({ url: 'foo/bar' })
    const packageName = 'foo'
    let sequence, actionConfig, actionRequestContext

    // 1 action in sequence
    sequence = { actions: 'a' }
    actionConfig = {
      [packageName]: {
        actions: {
          a: {
            function: fixturePath('actions/simpleAction.js')
          }
        }
      }
    }
    actionRequestContext = { owPath: '', packageName, actionConfig }
    await invokeSequence({ req, res, sequence, actionRequestContext, logger: mockLogger })
    expect(mockSend).toHaveBeenCalledTimes(1)
    mockSend.mockClear()
    mockStatus.mockClear()

    // multiple actions in sequence
    sequence = { actions: 'a, b, c' }
    actionConfig = {
      [packageName]: {
        actions: {
          a: { function: fixturePath('actions/simpleAction.js') },
          b: { function: fixturePath('actions/simpleAction.js') },
          c: { function: fixturePath('actions/simpleAction.js') }
        }
      }
    }
    actionRequestContext = { owPath: '', packageName, actionConfig }
    await invokeSequence({ req, res, sequence, actionRequestContext, logger: mockLogger })
    expect(mockSend).toHaveBeenCalledTimes(3)
    mockSend.mockClear()
    mockStatus.mockClear()

    // unknown action in sequence
    sequence = { actions: 'a, unknown_action' }
    actionConfig = {
      [packageName]: {
        actions: {
          a: { function: fixturePath('actions/simpleAction.js') }
        }
      }
    }
    actionRequestContext = { owPath: '', packageName, actionConfig }
    await invokeSequence({ req, res, sequence, actionRequestContext, logger: mockLogger })
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockStatus).toHaveBeenCalledWith(200)
    expect(mockStatus).toHaveBeenCalledWith(404)
    mockSend.mockClear()
    mockStatus.mockClear()
  })

  test('action not found', async () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({ url: 'foo/bar' })
    const packageName = 'foo'

    const sequence = { actions: 'a, unknown_action' }
    const actionConfig = {
      [packageName]: {
        actions: {
          a: { function: fixturePath('actions/simpleAction.js') }
        }
      }
    }
    const actionRequestContext = { owPath: '', packageName, actionConfig }

    await invokeSequence({ req, res, sequence, actionRequestContext, logger: mockLogger })
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockStatus).toHaveBeenCalledWith(200)
    expect(mockStatus).toHaveBeenCalledWith(404)
  })

  test('require-adobe-auth, but no authorization header', async () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({ url: 'foo/bar' })
    const packageName = 'foo'

    const sequence = { actions: 'a' }
    const actionConfig = {
      [packageName]: {
        actions: {
          a: {
            function: fixturePath('actions/simpleAction.js'),
            annotations: {
              'require-adobe-auth': true
            }
          }
        }
      }
    }
    const actionRequestContext = { owPath: '', packageName, actionConfig }

    await invokeSequence({ req, res, sequence, actionRequestContext, logger: mockLogger })
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockStatus).toHaveBeenCalledWith(401)
  })

  test('require-adobe-auth, with authorization header', async () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({ url: 'foo/bar', headers: { authorization: 'eyBlaBlaBlah' } })
    const packageName = 'foo'

    const sequence = { actions: 'a' }
    const actionConfig = {
      [packageName]: {
        actions: {
          a: {
            function: fixturePath('actions/simpleAction.js'),
            annotations: {
              'require-adobe-auth': true
            }
          }
        }
      }
    }
    const actionRequestContext = { owPath: '', packageName, actionConfig }

    await invokeSequence({ req, res, sequence, actionRequestContext, logger: mockLogger })
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockStatus).toHaveBeenCalledWith(200)
  })

  test('action that throws an exception', async () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({ url: 'foo/bar' })
    const packageName = 'foo'

    const sequence = { actions: 'a' }
    const actionConfig = {
      [packageName]: {
        actions: {
          a: { function: fixturePath('actions/exceptionAction.js') }
        }
      }
    }
    const actionRequestContext = { owPath: '', packageName, actionConfig }

    await invokeSequence({ req, res, sequence, actionRequestContext, logger: mockLogger })
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockStatus).toHaveBeenCalledWith(500)
  })

  test('action that does not export main', async () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({ url: 'foo/bar' })
    const packageName = 'foo'

    const sequence = { actions: 'a' }
    const actionConfig = {
      [packageName]: {
        actions: {
          a: { function: fixturePath('actions/noMainAction.js') }
        }
      }
    }
    const actionRequestContext = { owPath: '', packageName, actionConfig }

    await invokeSequence({ req, res, sequence, actionRequestContext, logger: mockLogger })
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockStatus).toHaveBeenCalledWith(401)
  })
})

const createConfig = ({ distDev = 'dist', hasFrontend, hasBackend, packageName = 'mypackage', actions = {}, sequences = {} }) => {
  return {
    web: {
      distDev
    },
    ow: {
      namespace: 'mynamespace',
      auth: 'myauthkey',
      defaultApihost: 'https://localhost',
      apihost: 'https://localhost'
    },
    app: {
      hostname: 'https://localhost',
      defaultHostname: 'https://adobeio-static.net',
      hasFrontend,
      hasBackend
    },
    manifest: {
      full: {
        packages: {
          [packageName]: {
            actions,
            sequences
          }
        }
      }
    }
  }
}

const createRunOptions = ({ cert, key }) => {
  return {
    parcel: {
      https: {
        cert,
        key
      }
    }
  }
}

describe('runDev', () => {
  test('no front end, has back end', async () => {
    const config = createConfig({
      hasFrontend: false,
      hasBackend: true,
      packageName: 'mypackage',
      actions: {
        myaction: { function: fixturePath('actions/simpleAction.js') }
      }
    })
    const runOptions = createRunOptions({ cert: 'my-cert', key: 'my-key' })
    const hookRunner = () => {}

    const { frontendUrl, actionUrls, serverCleanup } = await runDev(runOptions, config, hookRunner)
    await serverCleanup()

    expect(frontendUrl).not.toBeDefined()
    expect(Object.keys(actionUrls).length).toBeGreaterThan(0)
  })

  test('has front end, has back end', async () => {
    const config = createConfig({
      hasFrontend: true,
      hasBackend: true,
      packageName: 'mypackage',
      actions: {
        myaction: { function: fixturePath('actions/simpleAction.js') }
      }
    })
    const runOptions = createRunOptions({ cert: 'my-cert', key: 'my-key' })
    const hookRunner = () => {}

    const { frontendUrl, actionUrls, serverCleanup } = await runDev(runOptions, config, hookRunner)
    await serverCleanup()

    expect(frontendUrl).toBeDefined()
    expect(Object.keys(actionUrls).length).toBeGreaterThan(0)
  })
})
