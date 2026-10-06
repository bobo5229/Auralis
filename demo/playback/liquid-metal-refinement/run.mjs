import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(
  electron,
  [fileURLToPath(new URL('verify.cjs', import.meta.url)), '--preview'],
  {
    env,
    windowsHide: true,
    stdio: 'inherit',
  },
)
child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill())
