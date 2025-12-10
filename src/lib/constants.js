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

// overridable in the env
const {
  CHANGED_ASSETS_PRINT_LIMIT = 5,
  SERVER_HOST = 'localhost',
  SERVER_DEFAULT_PORT = 9080,
  BUNDLER_DEFAULT_PORT = 9090,
  DEV_KEYS_DIR = 'dist/dev-keys',
  DEV_KEYS_CONFIG_KEY = 'aio-dev.dev-keys',
  DEV_API_PREFIX = 'api/v1',
  DEV_API_WEB_PREFIX = `${DEV_API_PREFIX}/web`,
  DEV_API_STATE_PREFIX = `${DEV_API_PREFIX}/state`
} = process.env

const BUNDLE_OPTIONS = {
  shouldDisableCache: true,
  shouldContentHash: true,
  shouldOptimize: false
}

module.exports = {
  SERVER_HOST,
  CHANGED_ASSETS_PRINT_LIMIT,
  SERVER_DEFAULT_PORT: parseInt(SERVER_DEFAULT_PORT, 10), // parse any env override
  BUNDLER_DEFAULT_PORT: parseInt(BUNDLER_DEFAULT_PORT, 10), // parse any env override
  DEV_API_PREFIX,
  DEV_API_WEB_PREFIX,
  DEV_API_STATE_PREFIX,
  DEV_KEYS_DIR,
  DEV_KEYS_CONFIG_KEY,
  DEFAULT_LAUNCH_PREFIX: 'https://experience.adobe.com/?devMode=true#/custom-apps/?localDevUrl=',
  STAGE_LAUNCH_PREFIX: 'https://experience-stage.adobe.com/?devMode=true#/custom-apps/?localDevUrl=',
  PRIVATE_KEY_PATH: `${DEV_KEYS_DIR}/private.key`,
  PUB_CERT_PATH: `${DEV_KEYS_DIR}/cert-pub.crt`,
  BUNDLE_OPTIONS
}
