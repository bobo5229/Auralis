import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))
const server = await createServer({
  configFile: false,
  root,
  cacheDir: resolve(root, '../../../node_modules/.vite/liquid-metal-demo'),
  server: {
    host: '127.0.0.1',
    port: Number(process.env.METAL_DEMO_PORT || 4176),
    strictPort: true,
  },
})
await server.listen()
server.printUrls()
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await server.close()
    process.exit(0)
  })
