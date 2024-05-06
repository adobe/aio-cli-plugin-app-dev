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
  const cmd = path.join(__dirname, '..', 'bin', 'run')

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
  const HOST = 'localhost'
  const PORT = 9080
  const PACKAGE_NAME = 'dx-excshell-1'

  let serverProcess

  const createApiUrl = ({ scheme = 'https', isWeb = true, packageName = PACKAGE_NAME, actionName }) => {
    const prefix = isWeb ? DEV_API_WEB_PREFIX : DEV_API_PREFIX
    return `${scheme}://${HOST}:${PORT}/${prefix}/${packageName}/${actionName}`
  }

  beforeAll(async () => {
    serverProcess = startServer({ e2eProject: 'test-project', PORT })
    const timeoutMs = 10000
    await waitForServerReady({
      host: `https://localhost:${PORT}`,
      startTime: Date.now(),
      period: 1000,
      timeout: timeoutMs
    })
  })

  afterAll(() => {
    console.log(`killed server at port ${PORT}:`, serverProcess.kill('SIGTERM', {
      forceKillAfterTimeout: 2000
    }))
  })

  test('front end is available (200)', async () => {
    const url = `https://${HOST}:${PORT}/index.html`

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
  })

  test('web action requires adobe auth, *no* auth provided (401)', async () => {
    const url = createApiUrl({ actionName: 'requireAdobeAuth' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(401)
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
  })

  test('web actions (no adobe auth) (200)', async () => {
    // 1. action sends response object
    {
      const url = createApiUrl({ actionName: 'noAdobeAuth' })

      const response = await fetch(url, { agent: httpsAgent })
      expect(response.ok).toBeTruthy()
      expect(response.status).toEqual(200)
    }
    // 2. action *does not* send response object
    {
      const url = createApiUrl({ actionName: 'noResponseObject' })

      const response = await fetch(url, { agent: httpsAgent })
      expect(response.ok).toBeTruthy()
      expect(response.status).toEqual(200)
    }
  })

  test('web action is not found (404)', async () => {
    const url = createApiUrl({ actionName: 'SomeActionThatDoesNotExist' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(404)
  })

  test('web action throws an exception (500)', async () => {
    const url = createApiUrl({ actionName: 'throwsError' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(500)
  })

  test('web action does not have a main function export (401)', async () => {
    const url = createApiUrl({ actionName: 'noMainExport' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(401)
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

  test('sequence with all actions available (200)', async () => {
    const url = createApiUrl({ isWeb: false, actionName: 'sequenceWithAllActionsAvailable' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
  })

  test('sequence with missing action (404)', async () => {
    const url = createApiUrl({ isWeb: false, actionName: 'sequenceWithMissingAction' })

    const response = await fetch(url, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(404)
  })
})
