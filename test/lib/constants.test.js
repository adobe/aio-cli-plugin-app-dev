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

const CONSTANTS_PATH = '../../src/lib/constants'
const {
  CHANGED_ASSETS_PRINT_LIMIT,
  SERVER_DEFAULT_PORT,
  BUNDLER_DEFAULT_PORT,
  DEV_API_PREFIX,
  DEV_API_WEB_PREFIX,
  DEV_KEYS_DIR,
  DEV_KEYS_CONFIG_KEY,
  DEFAULT_LAUNCH_PREFIX,
  STAGE_LAUNCH_PREFIX,
  PRIVATE_KEY_PATH,
  PUB_CERT_PATH,
  BUNDLE_OPTIONS,
  IMS_OAUTH_S2S_ENV_KEY
} = require(CONSTANTS_PATH)

test('exports', () => {
  expect(CHANGED_ASSETS_PRINT_LIMIT).toBeDefined()
  expect(SERVER_DEFAULT_PORT).toBeDefined()
  expect(BUNDLER_DEFAULT_PORT).toBeDefined()
  expect(DEV_API_PREFIX).toBeDefined()
  expect(DEV_API_WEB_PREFIX).toBeDefined()
  expect(DEV_KEYS_DIR).toBeDefined()
  expect(DEV_KEYS_CONFIG_KEY).toBeDefined()
  expect(DEFAULT_LAUNCH_PREFIX).toBeDefined()
  expect(STAGE_LAUNCH_PREFIX).toBeDefined()
  expect(PRIVATE_KEY_PATH).toBeDefined()
  expect(PUB_CERT_PATH).toBeDefined()
  expect(BUNDLE_OPTIONS).toBeDefined()
  expect(IMS_OAUTH_S2S_ENV_KEY).toBeDefined()
})

describe('override via env vars', () => {
  const originalEnv = process.env

  beforeEach(async () => {
    delete require.cache[CONSTANTS_PATH] // remove from require cache, for reloading
    jest.resetModules()
    process.env = {
      ...originalEnv
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('override CHANGED_ASSETS_PRINT_LIMIT', () => {
    const newValue = 99
    expect(CHANGED_ASSETS_PRINT_LIMIT).not.toEqual(newValue)

    process.env.CHANGED_ASSETS_PRINT_LIMIT = newValue
    const constants = require(CONSTANTS_PATH) // re-load
    expect(constants.CHANGED_ASSETS_PRINT_LIMIT).toEqual(newValue)
  })

  test('override SERVER_DEFAULT_PORT', () => {
    const newValue = 10001
    expect(SERVER_DEFAULT_PORT).not.toEqual(newValue)

    process.env.SERVER_DEFAULT_PORT = newValue
    const constants = require(CONSTANTS_PATH) // re-load
    expect(constants.SERVER_DEFAULT_PORT).toEqual(newValue)
  })

  test('override BUNDLER_DEFAULT_PORT', () => {
    const newValue = 10011
    expect(BUNDLER_DEFAULT_PORT).not.toEqual(newValue)

    process.env.BUNDLER_DEFAULT_PORT = newValue
    const constants = require(CONSTANTS_PATH) // re-load
    expect(constants.BUNDLER_DEFAULT_PORT).toEqual(newValue)
  })

  test('override DEV_KEYS_DIR', () => {
    const newValue = 'some/new/folder'
    expect(DEV_KEYS_DIR).not.toEqual(newValue)

    process.env.DEV_KEYS_DIR = newValue
    const constants = require(CONSTANTS_PATH) // re-load
    expect(constants.DEV_KEYS_DIR).toEqual(newValue)
  })

  test('override DEV_KEYS_CONFIG_KEY', () => {
    const newValue = 'some.new.key'
    expect(DEV_KEYS_CONFIG_KEY).not.toEqual(newValue)

    process.env.DEV_KEYS_CONFIG_KEY = newValue
    const constants = require(CONSTANTS_PATH) // re-load
    expect(constants.DEV_KEYS_CONFIG_KEY).toEqual(newValue)
  })

  test('override DEV_API_PREFIX', () => {
    const newValue = 'some/new/prefix'
    expect(DEV_API_PREFIX).not.toEqual(newValue)

    process.env.DEV_API_PREFIX = newValue
    const constants = require(CONSTANTS_PATH) // re-load
    expect(constants.DEV_API_PREFIX).toEqual(newValue)
  })

  test('override DEV_API_WEB_PREFIX', () => {
    const newValue = 'some/new/prefix/web'
    expect(DEV_API_WEB_PREFIX).not.toEqual(newValue)

    process.env.DEV_API_WEB_PREFIX = newValue
    const constants = require(CONSTANTS_PATH) // re-load
    expect(constants.DEV_API_WEB_PREFIX).toEqual(newValue)
  })

  test('*should not* be able to override DEFAULT_LAUNCH_PREFIX', () => {
    const newValue = 'https://foobar?localDevUrl='
    const oldValue = DEFAULT_LAUNCH_PREFIX
    expect(oldValue).not.toEqual(newValue)

    process.env.DEFAULT_LAUNCH_PREFIX = newValue
    const constants = require(CONSTANTS_PATH) // re-load
    expect(constants.DEFAULT_LAUNCH_PREFIX).toEqual(oldValue) // did not change
  })

  test('*should not* be able to override STAGE_LAUNCH_PREFIX', () => {
    const newValue = 'https://barfoo?localDevUrl='
    const oldValue = STAGE_LAUNCH_PREFIX
    expect(oldValue).not.toEqual(newValue)

    process.env.STAGE_LAUNCH_PREFIX = newValue
    const constants = require(CONSTANTS_PATH) // re-load
    expect(constants.STAGE_LAUNCH_PREFIX).toEqual(oldValue) // did not change
  })

  test('*should not* be able to override PRIVATE_KEY_PATH', () => {
    const newValue = 'my/secret/stash'
    const oldValue = PRIVATE_KEY_PATH
    expect(oldValue).not.toEqual(newValue)

    process.env.PRIVATE_KEY_PATH = newValue
    const constants = require(CONSTANTS_PATH) // re-load
    expect(constants.PRIVATE_KEY_PATH).toEqual(oldValue) // did not change
  })

  test('*should not* be able to override PUB_CERT_PATH', () => {
    const newValue = 'my/public/stash'
    const oldValue = PUB_CERT_PATH
    expect(oldValue).not.toEqual(newValue)

    process.env.PUB_CERT_PATH = newValue
    const constants = require(CONSTANTS_PATH) // re-load
    expect(constants.PUB_CERT_PATH).toEqual(oldValue) // did not change
  })

  test('*should not* be able to override BUNDLE_OPTIONS', () => {
    const newValue = { someOption: 'do an infinite loop' }
    const oldValue = BUNDLE_OPTIONS
    expect(oldValue).not.toEqual(newValue)

    process.env.BUNDLE_OPTIONS = newValue
    const constants = require(CONSTANTS_PATH) // re-load
    expect(constants.BUNDLE_OPTIONS).toEqual(oldValue) // did not change
  })
})
