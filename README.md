# aio-cli-plugin-app-dev

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@adobe/aio-cli-plugin-app-dev.svg)](https://npmjs.org/package/@adobe/aio-cli-plugin-app-dev)
[![Downloads/week](https://img.shields.io/npm/dw/@adobe/aio-cli-plugin-app-dev.svg)](https://npmjs.org/package/@adobe/aio-cli-plugin-app-dev)
![Node.js CI](https://github.com/adobe/aio-cli-plugin-app-dev/workflows/Node.js%20CI/badge.svg)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Codecov Coverage](https://img.shields.io/codecov/c/github/adobe/aio-cli-plugin-app-dev/master.svg?style=flat-square)](https://codecov.io/gh/adobe/aio-cli-plugin-app-dev/)

- This command is a new way of looking at local development. This uses the approach of a simulator, rather than an emulator.
- Supports ESM, and TypeScript actions.
- [App Builder Debugging Docs](https://developer.adobe.com/app-builder/docs/guides/development/#debugging)

## Commands
<!-- commands -->
* [`aio app dev`](#aio-app-dev)

## `aio app dev`

Run your App Builder app locally

```
USAGE
  $ aio app dev [-v] [--version] [-o] [-e <value>]

FLAGS
  -e, --extension=<value>  Run only a specific extension, this flag can only be specified once
  -o, --open               Open the default web browser after a successful run, only valid if your app has a front-end
  -v, --verbose            Verbose output
      --version            Show version

DESCRIPTION
  Run your App Builder app locally
```

_See code: [src/commands/app/dev/index.js](https://github.com/adobe/aio-cli-plugin-app-dev/blob/2.2.0/src/commands/app/dev/index.js)_
<!-- commandsstop -->

## Overriding the hostname and port

By default the hostname will be `localhost` and the default port is `9080`. You can override these values by setting these environment variables:

1. `SERVER_HOST`
2. `SERVER_DEFAULT_PORT`

The command will try to use the default port, if it is not available it will find an open port to use instead.

## Visual Studio Code Webpack Debugging Support (Source Maps)

To enable step-by-step debugging in Visual Studio Code for your webpacked code, you will have to add source map support by adding a [custom webpack config](https://developer.adobe.com/app-builder/docs/guides/configuration/webpack-configuration/).

In the root of your project, add a `webpack-config.js` file:

```javascript
module.exports = {
  devtool: 'inline-source-map'
}
```

## TypeScript Support

Install these node modules in your app:
`npm install --save-dev ts-loader typescript`

In the root of your project, add a `webpack-config.js` file:

```javascript
module.exports = {
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        // includes, excludes are in tsconfig.json
        test: /\.ts?$/,
        exclude: /node_modules/,
        use: 'ts-loader'
      }
    ]
  }
}
```

In the root of your project, add a `tsconfig.json` file:

```json
{
  "exclude": ["node_modules", "dist"],
  "compilerOptions": {
    "target": "ES6",
    "module": "ES6",
    "sourceMap": true
  }
}
```

There is a Visual Studio Code issue with TypeScript and inspecting variables by hovering your mouse over them:

<https://github.com/microsoft/vscode/issues/221503>

## Contributing

Contributions are welcomed! Read the [Contributing Guide](CONTRIBUTING.md) for more information.

## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
