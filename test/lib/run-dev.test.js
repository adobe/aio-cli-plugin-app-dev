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

const { SERVER_DEFAULT_PORT } = require('../../src/lib/constants')
const mockExpress = require('express')
const mockLogger = require('@adobe/aio-lib-core-logging')
const mockLibWeb = require('@adobe/aio-lib-web')
const mockGetPort = require('get-port')
const { URLSearchParams } = require('node:url')
const {
  createActionParametersFromRequest, runDev, serveWebAction, serveNonWebAction, httpStatusResponse,
  invokeAction, invokeSequence, interpolate, statusCodeMessage, isRawWebAction, isWebAction
} = require('../../src/lib/run-dev')

/* eslint no-template-curly-in-string: 0 */

jest.useFakeTimers()

jest.mock('connect-livereload')
jest.mock('node:path')
jest.mock('fs-extra')
jest.mock('get-port')

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
const createReq = ({ url, body, headers = {}, query, method = 'GET', is = jest.fn() }) => {
  return {
    body,
    headers,
    query,
    method,
    params: [url],
    is
  }
}

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

const createBundlerEvent = ({ type = 'buildSuccess', diagnostics = 'some diagnostics', changedAssets = [], bundles = [] } = {}) => {
  return {
    type,
    diagnostics,
    changedAssets: new Map(changedAssets), // param is a key value array [[key, value][key, value]]
    bundleGraph: {
      getBundles: jest.fn(() => bundles)
    }
  }
}

beforeEach(() => {
  mockLogger.mockReset()
  mockGetPort.mockReset()
  mockExpress.mockReset()
})

describe('test interpolate', () => {
  test('interpolate', async () => {
    expect(interpolate('bare braces {} hello ${name}', { name: 'world' }))
      .toMatch('bare braces {} hello world')
    expect(interpolate('literal value with double quotes hello "{name}"', { name: 'world' }))
      .toMatch('literal value with double quotes hello "{name}"')
    expect(interpolate('literal value with single quotes hello \'{name}\'', { name: 'world' }))
      .toMatch('literal value with single quotes hello \'{name}\'')
    expect(interpolate('dollar-braces hello ${name}', { name: 'world' }))
      .toMatch('dollar-braces hello world')
    expect(interpolate('dollar-key hello $name', { name: 'world' }))
      .toMatch('dollar-key hello world')
    expect(interpolate('multi-key hello ${name}, {name}, and $name', { name: 'world' }))
      .toMatch('multi-key hello world, world, and world')
  })
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
  expect(statusCodeMessage).toBeDefined()
})

describe('createActionParametersFromRequest', () => {
  /** @private */
  async function createAsyncFnCall ({ isRaw, mimeType, body }) {
    const is = jest.fn((_type) => _type === mimeType)

    const req = createReq({
      is,
      body, // this input is as if the express middleware ran
      url: 'foo/bar',
      headers: {
        'content-type': mimeType
      }
    })

    const action = {
      function: fixturePath('actions/successReturnAction.js'),
      web: isRaw ? 'raw' : 'yes'
    }

    const packageName = 'foo'
    const actionName = 'bar'
    const actionConfig = {
      [packageName]: {
        actions: {
          [actionName]: action
        }
      }
    }

    const actionRequestContext = { action, actionConfig, packageName, actionName }
    return createActionParametersFromRequest({
      req,
      contextItem: action,
      actionRequestContext,
      actionInputs: action.inputs,
      logger: mockLogger
    })
  }

  test('application/json', async () => {
    const isRaw = false
    const mimeType = 'application/json'
    const body = { some: 'json' }

    const actionParams = await createAsyncFnCall({ isRaw, mimeType, body })
    expect(actionParams).toMatchObject(body)
    expect(actionParams.__ow_body).not.toBeDefined()
  })

  test('application/x-www-form-urlencoded', async () => {
    const isRaw = false
    const mimeType = 'application/x-www-form-urlencoded'
    const formData = new URLSearchParams('a=b&c=d')
    const body = Object.fromEntries(formData)

    const actionParams = await createAsyncFnCall({ isRaw, mimeType, body })
    expect(actionParams).toMatchObject(body)
    expect(actionParams.__ow_body).not.toBeDefined()
  })

  test('some other content-type', async () => {
    const isRaw = false
    const mimeType = 'application/x-something'
    const body = 'an octopus\'s garden in the shade'

    const actionParams = await createAsyncFnCall({ isRaw, mimeType, body })
    expect(actionParams.__ow_body).toEqual(body)
  })

  test('raw web action', async () => {
    const isRaw = true
    const mimeType = 'multipart/form-data'
    const body = Buffer.from('whisper words of wisdom')

    const actionParams = await createAsyncFnCall({ isRaw, mimeType, body })
    expect(actionParams.__ow_body).toEqual(body.toString('base64')) // raw body will be base64'ed
  })

  test('raw web action, unsupported content-type', async () => {
    const isRaw = true
    const mimeType = 'application/x-my-own-mimetype'
    const body = Buffer.from('it\'s a steady job, but he wants to be a paperback writer')

    await expect(createAsyncFnCall({ isRaw, mimeType, body })).rejects.toThrow('request body Content-Type must be either: application/octet-stream,multipart/form-data')
  })

  test('raw web action but content-type application/json', async () => {
    const isRaw = true
    const mimeType = 'application/json'
    const body = { some: 'json' }

    const actionParams = await createAsyncFnCall({ isRaw, mimeType, body })
    expect(actionParams).toMatchObject(body)
    expect(actionParams.__ow_body).not.toBeDefined()
  })

  test('raw web action but content-type application/x-www-form-urlencoded', async () => {
    const isRaw = true
    const mimeType = 'application/x-www-form-urlencoded'
    const formData = new URLSearchParams('a=b&c=d')
    const body = Object.fromEntries(formData)

    const actionParams = await createAsyncFnCall({ isRaw, mimeType, body })
    expect(actionParams).toMatchObject(body)
    expect(actionParams.__ow_body).not.toBeDefined()
  })

  test('interpolate', async () => {
    process.env.mustache = 'world'
    const req = createReq({
      url: 'foo/bar',
      body: { name: 'world' },
      headers: {
        'content-type': 'application/json'
      }
    })
    const packageName = 'foo'
    const action = {
      function: fixturePath('actions/successReturnAction.js'),
      inputs: {
        dollarMustache: 'value is ${mustache}',
        justDollar: 'value is $mustache',
        mustache: 'value is {mustache}',
        literal: 'value is literally "${mustache}" and "{mustache}"',
        doesNotExist: 'value is ${doesNotExist}'
      }
    }
    const actionName = 'a'
    const actionConfig = {
      [packageName]: {
        actions: {
          [actionName]: action
        }
      }
    }
    const actionRequestContext = { action, actionConfig, packageName, actionName }

    const actionParams = await createActionParametersFromRequest({
      req,
      actionRequestContext,
      actionInputs: action.inputs,
      logger: mockLogger
    })
    expect(actionParams).toMatchObject({
      dollarMustache: 'value is world',
      justDollar: 'value is world',
      mustache: 'value is world',
      literal: 'value is literally "${mustache}" and "{mustache}"',
      doesNotExist: 'value is ${doesNotExist}'
    })
    delete process.env.mustache
  })
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
    const body = 'OK'

    const actionResponse = { statusCode, body }

    httpStatusResponse({ actionResponse, res, logger: mockLogger })
    expect(mockStatus).toHaveBeenCalledWith(statusCode)
    expect(mockSend).toHaveBeenCalledWith(body)
  })

  test('401 statusCode (error)', () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()
    const res = createRes({ mockStatus, mockSend })
    const statusCode = 401
    const body = { error: 'there was an error' }

    const actionResponse = { statusCode, body }
    httpStatusResponse({ actionResponse, res, logger: mockLogger })
    expect(mockStatus).toHaveBeenCalledWith(statusCode)
    expect(mockSend).toHaveBeenCalledWith(body)
  })
})

test('serveNonWebAction', () => {
  const mockStatus = jest.fn()
  const mockSend = jest.fn()
  const res = createRes({ mockStatus, mockSend })
  const req = createReq({ url: 'foo/bar' })

  serveNonWebAction(req, res)
  expect(mockStatus).toHaveBeenCalledWith(401)
  expect(mockSend).toHaveBeenCalledWith({ error: 'The resource requires authentication, which was not supplied with the request' })
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
            function: fixturePath('actions/successNoReturnAction.js')
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
            function: fixturePath('actions/successNoReturnAction.js'),
            web: true
          }
        }
      }
    }

    await serveWebAction(req, res, actionConfig)
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockStatus).toHaveBeenCalledWith(204) // because there is no body
    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  test('action found, is raw web action', async () => {
    const mimeType = 'multipart/form-data'
    const mockStatus = jest.fn()
    const mockSend = jest.fn()
    const is = (_type) => _type === mimeType

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({
      is,
      body: 'some body',
      url: 'foo/bar',
      headers: {
        'content-type': mimeType
      }
    })
    const packageName = 'foo'

    const actionConfig = {
      [packageName]: {
        actions: {
          bar: {
            function: fixturePath('actions/successReturnAction.js'),
            web: 'raw'
          }
        }
      }
    }

    await serveWebAction(req, res, actionConfig)
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockStatus).toHaveBeenCalledWith(200)
  })

  test('action found, is raw web action (unsupported content-type)', async () => {
    const mimeType = 'application/x-foo-bar'
    const mockStatus = jest.fn()
    const mockSend = jest.fn()
    const is = (_type) => _type === mimeType

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({
      is,
      body: 'some body',
      url: 'foo/bar',
      headers: {
        'content-type': mimeType
      }
    })
    const packageName = 'foo'

    const actionConfig = {
      [packageName]: {
        actions: {
          bar: {
            function: fixturePath('actions/successReturnAction.js'),
            web: 'raw'
          }
        }
      }
    }

    await serveWebAction(req, res, actionConfig)
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockStatus).toHaveBeenCalledWith(400)
  })

  test('action not found, is sequence', async () => {
    const mockStatus = jest.fn()
    const mockSend = jest.fn()
    const is = jest.fn((mimeType) => mimeType === 'application/*')

    const res = createRes({ mockStatus, mockSend })
    const req = createReq({ url: 'foo/mysequence', is })
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
            function: fixturePath('actions/successNoReturnAction.js')
          }
        }
      }
    }

    await serveWebAction(req, res, actionConfig)
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledWith({ error: 'The requested resource does not exist.' })
    expect(mockStatus).toHaveBeenCalledWith(404)
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
            function: fixturePath('actions/successNoReturnAction.js')
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
  test('undefined sequence (null response)', async () => {
    const sequence = undefined
    const actionRequestContext = { contextItem: sequence }

    const response = await invokeSequence({ actionRequestContext, logger: mockLogger })
    expect(response).toEqual(null)
  })

  test('unknown action in sequence', async () => {
    const packageName = 'foo'

    const sequence = { actions: 'a, unknown_action' }
    const actionConfig = {
      [packageName]: {
        actions: {
          a: { function: fixturePath('actions/successNoReturnAction.js') }
        }
      }
    }
    const actionRequestContext = { contextItem: sequence, contextItemParams: {}, packageName, actionConfig }
    const response = await invokeSequence({ actionRequestContext, logger: mockLogger })
    expect(response).toEqual({ body: { error: 'Sequence component does not exist.' }, statusCode: 400 })
  })

  test('defined sequence (one action)', async () => {
    const packageName = 'foo'

    const sequence = { actions: 'a' }
    const actionConfig = {
      [packageName]: {
        actions: {
          a: {
            function: fixturePath('actions/successNoReturnAction.js')
          }
        }
      }
    }
    const actionRequestContext = { contextItem: sequence, contextItemParams: {}, packageName, actionConfig }
    const response = await invokeSequence({ actionRequestContext, logger: mockLogger })
    expect(response).toEqual({ body: '', statusCode: 204 })
  })

  test('defined sequence (multiple actions)', async () => {
    const packageName = 'foo'

    const sequence = { actions: 'a, b, c' }
    const actionConfig = {
      [packageName]: {
        actions: {
          a: { function: fixturePath('actions/successNoReturnAction.js') },
          b: { function: fixturePath('actions/successNoReturnAction.js') },
          c: { function: fixturePath('actions/successNoReturnAction.js') }
        }
      }
    }
    const actionRequestContext = { contextItem: sequence, contextItemParams: {}, packageName, actionConfig }
    const response = await invokeSequence({ actionRequestContext, logger: mockLogger })
    expect(response).toEqual({ body: '', statusCode: 204 })
  })

  test('sequence with action that does not return an object (coverage)', async () => {
    const packageName = 'foo'

    const sequence = { actions: 'a, b' }
    const actionConfig = {
      [packageName]: {
        actions: {
          a: { function: fixturePath('actions/successNoReturnAction.js') },
          b: { function: fixturePath('actions/successReturnNonObject.js') }
        }
      }
    }
    const actionRequestContext = { contextItem: sequence, contextItemParams: {}, packageName, actionConfig }
    const response = await invokeSequence({ actionRequestContext, logger: mockLogger })
    expect(response).toEqual({ body: '', statusCode: 200 })
  })

  // successReturnNonObject

  test('action not found', async () => {
    const packageName = 'foo'
    const sequence = { actions: 'a, unknown_action' }
    const actionConfig = {
      [packageName]: {
        actions: {
          a: { function: fixturePath('actions/successNoReturnAction.js') }
        }
      }
    }

    const actionRequestContext = { contextItem: sequence, contextItemParams: {}, packageName, actionConfig }
    const response = await invokeSequence({ actionRequestContext, logger: mockLogger })
    expect(response).toEqual({ body: { error: 'Sequence component does not exist.' }, statusCode: 400 })
  })

  test('require-adobe-auth, but no authorization header', async () => {
    const packageName = 'foo'
    const sequence = { actions: 'a' }
    const sequenceParams = {}
    const actionConfig = {
      [packageName]: {
        actions: {
          a: {
            function: fixturePath('actions/successNoReturnAction.js'),
            annotations: {
              'require-adobe-auth': true
            }
          }
        }
      }
    }

    const actionRequestContext = { contextItem: sequence, contextItemParams: sequenceParams, packageName, actionConfig }
    const response = await invokeSequence({ actionRequestContext, logger: mockLogger })
    expect(response).toEqual({ body: { error: 'cannot authorize request, reason: missing authorization header' }, statusCode: 401 })
  })

  test('require-adobe-auth, with authorization header (lowercase and uppercase)', async () => {
    const packageName = 'foo'
    const sequence = { actions: 'a' }
    const actionConfig = {
      [packageName]: {
        actions: {
          a: {
            function: fixturePath('actions/successNoReturnAction.js'),
            annotations: {
              'require-adobe-auth': true
            }
          }
        }
      }
    }

    // 1. lowercase
    {
      const sequenceParams = {
        __ow_headers: {
          authorization: 'some-auth-key',
          'x-gw-ims-org-id': 'some-org-id'
        }
      }
      const actionRequestContext = { contextItem: sequence, contextItemParams: sequenceParams, packageName, actionConfig }
      const response = await invokeSequence({ actionRequestContext, logger: mockLogger })
      expect(response).toEqual({ body: '', statusCode: 204 })
    }
    // 2. Uppercase
    {
      const sequenceParams = {
        __ow_headers: {
          Authorization: 'some-auth-key',
          'x-gw-ims-org-id': 'some-org-id'
        }
      }
      const actionRequestContext = { contextItem: sequence, contextItemParams: sequenceParams, packageName, actionConfig }
      const response = await invokeSequence({ actionRequestContext, logger: mockLogger })
      expect(response).toEqual({ body: '', statusCode: 204 })
    }
  })

  test('action that throws an exception', async () => {
    const packageName = 'foo'
    const sequence = { actions: 'a' }
    const sequenceParams = {}
    const actionConfig = {
      [packageName]: {
        actions: {
          a: { function: fixturePath('actions/throwExceptionAction.js') }
        }
      }
    }

    const actionRequestContext = { contextItem: sequence, contextItemParams: sequenceParams, packageName, actionConfig }
    const response = await invokeSequence({ actionRequestContext, logger: mockLogger })
    expect(response).toEqual({ body: { error: "Response is not valid 'message/http'." }, statusCode: 400 })
  })

  test('action that does not export main', async () => {
    const packageName = 'foo'
    const sequence = { actions: 'a' }
    const sequenceParams = {}
    const actionConfig = {
      [packageName]: {
        actions: {
          a: { function: fixturePath('actions/noMainAction.js') }
        }
      }
    }

    const actionRequestContext = { contextItem: sequence, contextItemParams: sequenceParams, packageName, actionConfig }
    const response = await invokeSequence({ actionRequestContext, logger: mockLogger })
    expect(response).toEqual({ body: { error: "Response is not valid 'message/http'." }, statusCode: 400 })
  })

  test('sequence pass params between sequence actions', async () => {
    const packageName = 'foo'

    // multiple actions in sequence
    const sequence = { actions: 'a, b' }
    const sequenceParams = {
      payload: '1,2,3'
    }
    const actionConfig = {
      [packageName]: {
        actions: {
          a: { function: fixturePath('actions/addNumbersAction.js') },
          b: { function: fixturePath('actions/squareNumberAction.js') }
        }
      }
    }
    const actionRequestContext = { contextItem: sequence, contextItemParams: sequenceParams, packageName, actionConfig }
    const response = await invokeSequence({ actionRequestContext, logger: mockLogger })
    // result of sequence with the two actions: 1+2+3 = 6, then 6*6 = 36
    expect(response).toMatchObject({ body: { payload: 36 }, statusCode: 200 })
  })
})

describe('runDev', () => {
  test('no front end, no back end', async () => {
    const config = createConfig({
      hasFrontend: false,
      hasBackend: false,
      packageName: 'mypackage',
      actions: {
        myaction: { function: fixturePath('actions/successNoReturnAction.js') }
      }
    })
    const runOptions = createRunOptions({ cert: 'my-cert', key: 'my-key' })
    const hookRunner = () => {}
    const { frontendUrl, actionUrls, serverCleanup } = await runDev(runOptions, config, hookRunner)

    await serverCleanup()

    expect(frontendUrl).not.toBeDefined()
    expect(Object.keys(actionUrls).length).toEqual(0)
  })

  test('no front end, has back end', async () => {
    const config = createConfig({
      hasFrontend: false,
      hasBackend: true,
      packageName: 'mypackage',
      actions: {
        myaction: { function: fixturePath('actions/successNoReturnAction.js') }
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
        myaction: { function: fixturePath('actions/successNoReturnAction.js') }
      }
    })
    const runOptions = createRunOptions({ cert: 'my-cert', key: 'my-key' })
    const hookRunner = () => {}
    mockGetPort.mockImplementation(({ port }) => port)
    const mockStatus = jest.fn()
    const mockSend = jest.fn()
    const res = createRes({ mockStatus, mockSend })
    const req = createReq({ url: 'foo/bar' })

    const bundleEvent = createBundlerEvent()
    const bundlerWatch = (fn) => fn(null, bundleEvent)
    mockLibWeb.bundle.mockResolvedValue({
      run: jest.fn(),
      watch: bundlerWatch
    })

    mockExpress.all.mockImplementation((_, fn) => {
      fn(req, res)
    })

    // 1. run options https
    {
      const { frontendUrl, actionUrls, serverCleanup } = await runDev(runOptions, config, hookRunner)
      await serverCleanup()

      expect(frontendUrl).toBeDefined()
      expect(new URL(frontendUrl).protocol).toEqual('https:')
      expect(Object.keys(actionUrls).length).toBeGreaterThan(0)
      // this next test is important: this is how VS Code debug launch configuration reads the port, from the log
      // see: https://github.com/adobe/generator-aio-app/blob/master/test/__fixtures__/add-vscode-config/launch.json
      expect(mockLogger.info).toHaveBeenCalledWith(`server running on port : ${SERVER_DEFAULT_PORT}`)
    }

    // 1. run options *not* https
    {
      const { frontendUrl, actionUrls, serverCleanup } = await runDev({}, config, hookRunner)
      await serverCleanup()

      expect(frontendUrl).toBeDefined()
      expect(new URL(frontendUrl).protocol).toEqual('http:')
      expect(Object.keys(actionUrls).length).toBeGreaterThan(0)
    }
  })

  test('has front end, has back end, default ports taken', async () => {
    const config = createConfig({
      hasFrontend: true,
      hasBackend: true,
      packageName: 'mypackage',
      actions: {
        myaction: { function: fixturePath('actions/successNoReturnAction.js') }
      }
    })
    const runOptions = createRunOptions({ cert: 'my-cert', key: 'my-key' })
    const hookRunner = () => {}
    mockGetPort.mockImplementation(({ port }) => {
      return port + 1
    })

    const { frontendUrl, actionUrls, serverCleanup } = await runDev(runOptions, config, hookRunner)
    await serverCleanup()

    expect(frontendUrl).toBeDefined()
    expect(Object.keys(actionUrls).length).toBeGreaterThan(0)
  })

  test('has front end, has back end, bundler watch success', async () => {
    const config = createConfig({
      hasFrontend: true,
      hasBackend: true,
      packageName: 'mypackage',
      actions: {
        myaction: { function: fixturePath('actions/successNoReturnAction.js') }
      }
    })
    const runOptions = createRunOptions({ cert: 'my-cert', key: 'my-key' })
    const hookRunner = () => {}
    mockGetPort.mockImplementation(({ port }) => port)

    // 1. changed assets within limit
    {
      const changedAssets = [
        ['fileA', 'fileA/path/here'],
        ['fileB', 'fileB/path/here']
      ]
      const bundleEvent = createBundlerEvent({ changedAssets })
      const bundlerWatch = (fn) => {
        fn(null, bundleEvent)
      }
      mockLibWeb.bundle.mockResolvedValue({
        run: jest.fn(),
        watch: bundlerWatch
      })

      const { frontendUrl, actionUrls, serverCleanup } = await runDev(runOptions, config, hookRunner)
      await serverCleanup()

      expect(frontendUrl).toBeDefined()
      expect(Object.keys(actionUrls).length).toBeGreaterThan(0)
    }

    // 1. changed assets above limit (runOptions.verbose is false)
    {
      const changedAssets = [
        ['fileA', 'fileA/path/here'],
        ['fileB', 'fileB/path/here'],
        ['fileC', 'fileC/path/here'],
        ['fileD', 'fileD/path/here'],
        ['fileE', 'fileE/path/here'],
        ['fileF', 'fileF/path/here']
      ]
      const bundleEvent = createBundlerEvent({ changedAssets })
      const bundlerWatch = (fn) => {
        fn(null, bundleEvent)
      }
      mockLibWeb.bundle.mockResolvedValue({
        run: jest.fn(),
        watch: bundlerWatch
      })

      const { frontendUrl, actionUrls, serverCleanup } = await runDev(runOptions, config, hookRunner)
      await serverCleanup()

      expect(frontendUrl).toBeDefined()
      expect(Object.keys(actionUrls).length).toBeGreaterThan(0)
      expect(mockLogger.info).not.toHaveBeenCalledWith('\t-->', changedAssets.at(-1)[1]) // value of last item
    }

    // 1. changed assets above limit (runOptions.verbose is true)
    {
      const changedAssets = [
        ['fileA', 'fileA/path/here'],
        ['fileB', 'fileB/path/here'],
        ['fileC', 'fileC/path/here'],
        ['fileD', 'fileD/path/here'],
        ['fileE', 'fileE/path/here'],
        ['fileF', 'fileF/path/here']
      ]
      const bundleEvent = createBundlerEvent({ changedAssets })
      const bundlerWatch = (fn) => {
        fn(null, bundleEvent)
      }
      mockLibWeb.bundle.mockResolvedValue({
        run: jest.fn(),
        watch: bundlerWatch
      })

      runOptions.verbose = true
      const { frontendUrl, actionUrls, serverCleanup } = await runDev(runOptions, config, hookRunner)
      await serverCleanup()

      expect(frontendUrl).toBeDefined()
      expect(Object.keys(actionUrls).length).toBeGreaterThan(0)
      expect(mockLogger.info).toHaveBeenCalledWith('\t-->', changedAssets.at(-1)[1]) // value of last item
    }
  })

  test('has front end, has back end, bundler watch error', async () => {
    const config = createConfig({
      hasFrontend: true,
      hasBackend: true,
      packageName: 'mypackage',
      actions: {
        myaction: { function: fixturePath('actions/successNoReturnAction.js') }
      }
    })
    const runOptions = createRunOptions({ cert: 'my-cert', key: 'my-key' })
    const hookRunner = () => {}

    // 1. error in bundle.watch
    {
      const bundleEvent = createBundlerEvent()
      const bundleErr = { diagnostics: 'something went wrong' }
      mockLibWeb.bundle.mockResolvedValue({
        run: jest.fn(),
        watch: (fn) => {
          fn(bundleErr, bundleEvent)
        }
      })

      const { frontendUrl, actionUrls, serverCleanup } = await runDev(runOptions, config, hookRunner)
      await serverCleanup()

      expect(frontendUrl).toBeDefined()
      expect(Object.keys(actionUrls).length).toBeGreaterThan(0)
      expect(mockLogger.error).toHaveBeenCalledWith(bundleErr.diagnostics)
    }

    // 2. error in bundle build
    {
      const bundlerEventParams = { type: 'buildFailure', diagnostics: 'something went wrong' }
      const bundleEvent = createBundlerEvent(bundlerEventParams)
      mockLibWeb.bundle.mockResolvedValue({
        run: jest.fn(),
        watch: (fn) => {
          fn(null, bundleEvent)
        }
      })

      const { frontendUrl, actionUrls, serverCleanup } = await runDev(runOptions, config, hookRunner)
      await serverCleanup()

      expect(frontendUrl).toBeDefined()
      expect(Object.keys(actionUrls).length).toBeGreaterThan(0)
      expect(mockLogger.error).toHaveBeenCalledWith(bundlerEventParams.diagnostics)
    }

    // 2. unknown buildEvent type
    {
      const bundlerEventParams = { type: 'unknown_event_type', diagnostics: 'something went wrong 2' }
      const bundleEvent = createBundlerEvent(bundlerEventParams)
      mockLibWeb.bundle.mockResolvedValue({
        run: jest.fn(),
        watch: (fn) => {
          fn(null, bundleEvent)
        }
      })

      const { frontendUrl, actionUrls, serverCleanup } = await runDev(runOptions, config, hookRunner)
      await serverCleanup()

      expect(frontendUrl).toBeDefined()
      expect(Object.keys(actionUrls).length).toBeGreaterThan(0)
    }
  })
})

describe('invokeAction', () => {
  test('successful action (200)', async () => {
    const packageName = 'foo'
    const action = { function: fixturePath('actions/successReturnAction.js') }
    const actionParams = {}
    const actionName = 'a'
    const actionConfig = {
      [packageName]: {
        actions: {
          [actionName]: action
        }
      }
    }

    const actionRequestContext = { contextItem: action, contextItemParams: actionParams, contextItemName: actionName, packageName, actionConfig }
    const response = await invokeAction({ actionRequestContext, logger: mockLogger })
    expect(response).toEqual({
      body: 'Hello Simple Action',
      headers: {
        'X-Awesome': true
      },
      statusCode: 200
    })
  })

  test('successful action (204)', async () => {
    const packageName = 'foo'
    const action = { function: fixturePath('actions/successNoReturnAction.js') }
    const actionParams = {}
    const actionName = 'a'
    const actionConfig = {
      [packageName]: {
        actions: {
          [actionName]: action
        }
      }
    }

    const actionRequestContext = { contextItem: action, contextItemParams: actionParams, contextItemName: actionName, packageName, actionConfig }
    const response = await invokeAction({ actionRequestContext, logger: mockLogger })
    expect(response).toEqual({ body: '', statusCode: 204 })
  })

  test('exception in action (400)', async () => {
    const packageName = 'foo'
    const action = { function: fixturePath('actions/throwExceptionAction.js') }
    const actionParams = {}
    const actionName = 'a'
    const actionConfig = {
      [packageName]: {
        actions: {
          [actionName]: action
        }
      }
    }

    const actionRequestContext = { contextItem: action, contextItemParams: actionParams, contextItemName: actionName, packageName, actionConfig }
    const response = await invokeAction({ actionRequestContext, logger: mockLogger })
    expect(response).toEqual({ body: { error: "Response is not valid 'message/http'." }, statusCode: 400 })
  })

  test('error object returned in action (400)', async () => {
    const packageName = 'foo'
    const action = { function: fixturePath('actions/returnErrorAction.js') }
    const actionParams = {}
    const actionName = 'a'
    const actionConfig = {
      [packageName]: {
        actions: {
          [actionName]: action
        }
      }
    }

    const actionRequestContext = { contextItem: action, contextItemParams: actionParams, contextItemName: actionName, packageName, actionConfig }
    const response = await invokeAction({ actionRequestContext, logger: mockLogger })
    expect(response).toEqual({ body: { error: 'something wrong happened here' }, statusCode: 403 })
  })

  test('error action cannot load action (400)', async () => {
    const packageName = 'foo'
    const action = { function: fixturePath('actions/syntaxErrorAction.js') }
    const actionParams = {}
    const actionName = 'a'
    const actionConfig = {
      [packageName]: {
        actions: {
          [actionName]: action
        }
      }
    }

    const actionRequestContext = { contextItem: action, contextItemParams: actionParams, contextItemName: actionName, packageName, actionConfig }
    const response = await invokeAction({ actionRequestContext, logger: mockLogger })
    expect(response).toMatchObject({ body: { error: expect.stringMatching('Error loading action function:') }, statusCode: 400 })
  })
})
