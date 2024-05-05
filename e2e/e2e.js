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
const chalk = require('chalk')
const { stdout } = require('stdout-stderr')
const fs = require('fs-extra')
const path = require('node:path')
const { createFetch } = require('@adobe/aio-lib-core-networking')
const fetch = createFetch()
const https = require('node:https')

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
  console.log(chalk.blue(`> e2e tests for ${chalk.bold(name)}`))

  console.log(chalk.dim('    - boilerplate help ..'))
  expect(() => { execa.sync('./bin/run', ['--help'], { stderr: 'inherit' }) }).not.toThrow()

  console.log(chalk.green(`    - done for ${chalk.bold(name)}`))
})

describe('test-project', () => {
  const port = 9080
  let serverProcess

  beforeAll(async () => {
    serverProcess = startServer({ e2eProject: 'test-project', port })
    const timeoutMs = 10000
    await waitForServerReady({
      host: `https://127.0.0.1:${port}`,
      startTime: Date.now(),
      period: 1000,
      timeout: timeoutMs
    })
  })

  afterAll(() => {
    console.log(`killed server at port ${port}:`, serverProcess.kill('SIGTERM', {
      forceKillAfterTimeout: 2000
    }))
  })

  test('front end is available', async () => {
    const host = 'https://localhost:9080/index.html'

    const response = await fetch(host, { agent: httpsAgent })
    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
  })

  test('action requires adobe auth (*no* auth provided)', async () => {
    const host = 'https://localhost:9080/api/v1/web/dx-excshell-1/requireAdobeAuth'

    const response = await fetch(host, { agent: httpsAgent })
    expect(response.ok).toBeFalsy()
    expect(response.status).toEqual(401)
  })

  test('action requires adobe auth (auth is provided)', async () => {
    const host = 'https://localhost:9080/api/v1/web/dx-excshell-1/requireAdobeAuth'

    const response = await fetch(host, {
      agent: httpsAgent,
      headers: {
        Authorization: 'something'
      }
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toEqual(200)
  })
})
