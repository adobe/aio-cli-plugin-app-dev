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
