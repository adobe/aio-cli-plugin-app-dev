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

const yeoman = require('yeoman-environment')

const BaseCommand = require('../../../BaseCommand')
const vsCodeConfigGenerator = require('../../../generator/add-vscode-config')

class Init extends BaseCommand {
  async run () {
    const env = yeoman.createEnv()
    env.options = { skipInstall: true }

    const appGen = env.instantiate(vsCodeConfigGenerator, {
      options: {
        'skip-prompt': true
      }
    })
    await env.runGenerator(appGen)
  }
}

Init.description = '*Developer Preview* Initialize Visual Studio Code for App Builder debugging'

Init.args = {}

Init.flags = {
  ...BaseCommand.flags
}

module.exports = Init
