import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(
  require('electron'),
  [
    fileURLToPath(new URL('./capture.cjs', import.meta.url)),
    fileURLToPath(new URL('./captures/', import.meta.url)),
  ],
  { env, windowsHide: true, stdio: 'inherit' },
)
const timeout = setTimeout(() => child.kill(), 45000)
child.on('close', (code) => {
  clearTimeout(timeout)
  process.exitCode = code ?? 1
})
