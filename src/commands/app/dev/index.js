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

const ora = require('ora')
const fs = require('fs-extra')
const https = require('node:https')
const getPort = require('get-port')
const open = require('open')
const chalk = require('chalk')

const { Flags, ux } = require('@oclif/core')
const coreConfig = require('@adobe/aio-lib-core-config')
const aioLogger = require('@adobe/aio-lib-core-logging')('@adobe/aio-cli-plugin-app-dev:index', { level: process.env.LOG_LEVEL, provider: 'winston' })

const BaseCommand = require('../../../BaseCommand')
const { runDev } = require('../../../lib/run-dev')
const { runInProcess } = require('../../../lib/app-helper')

const APP_EVENT_PRE_APP_DEV = 'pre-app-dev'
const APP_EVENT_POST_APP_DEV = 'post-app-dev'
const { PUB_CERT_PATH, PRIVATE_KEY_PATH, DEV_KEYS_DIR, DEV_KEYS_CONFIG_KEY, SERVER_DEFAULT_PORT, DEV_API_WEB_PREFIX } = require('../../../lib/constants')
const Cleanup = require('../../../lib/cleanup')

class Dev extends BaseCommand {
  async run () {
    const { flags } = await this.parse(Dev)

    const spinner = ora()

    const runConfigs = await this.getAppExtConfigs(flags)
    const entries = Object.entries(runConfigs)
    let entry = entries[0]

    if (flags.extension) {
      entry = entries.find(([name]) => name === flags.extension)
      if (!entry) {
        this.error(`extension '${flags.extension}' was not found.`)
      }
    } else if (entries.length > 1) {
      this.error('Your app implements multiple extensions. You can only run one at the time, please select which extension to run with the \'-e\' flag.')
    }

    const [name, config] = entry
    try {
      // now we are good, either there is only 1 extension point or -e flag for one was provided
      await this.runOneExtensionPoint(name, config, flags)
    } catch (error) {
      spinner.stop()
      // delegate to top handler
      throw error
    }
  }

  displayFrontendUrl (flags, frontendUrl) {
    this.log(chalk.blue(chalk.bold(`To view your local application:\n  -> ${frontendUrl}`)))
    const launchUrl = this.getLaunchUrlPrefix() + frontendUrl
    if (flags.open) {
      this.log(chalk.blue(chalk.bold(`Opening your deployed application in the Experience Cloud shell:\n  -> ${launchUrl}`)))
      open(launchUrl)
    } else {
      this.log(chalk.blue(chalk.bold(`To view your deployed application in the Experience Cloud shell:\n  -> ${launchUrl}`)))
    }
  }

  displayActionUrls (actionUrls) {
    const blueBoldLog = (...args) => this.log(chalk.blue(chalk.bold(...args)))
    const printUrl = (url) => blueBoldLog(`  -> ${url}`)

    blueBoldLog('Your actions:')
    const webActions = Object.values(actionUrls).filter(url => url.includes(DEV_API_WEB_PREFIX))
    const nonWebActions = Object.values(actionUrls).filter(url => !url.includes(DEV_API_WEB_PREFIX))

    this.log('web actions:')
    webActions.forEach(printUrl)
    this.log('non-web actions:')
    nonWebActions.forEach(printUrl)
  }

  async runOneExtensionPoint (name, config, flags) {
    aioLogger.debug('runOneExtensionPoint called with', name, flags)

    const hasBackend = config.app.hasBackend
    const hasFrontend = config.app.hasFrontend

    if (!hasBackend && !hasFrontend) {
      this.error('nothing to run... there is no frontend and no manifest.yml, are you in a valid app?')
    }

    const runOptions = {
      skipActions: false,
      skipServe: false,
      parcel: {
        logLevel: flags.verbose ? 'verbose' : 'warn',
        // always set to false on localhost to get debugging and hot reloading
        shouldContentHash: false
      },
      fetchLogs: true,
      isLocal: true,
      verbose: flags.verbose
    }

    try {
      await runInProcess(config.hooks[APP_EVENT_PRE_APP_DEV], { config, options: runOptions })
    } catch (err) {
      this.log(err)
    }

    // check if there are certificates available, and generate them if not
    try {
      runOptions.parcel.https = await this.getOrGenerateCertificates({
        pubCertPath: PUB_CERT_PATH,
        privateKeyPath: PRIVATE_KEY_PATH,
        devKeysDir: DEV_KEYS_DIR,
        devKeysConfigKey: DEV_KEYS_CONFIG_KEY
      })
    } catch (error) {
      console.error(error)
      this.error(error)
    }

    const inprocHook = this.config.runHook.bind(this.config)
    const cleanup = new Cleanup()
    const { frontendUrl, actionUrls, serverCleanup } = await runDev(runOptions, config, inprocHook)
    cleanup.add(() => serverCleanup(), 'cleaning up runDev...')
    cleanup.wait()

    // fire post hook
    try {
      await runInProcess(config.hooks[APP_EVENT_POST_APP_DEV], config)
    } catch (err) {
      this.log(err)
    }

    if (hasFrontend) {
      this.displayFrontendUrl(flags, frontendUrl)
    }
    if (hasBackend) {
      this.displayActionUrls(actionUrls)
    }
    this.log('press CTRL+C to terminate the dev environment')
  }

  async getOrGenerateCertificates ({ pubCertPath, privateKeyPath, devKeysDir, devKeysConfigKey }) {
    const certs = {
      cert: pubCertPath, // Path to custom certificate
      key: privateKeyPath // Path to custom key
    }

    /* get existing certificates from file.. */
    if (fs.existsSync(privateKeyPath) && fs.existsSync(pubCertPath)) {
      return certs
    }

    await fs.ensureDir(devKeysDir)

    /* or get existing certificates from config.. */
    const devConfig = coreConfig.get(devKeysConfigKey)
    if (devConfig?.privateKey && devConfig?.publicCert) {
      // yes? write them to file
      await fs.writeFile(privateKeyPath, devConfig.privateKey)
      await fs.writeFile(pubCertPath, devConfig.publicCert)

      return certs
    }

    /* or if they do not exists, attempt to create them */
    // 1. generate them using aio certificate generate command
    const CertCmd = this.config.findCommand('certificate:generate')
    if (CertCmd) {
      const Instance = await CertCmd.load()
      await Instance.run([`--keyout=${privateKeyPath}`, `--out=${pubCertPath}`, '-n=DeveloperSelfSigned.cert'])
    } else {
      // could not find the cert command, error is caught below
      throw new Error('error while generating certificate - no certificate:generate command found')
    }

    // 2. store them globally in config
    const privateKey = (await fs.readFile(privateKeyPath, { encoding: 'utf8' }))
    const publicCert = (await fs.readFile(pubCertPath), { encoding: 'utf8' })
    coreConfig.set(`${devKeysConfigKey}.privateKey`, privateKey)
    coreConfig.set(`${devKeysConfigKey}.publicCert`, publicCert)

    // 3. ask the developer to accept them
    let certAccepted = false
    const startTime = Date.now()

    const server = https.createServer({ key: privateKey, cert: publicCert }, (_, res) => {
      certAccepted = true
      res.writeHead(200)
      res.end('Congrats, you have accepted the certificate and can now use it for development on this machine.\n' +
      'You can close this window.')
    })

    const port = parseInt(process.env.PORT) || SERVER_DEFAULT_PORT
    const actualPort = await getPort({ port })
    server.listen(actualPort)
    this.log('A self signed development certificate has been generated, you will need to accept it in your browser in order to use it.')
    open(`https://localhost:${actualPort}`)
    ux.action.start('Waiting for the certificate to be accepted.')

    const waitFor20s = 20000
    // eslint-disable-next-line no-unmodified-loop-condition
    while (!certAccepted && (Date.now() - startTime) < waitFor20s) {
      await ux.wait()
    }

    if (certAccepted) {
      ux.action.stop()
      this.log('Great, you accepted the certificate!')
    } else {
      ux.action.stop('timed out')
    }

    server.close()
    return certs
  }
}

Dev.description = '*Developer Preview* Run your App Builder app locally'

Dev.args = {}

Dev.flags = {
  ...BaseCommand.flags,
  open: Flags.boolean({
    description: 'Open the default web browser after a successful run, only valid if your app has a front-end',
    default: false,
    char: 'o'
  }),
  extension: Flags.string({
    description: 'Run only a specific extension, this flag can only be specified once',
    char: 'e',
    // we do not support multiple yet
    multiple: false
  })
}

module.exports = Dev
