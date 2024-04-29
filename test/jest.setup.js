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

const { stdout, stderr } = require('stdout-stderr')
const fs = require('node:fs')
const path = require('node:path')
const eol = require('eol')

jest.setTimeout(30000)

// trap console log
beforeEach(() => {
  stdout.start()
  stderr.start()
  // change this if you need to see logs from stdout
  stdout.print = false
})
afterEach(() => { stdout.stop(); stderr.stop() })

process.on('unhandledRejection', error => {
  throw error
})

// don't wait for user input in tests
jest.mock('inquirer', () => ({ prompt: jest.fn(), createPromptModule: jest.fn(() => jest.fn()) }))
// make sure we mock the app scripts
jest.mock('@adobe/aio-lib-web')

jest.mock('ora')
jest.mock('execa')
jest.mock('@adobe/aio-lib-env')

/* global fixtureFile, fixtureJson */

const fixturesFolder = path.join(__dirname, '__fixtures__')

global.fixturePath = (file) => {
  return `${fixturesFolder}/${file}`
}
// helper for fixtures
global.fixtureFile = (output) => {
  return fs.readFileSync(global.fixturePath(output)).toString()
}

// helper for fixtures
global.fixtureJson = (output) => {
  return JSON.parse(fs.readFileSync(global.fixturePath(output)).toString())
}

// // helper for fixtures
// global.fixtureHjson = (output) => {
//   return hjson.parse(fs.readFileSync(global.fixturePath(output)).toString())
// }

// // helper for fixtures
// global.fixtureYaml = (output) => {
//   return jsYaml.load(fs.readFileSync(global.fixturePath(output)).toString())
// }

// fixture matcher
expect.extend({
  toMatchFixture (received, argument) {
    const val = fixtureFile(argument)
    // eslint-disable-next-line jest/no-standalone-expect
    expect(eol.auto(received)).toEqual(eol.auto(val))
    return { pass: true }
  }
})

expect.extend({
  toMatchFixtureJson (received, argument) {
    const val = fixtureJson(argument)
    // eslint-disable-next-line jest/no-standalone-expect
    expect(received).toEqual(val)
    return { pass: true }
  }
})

// expect.extend({
//   toMatchFixtureHjson (received, argument) {
//     const val = fixtureHjson(argument)
//     // eslint-disable-next-line jest/no-standalone-expect
//     expect(received).toEqual(val)
//     return { pass: true }
//   }
// })
