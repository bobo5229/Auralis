import { spawn } from 'node:child_process'
import path from 'node:path'
import electron from 'electron'
import './build.mjs'
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(
  electron,
  [path.resolve('demo/albums/grid-reflow/window.cjs'), ...process.argv.slice(2)],
  { env, stdio: 'inherit', windowsHide: process.argv.includes('--verify') },
)
child.on('exit', (code) => process.exit(code ?? 1))
