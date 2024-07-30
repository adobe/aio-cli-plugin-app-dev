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
const { stdout } = require('stdout-stderr')
const fs = require('fs-extra')
const path = require('node:path')
const { createFetch } = require('@adobe/aio-lib-core-networking')
const fetch = createFetch()
const https = require('node:https')
const { DEV_API_PREFIX, DEV_API_WEB_PREFIX } = require('../src/lib/constants')
const treeKill = require('tree-kill')

jest.unmock('execa')
jest.setTimeout(60000)

// load .env values in the e2e folder, if any
require('dotenv').config({ path: path.join(__dirname, '.env') })

const LOCALHOST = 'localhost'
const {
  E2E_SCHEME = 'https',
  E2E_PROJECT = 'test-project',
  E2E_CDN_HOST = LOCALHOST,
  E2E_API_HOST = E2E_CDN_HOST,
  E2E_PORT = 9080,
  E2E_PACKAGE_NAME = 'dx-excshell-1',
  E2E_ACCESS_TOKEN = 'some-auth-key',
  E2E_GW_IMS_ORG_ID = 'some-org-id'
} = process.env

const HTTPS_AGENT = E2E_CDN_HOST === LOCALHOST
  ? new https.Agent({ rejectUnauthorized: false })
  : undefined

const waitForServerReady = async ({ host, startTime, period, timeout, lastStatus }) => {
  const now = Date.now()
  if (now > (startTime + timeout)) {
    throw new Error(`local dev server startup timed out after ${timeout}ms due to ${lastStatus} ${now} ${startTime} ${timeout}`)
  }

  let ok, status

  try {
    const response = await fetch(host, { agent: HTTPS_AGENT })
    ok = response.ok
    status = response.statusText
  } catch (e) {
    ok = false
    status = e.toString()
  }

  if (!ok) {
    await waitFor(period)
    return waitForServerReady({ host, startTime, period, timeout, status })
  }
}

const waitFor = (t) => {
  return new Promise(resolve => setTimeout(resolve, t))
}

const startServer = ({ e2eProject, port }) => {
  const cwd = path.join(__dirname, e2eProject)
  const projectNodeModules = path.join(cwd, 'node_modules')
  const cmd = path.join(__dirname, '..', 'bin', 'run')

  if (!fs.pathExistsSync(projectNodeModules)) {
    console.warn(`It looks like the project at ${cwd} was not installed via 'npm install'. Running 'npm install'.`)
    execa.sync('npm', ['install'], {
      stdio: 'inherit',
      cwd
    })
  }

  return execa.command(`${cmd} app dev`, {
    stdio: 'inherit',
    env: { LOG_LEVEL: 'info', SERVER_DEFAULT_PORT: port },
    cwd
  })
}

beforeAll(async () => {
  stdout.start()
  stdout.print = true
})

test('boilerplate help test', async () => {
  const packagejson = JSON.parse(fs.readFileSync('package.json').toString())
  const name = `${packagejson.name}`
  console.log(`> e2e tests for ${name}`)

  console.log('    - boilerplate help ..')
  expect(() => { execa.sync('./bin/run', ['--help'], { stdio: 'inherit' }) }).not.toThrow()

  console.log(`    - done for ${name}`)
})

describe('http api tests', () => {
  let serverProcess

  const createApiUrl = ({ host = E2E_CDN_HOST, isWeb = true, packageName = E2E_PACKAGE_NAME, actionName }) => {
    const prefix = isWeb ? DEV_API_WEB_PREFIX : DEV_API_PREFIX
    return `${E2E_SCHEME}://${host}:${E2E_PORT}/${prefix}/${packageName}/${actionName}`
  }

  beforeAll(async () => {
    if (E2E_CDN_HOST === 'localhost') {
      serverProcess = startServer({ e2eProject: E2E_PROJECT, port: E2E_PORT })
      const timeoutMs = 10000
      await waitForServerReady({
        host: `${E2E_SCHEME}://${E2E_CDN_HOST}:${E2E_PORT}`,
        startTime: Date.now(),
        period: 1000,
        timeout: timeoutMs
      })
    }
  })

  afterAll(() => {
    if (E2E_CDN_HOST === 'localhost') {
      // we use tree-kill to solve the issue on Windows where grand-child processes are not killed (via node's child_process)
      // the module uses OS specific processes to find all related pids and kill them
      return new Promise((resolve) => treeKill(serverProcess.pid, 'SIGTERM', resolve))
    }
  })

  test('non-raw: post application/x-www-form-urlencoded (should be promoted to params)', async () => {
    const key = 'some_key'
    const value = 'some_value'

    const url = createApiUrl({ actionName: 'post-data' })
    const formData = new URLSearchParams()
    formData.append(key, value)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString(),
      agent: HTTPS_AGENT
    })

    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
    const responseJson = await response.json()
    expect(responseJson.params).toMatchObject({ [key]: value })
  })

  test('non-raw: post application/json (should be promoted to params)', async () => {
    const key = 'some_key'
    const value = 'some_value'

    const url = createApiUrl({ actionName: 'post-data' })
    const body = JSON.stringify({
      [key]: value
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body,
      agent: HTTPS_AGENT
    })

    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
    const responseJson = await response.json()
    expect(responseJson.params).toMatchObject({ [key]: value })
  })

  test('non-raw: post unknown content-type', async () => {
    // any other content-type, the body will be base64 encoded into __ow_body
    const key = 'some_key'
    const value = 'some_value'

    const url = createApiUrl({ actionName: 'post-data' })
    const body = JSON.stringify({
      [key]: value
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-some-thing'
      },
      body,
      agent: HTTPS_AGENT
    })

    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
    const responseJson = await response.json()
    expect(responseJson.params).toMatchObject({ __ow_body: Buffer.from(body).toString('base64') })
  })

  test('non-raw: post unknown content-type, no body', async () => {
    const url = createApiUrl({ actionName: 'post-data' })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-some-thing'
      },
      agent: HTTPS_AGENT
    })

    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
    const responseJson = await response.json()
    expect(responseJson.params).toMatchObject({ __ow_body: '' })
  })

  test('raw: post multipart/form-data content-type', async () => {
    // NOTE: for this content-type, raw will always set __ow_body (base64 encoded)
    const url = createApiUrl({ actionName: 'post-raw-data' })
    const body = 'hey jude don\'t carry the world upon your shoulders'

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      body,
      agent: HTTPS_AGENT
    })

    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
    const responseJson = await response.json()
    expect(responseJson.params).toMatchObject({ __ow_body: Buffer.from(body).toString('base64') })
  })

  test('raw: post application/json content-type', async () => {
    // NOTE: raw will always set __ow_body (base64 encoded) and not promote the body to parameters
    const url = createApiUrl({ actionName: 'post-raw-data' })
    const body = JSON.stringify({ hello: 'world' })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body,
      agent: HTTPS_AGENT
    })

    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
    const responseJson = await response.json()
    expect(responseJson.params).toMatchObject({ __ow_body: Buffer.from(body).toString('base64') })
  })

  test('raw: post application/x-www-form-urlencoded content-type', async () => {
    // SPECIAL NOTE:
    // this content-type as raw, will set __ow_body (*NOT* base64 encoded) as the query string
    // and not promote the body to parameters
    const url = createApiUrl({ actionName: 'post-raw-data' })
    const formData = new URLSearchParams()
    formData.append('some_key', 'some_value')
    formData.append('some_other_key', 'some_other_value')
    const body = formData.toString()

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body,
      agent: HTTPS_AGENT
    })

    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
    const responseJson = await response.json()
    expect(responseJson.params).toMatchObject({ __ow_body: body })
  })

  test('raw: post unknown content-type', async () => {
    // NOTE: for any other content-type, raw will always set __ow_body (base64 encoded)
    const url = createApiUrl({ actionName: 'post-raw-data' })
    const body = '99 luftballons'

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-foo-bar'
      },
      body,
      agent: HTTPS_AGENT
    })

    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
    const responseJson = await response.json()
    expect(responseJson.params).toMatchObject({ __ow_body: Buffer.from(body).toString('base64') })
  })

  test('front end is available (200)', async () => {
    const url = `https://${E2E_CDN_HOST}:${E2E_PORT}/index.html`

    const response = await fetch(url, { agent: HTTPS_AGENT })
    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
    expect(await response.text()).toMatch('<html')
  })

  test('web action requires adobe auth, *no* auth provided (401)', async () => {
    const url = createApiUrl({ actionName: 'requireAdobeAuth' })

    const response = await fetch(url, { agent: HTTPS_AGENT })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(401)
    expect(await response.json()).toMatchObject({
      error: 'cannot authorize request, reason: missing authorization header'
    })
  })

  test('web action with syntax error (400)', async () => {
    const url = createApiUrl({ actionName: 'syntaxError' })

    const response = await fetch(url, { agent: HTTPS_AGENT })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(400)
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching('Response is not valid \'message/http\'.')
    })
  })

  test('web action requires adobe auth, auth is provided (200)', async () => {
    const url = createApiUrl({ actionName: 'requireAdobeAuth' })

    const response = await fetch(url, {
      agent: HTTPS_AGENT,
      headers: {
        Authorization: `Bearer ${E2E_ACCESS_TOKEN}`,
        'x-gw-ims-org-id': E2E_GW_IMS_ORG_ID
      }
    })

    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
    expect(await response.text()).toEqual(expect.any(String))
  })

  test('web actions (no adobe auth) (200/204)', async () => {
    // 1. action sends response object
    {
      const url = createApiUrl({ actionName: 'noAdobeAuth' })

      const response = await fetch(url, { agent: HTTPS_AGENT })
      expect(response.ok).toBeTruthy()
      expect(response.status).toEqual(200)
      expect(await response.text()).toEqual(expect.any(String))
    }
    // 2. action *does not* send response object
    {
      const url = createApiUrl({ actionName: 'noResponseObject' })

      const response = await fetch(url, { agent: HTTPS_AGENT })
      expect(response.ok).toBeTruthy()
      expect(response.status).toEqual(204)
      expect(await response.text()).toEqual('') // no body
    }
  })

  test('web action is not found (404)', async () => {
    const url = createApiUrl({ actionName: 'SomeActionThatDoesNotExist' })

    const response = await fetch(url, { agent: HTTPS_AGENT })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(404)
    expect(await response.json()).toMatchObject({
      error: 'The requested resource does not exist.'
    })
  })

  test('web action throws an exception (400)', async () => {
    const url = createApiUrl({ actionName: 'throwsError' })

    const response = await fetch(url, { agent: HTTPS_AGENT })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(400)
    expect(await response.json()).toMatchObject({
      error: 'Response is not valid \'message/http\'.'
    })
  })

  test('web action does not have a main function export (400)', async () => {
    const url = createApiUrl({ actionName: 'noMainExport' })

    const response = await fetch(url, { agent: HTTPS_AGENT })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(400)
    expect(await response.json()).toMatchObject({
      error: 'Response is not valid \'message/http\'.'
    })
  })

  test('web sequence with all actions available (200)', async () => {
    const url = createApiUrl({ actionName: 'sequenceWithAllActionsAvailable' })

    const response = await fetch(url, { agent: HTTPS_AGENT })
    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
  })

  test('web sequence with an action that throws an error (400)', async () => {
    const url = createApiUrl({ actionName: 'sequenceWithActionThatThrowsError' })

    const response = await fetch(url, { agent: HTTPS_AGENT })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(400)
    expect(await response.json()).toMatchObject({
      error: 'Response is not valid \'message/http\'.'
    })
  })

  test('web sequence with an action that has no main export (400)', async () => {
    const url = createApiUrl({ actionName: 'sequenceWithActionThatHasNoMainExport' })

    const response = await fetch(url, { agent: HTTPS_AGENT })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(400)
    expect(await response.json()).toMatchObject({
      error: 'Response is not valid \'message/http\'.'
    })
  })

  test('web sequence with a payload and expected result (200)', async () => {
    // 1. add 1,2,3,4 = 10, then 10^2 = 100
    {
      const url = createApiUrl({ actionName: 'addNumbersThenSquareIt?payload=1,2,3,4' })
      const response = await fetch(url, {
        agent: HTTPS_AGENT
      })
      expect(response.ok).toBeTruthy()
      expect(response.status).toEqual(200)
      expect(await response.json()).toEqual({ payload: 100 })
    }
    // 2. add 9,5,2,7 = 23, then 23^2 = 529
    {
      const url = createApiUrl({ actionName: 'addNumbersThenSquareIt?payload=9,5,2,7' })
      const response = await fetch(url, {
        agent: HTTPS_AGENT
      })
      expect(response.ok).toBeTruthy()
      expect(response.status).toEqual(200)
      expect(await response.json()).toEqual({ payload: 529 })
    }
  })

  test('non-web sequence called via /api/v1/web (404)', async () => {
    const expectedStatusCode = 404

    const url = createApiUrl({ isWeb: true, actionName: 'nonWebSequence' })

    const response = await fetch(url, { agent: HTTPS_AGENT })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(expectedStatusCode)
  })

  test('non-web action called via /api/v1/web (404)', async () => {
    const expectedStatusCode = 404

    const url = createApiUrl({ isWeb: true, host: E2E_API_HOST, actionName: 'actionIsNonWeb' })

    const response = await fetch(url, { agent: HTTPS_AGENT })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(expectedStatusCode)
  })

  test('non-web actions should always be unauthorized (401)', async () => {
    const expectedStatusCode = 401

    // 1. non-web action exists
    {
      const url = createApiUrl({ isWeb: false, host: E2E_API_HOST, actionName: 'actionIsNonWeb' })

      const response = await fetch(url, { agent: HTTPS_AGENT })
      expect(response.ok).toBeFalsy()
      expect(response.status).toEqual(expectedStatusCode)
    }
    // 2. non-web action not found
    {
      const url = createApiUrl({ isWeb: false, host: E2E_API_HOST, actionName: 'SomeActionThatDoesNotExist' })

      const response = await fetch(url, { agent: HTTPS_AGENT })
      expect(response.ok).toBeFalsy()
      expect(response.status).toEqual(expectedStatusCode)
    }
  })

  test('non-web sequences should always be unauthorized (401)', async () => {
    const expectedStatusCode = 401

    // 1. non-web sequence exists
    {
      const url = createApiUrl({ isWeb: false, host: E2E_API_HOST, actionName: 'nonWebSequence' })

      const response = await fetch(url, { agent: HTTPS_AGENT })
      expect(response.ok).toBeFalsy()
      expect(response.status).toEqual(expectedStatusCode)
    }
    // 2. non-web sequence not found
    {
      const url = createApiUrl({ isWeb: false, host: E2E_API_HOST, actionName: 'SomeSequenceThatDoesNotExist' })

      const response = await fetch(url, { agent: HTTPS_AGENT })
      expect(response.ok).toBeFalsy()
      expect(response.status).toEqual(expectedStatusCode)
    }
  })
})
