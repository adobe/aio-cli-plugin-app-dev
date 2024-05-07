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

jest.unmock('execa')
jest.setTimeout(30000)

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
})

const waitForServerReady = async ({ host, startTime, period, timeout, lastStatus }) => {
  if (Date.now() > (startTime + timeout)) {
    throw new Error(`local dev server startup timed out after ${timeout}ms due to ${lastStatus}`)
  }

  let ok, status

  try {
    const response = await fetch(host, { agent: httpsAgent })
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

describe('test-project http api tests', () => {
  const SCHEME = 'https'
  const PROJECT = 'test-project'
  const HOST = 'localhost'
  const PORT = 9080
  const PACKAGE_NAME = 'dx-excshell-1'

  let serverProcess

  const createApiUrl = ({ scheme = SCHEME, isWeb = true, packageName = PACKAGE_NAME, actionName }) => {
    const prefix = isWeb ? DEV_API_WEB_PREFIX : DEV_API_PREFIX
    return `${scheme}://${HOST}:${PORT}/${prefix}/${packageName}/${actionName}`
  }

  beforeAll(async () => {
    serverProcess = startServer({ e2eProject: PROJECT, PORT })
    const timeoutMs = 10000
    await waitForServerReady({
      host: `${SCHEME}://${HOST}:${PORT}`,
      startTime: Date.now(),
      period: 1000,
      timeout: timeoutMs
    })
  })

  afterAll(() => {
    console.log(`killed server at port ${PORT}:`, serverProcess?.kill?.('SIGTERM', {
      forceKillAfterTimeout: 2000
    }))
  })

  test('front end is available (200)', async () => {
    const url = `https://${HOST}:${PORT}/index.html`

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
    expect(await response.text()).toMatch('<html')
  })

  test('web action requires adobe auth, *no* auth provided (401)', async () => {
    const url = createApiUrl({ actionName: 'requireAdobeAuth' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(401)
    expect(await response.json()).toEqual({
      error: 'cannot authorize request, reason: missing authorization header'
    })
  })

  test('web action requires adobe auth, auth is provided (200)', async () => {
    const url = createApiUrl({ actionName: 'requireAdobeAuth' })

    const response = await fetch(url, {
      agent: httpsAgent,
      headers: {
        Authorization: 'something'
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

      const response = await fetch(url, { agent: httpsAgent })
      expect(response.ok).toBeTruthy()
      expect(response.status).toEqual(200)
      expect(await response.text()).toEqual(expect.any(String))
    }
    // 2. action *does not* send response object
    {
      const url = createApiUrl({ actionName: 'noResponseObject' })

      const response = await fetch(url, { agent: httpsAgent })
      expect(response.ok).toBeTruthy()
      expect(response.status).toEqual(204)
      expect(await response.text()).toEqual('') // no body
    }
  })

  test('web action is not found (404)', async () => {
    const url = createApiUrl({ actionName: 'SomeActionThatDoesNotExist' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(404)
    expect(await response.json()).toEqual({
      error: 'The requested resource does not exist.'
    })
  })

  test('web action throws an exception (400)', async () => {
    const url = createApiUrl({ actionName: 'throwsError' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: 'Response is not valid \'message/http\'.'
    })
  })

  test('web action does not have a main function export (400)', async () => {
    const url = createApiUrl({ actionName: 'noMainExport' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: 'Response is not valid \'message/http\'.'
    })
  })

  test('web sequence with all actions available (200)', async () => {
    const url = createApiUrl({ actionName: 'sequenceWithAllActionsAvailable' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
  })

  test('web sequence with missing action (400)', async () => {
    const url = createApiUrl({ actionName: 'sequenceWithMissingAction' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: 'Sequence component does not exist.'
    })
  })

  test('web sequence with an action that throws an error (400)', async () => {
    const url = createApiUrl({ actionName: 'sequenceWithActionThatThrowsError' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: 'Response is not valid \'message/http\'.'
    })
  })

  test('web sequence with an action that has no main export (400)', async () => {
    const url = createApiUrl({ actionName: 'sequenceWithActionThatHasNoMainExport' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: 'Response is not valid \'message/http\'.'
    })
  })

  test('web sequence with a payload and expected result (200)', async () => {
    // 1. add 1,2,3,4 = 10, then 10^2 = 100
    {
      const url = createApiUrl({ actionName: 'addNumbersThenSquareIt?payload=1,2,3,4' })
      const response = await fetch(url, {
        agent: httpsAgent
      })
      expect(response.ok).toBeTruthy()
      expect(response.status).toEqual(200)
      expect(await response.json()).toEqual({ payload: 100 })
    }
    // 2. add 9,5,2,7 = 23, then 23^2 = 529
    {
      const url = createApiUrl({ actionName: 'addNumbersThenSquareIt?payload=9,5,2,7' })
      const response = await fetch(url, {
        agent: httpsAgent
      })
      expect(response.ok).toBeTruthy()
      expect(response.status).toEqual(200)
      expect(await response.json()).toEqual({ payload: 529 })
    }
  })

  test('non-web sequence called via /api/v1/web (404)', async () => {
    const expectedStatusCode = 404

    const url = createApiUrl({ isWeb: true, actionName: 'nonWebSequence' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(expectedStatusCode)
  })

  test('non-web action called via /api/v1/web (404)', async () => {
    const expectedStatusCode = 404

    const url = createApiUrl({ isWeb: true, actionName: 'actionIsNonWeb' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(expectedStatusCode)
  })

  test('non-web actions should always be unauthorized (401)', async () => {
    const expectedStatusCode = 401

    // 1. non-web action exists
    {
      const url = createApiUrl({ isWeb: false, actionName: 'actionIsNonWeb' })

      const response = await fetch(url, { agent: httpsAgent })
      expect(response.ok).toBeFalsy()
      expect(response.status).toEqual(expectedStatusCode)
    }
    // 2. non-web action not found
    {
      const url = createApiUrl({ isWeb: false, actionName: 'SomeActionThatDoesNotExist' })

      const response = await fetch(url, { agent: httpsAgent })
      expect(response.ok).toBeFalsy()
      expect(response.status).toEqual(expectedStatusCode)
    }
  })

  test('non-web sequences should always be unauthorized (401)', async () => {
    const expectedStatusCode = 401

    // 1. non-web sequence exists
    {
      const url = createApiUrl({ isWeb: false, actionName: 'nonWebSequence' })

      const response = await fetch(url, { agent: httpsAgent })
      expect(response.ok).toBeFalsy()
      expect(response.status).toEqual(expectedStatusCode)
    }
    // 2. non-web sequence not found
    {
      const url = createApiUrl({ isWeb: false, actionName: 'SomeSequenceThatDoesNotExist' })

      const response = await fetch(url, { agent: httpsAgent })
      expect(response.ok).toBeFalsy()
      expect(response.status).toEqual(expectedStatusCode)
    }
  })
})
