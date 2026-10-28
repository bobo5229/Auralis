import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
import './production-build.mjs'

const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
const child = spawn(
  electron,
  [
    fileURLToPath(new URL('./window.cjs', import.meta.url)),
    '--production',
    ...process.argv.slice(2),
  ],
  {
    env: environment,
    stdio: 'inherit',
    windowsHide: process.argv.includes('--verify'),
  },
)
child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
