const { execFile } = require('node:child_process')

console.log('running post-app-deploy...')

async function main () {
  const cwd = process.cwd()
  const command = 'aio'
  const args = ['rt', 'action', 'update', 'dx-excshell-1/syntaxError', `${cwd}/src/dx-excshell-1/actions/syntaxidermist/index.js`]

  console.log(`Running '${[command, ...args].join(' ')}'`)
  await execFile(command, args, (error, stdout, stderr) => {
    if (error) {
      throw error
    }
    stdout && console.log(stdout)
    stderr && console.log(stderr)
  })
}

main()
  .catch(console.error)
