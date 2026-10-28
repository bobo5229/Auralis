const { spawnSync } = require('node:child_process')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const result = spawnSync(require('electron'), [require('node:path').join(__dirname, 'verify.cjs')], {
  env,
  stdio: 'inherit',
  windowsHide: true,
})
if (result.error) console.error(result.error)
process.exit(result.status ?? 1)
