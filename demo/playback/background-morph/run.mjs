import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import electron from 'electron'

const root = fileURLToPath(new URL('.', import.meta.url))
const workspace = resolve(root, '../../..')
const verify = process.argv.includes('--verify')
const serveOnly = process.argv.includes('--serve')
const server = await createServer({
  configFile: false,
  root,
  cacheDir: resolve(workspace, 'node_modules/.vite/background-morph-demo'),
  resolve: {
    alias: {
      '@renderer': resolve(workspace, 'src/renderer'),
      '@shared': resolve(workspace, 'src/shared'),
    },
  },
  server: { host: '127.0.0.1', port: 4179, strictPort: true, fs: { allow: [workspace] } },
})
await server.listen()
server.printUrls()
if (!serveOnly) {
  const environment = { ...process.env, AURALIS_MORPH_DEMO_URL: server.resolvedUrls.local[0] }
  delete environment.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, [resolve(root, 'window.mjs'), ...(verify ? ['--verify'] : [])], {
    env: environment,
    windowsHide: verify,
    stdio: 'inherit',
  })
  const timeout = verify ? setTimeout(() => child.kill(), 55000) : null
  child.on('error', (error) => {
    console.error(error)
    process.exitCode = 1
  })
  child.on('exit', async (code) => {
    if (timeout) clearTimeout(timeout)
    await server.close()
    process.exitCode = code ?? 1
  })
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill())
} else {
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      await server.close()
      process.exit(0)
    })
}
