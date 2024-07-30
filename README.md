# aio-cli-plugin-app-dev

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@adobe/aio-cli-plugin-app-dev.svg)](https://npmjs.org/package/@adobe/aio-cli-plugin-app-dev)
[![Downloads/week](https://img.shields.io/npm/dw/@adobe/aio-cli-plugin-app-dev.svg)](https://npmjs.org/package/@adobe/aio-cli-plugin-app-dev)
![Node.js CI](https://github.com/adobe/aio-cli-plugin-app-dev/workflows/Node.js%20CI/badge.svg)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Codecov Coverage](https://img.shields.io/codecov/c/github/adobe/aio-cli-plugin-app-dev/master.svg?style=flat-square)](https://codecov.io/gh/adobe/aio-cli-plugin-app-dev/)

This command is a new way of looking at local development.
This uses the approach of a simulator, rather than an emulator.

<!-- toc -->
* [aio-cli-plugin-app-dev](#aio-cli-plugin-app-dev)
<!-- tocstop -->

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
  --version                Show version

DESCRIPTION
  Run your App Builder app locally
```

_See code: [src/commands/app/dev/index.js](https://github.com/adobe/aio-cli-plugin-app-dev/blob/1.0.1/src/commands/app/dev/index.js)_
<!-- commandsstop -->

## Contributing

Contributions are welcomed! Read the [Contributing Guide](CONTRIBUTING.md) for more information.

## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
