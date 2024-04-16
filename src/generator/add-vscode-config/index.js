/*
Copyright 2021 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const Generator = require('yeoman-generator')
const fs = require('fs-extra')

/*
    'initializing',
    'prompting',
    'configuring',
    'default',
    'writing',
    'conflicts',
    'install',
    'end'
*/

const Default = {
  DESTINATION_FILE: '.vscode/launch.json',
  SKIP_PROMPT: false,
  SERVER_DEFAULT_PORT: 9080
}

const Option = {
  DESTINATION_FILE: 'destination-file',
  SKIP_PROMPT: 'skip-prompt',
  SERVER_DEFAULT_PORT: 'server-default-port'
}

class AddVsCodeConfig extends Generator {
  constructor (args, opts) {
    super(args, opts)

    // options are inputs from CLI or yeoman parent generator
    this.option(Option.DESTINATION_FILE, { type: String, default: Default.DESTINATION_FILE })
    this.option(Option.SKIP_PROMPT, { type: Boolean, default: Default.SKIP_PROMPT })
    this.option(Option.SERVER_DEFAULT_PORT, { type: Number, default: Default.SERVER_DEFAULT_PORT })
  }

  initializing () {
    this.vsCodeConfig = {
      version: '0.2.0',
      configurations: []
    }

    this.vsCodeConfig.configurations.push({
      name: 'App Builder: debug server-side',
      type: 'node-terminal',
      request: 'launch',
      command: 'aio app dev'
    })

    this.vsCodeConfig.configurations.push({
      name: 'App Builder: debug client-side',
      type: 'chrome',
      request: 'launch',
      url: `http://localhost:${this.options[Option.SERVER_DEFAULT_PORT]}`
    })

    this.vsCodeConfig.configurations.push({
      name: 'App Builder: debug full stack',
      type: 'node-terminal',
      request: 'launch',
      command: 'aio app dev',
      serverReadyAction: {
        pattern: '- Local:.+(https?://.+)',
        uriFormat: '%s',
        action: 'debugWithChrome'
      }
    })
  }

  async writing () {
    const destFile = this.options[Option.DESTINATION_FILE]
    const skipPrompt = this.options[Option.SKIP_PROMPT]

    let confirm = { overwriteVsCodeConfig: true }

    if (fs.existsSync(destFile) && !skipPrompt) {
      confirm = await this.prompt([
        {
          type: 'confirm',
          name: 'overwriteVsCodeConfig',
          message: `Please confirm the overwrite of your Visual Studio Code launch configuration in '${destFile}'?`
        }
      ])
    }

    if (confirm.overwriteVsCodeConfig) {
      this.fs.writeJSON(this.destinationPath(destFile), this.vsCodeConfig)
    }
  }
}

module.exports = AddVsCodeConfig
