# e2e tests for the App Dev Plugin

This will run the `aio app dev` server and run tests against it, using the `test-project` project sub-folder.

1. Install the [Adobe I/O CLI](https://github.com/adobe/aio-cli)
2. Make sure you are at the root of this repo.
3. You will need to install and build the `e2e/test-project`.
4. Run `cd e2e/test-project && npm install && aio app build && cd -`
5. Run `npm run e2e`
