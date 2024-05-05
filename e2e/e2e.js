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
let devServerProcess

beforeAll(async () => {
  stdout.start()
  stdout.print = true

  const cwd = path.join(__dirname, 'test-project')
  const cmd = path.join(__dirname, '..', 'bin', 'run')

  devServerProcess = execa.command(`${cmd} app dev`, {
    stdio: 'inherit',
    env: { LOG_LEVEL: 'info' },
    cwd
  })

  // wait until server is ready
  const timeOutSeconds = 10
  let timedOut = false
  let ready = false

  const timerId = setTimeout(() => {
    timedOut = true
  }, timeOutSeconds * 1000)

  do {
    try {
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false
      })

      const { ok, status } = await fetch('https://127.0.0.1:9080', { agent: httpsAgent })
      if (ok && status === 200) {
        ready = true
      }
    } catch (e) {
      console.error(e)
    }
  // eslint-disable-next-line no-unmodified-loop-condition
  } while (!ready && !timedOut)

  clearTimeout(timerId)
  if (timedOut) {
    throw new Error('Timed out waiting for the dev server to be ready.')
  }
})

afterAll(() => {
  console.log('killed server', devServerProcess.kill('SIGTERM', {
    forceKillAfterTimeout: 2000
  }))
})

test('boilerplate help test', async () => {
  const packagejson = JSON.parse(fs.readFileSync('package.json').toString())
  const name = `${packagejson.name}`
  console.log(chalk.blue(`> e2e tests for ${chalk.bold(name)}`))

  console.log(chalk.dim('    - boilerplate help ..'))
  expect(() => { execa.sync('./bin/run', ['--help'], { stderr: 'inherit' }) }).not.toThrow()

  console.log(chalk.green(`    - done for ${chalk.bold(name)}`))
})

test('launch and kill the dev server', async () => {
})
