# e2e tests for the App Dev Plugin

This will run the `aio app dev` server and run tests against it, using the `test-project` project sub-folder.
The tests will run `npm install` on the test project if it wasn't run before.

## Usage

1. Make sure you are at the root of this repo
2. In your Terminal, run `npm run e2e`

## Deploying the test-project to production (for verification testing)

1. In your Terminal, go to the `e2e/test-project` folder
2. Create an `.env` file
3. Populate the `.env` file with your Runtime credentials, e.g

    ```sh
    AIO_RUNTIME_AUTH=<your_auth_key_here>
    AIO_RUNTIME_NAMESPACE=<your_namespace_here>
    AIO_RUNTIME_APIHOST=https://adobeioruntime.net
    ```

4. Run `aio app deploy --no-publish`

## Running the e2e tests on production (for verification testing)

1. Deploy the `e2e/test-project` folder (see above section).
2. Copy the `.env.example` file, and rename it to `.env`

    ```sh
    E2E_SCHEME = # (optional) defaults to 'https'
    E2E_CDN_HOST = # (required) e.g. <number>-<project-name>-<workspace.adobeio-static.net
    E2E_API_HOST = # (required) e.g. <number>-<project-name>-<workspace.adobeioruntime.net
    E2E_PORT = # (optional) defaults to 9080 (set to 443 for https)
    E2E_PACKAGE_NAME = # (optional) defaults to 'dx-excshell-1'
    E2E_ACCESS_TOKEN = # (required) required for remote e2e tests that require authentication
    E2E_GW_IMS_ORG_ID = # (required) required for remote e2e tests that require authentication
    ```

3. Change the appropriate values according to the url(s) you see after `aio app deploy`
4. Run `npm run e2e`
