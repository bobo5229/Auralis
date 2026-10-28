import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const server = await createServer({
  configFile: false,
  root,
  plugins: [vue()],
  cacheDir: resolve(root, 'node_modules/.vite/lyric-emphasis-demo'),
  resolve: {
    alias: {
      '@shared': resolve(root, 'src/shared'),
      '@renderer': resolve(root, 'src/renderer'),
    },
  },
  server: { host: '127.0.0.1', port: 4196, strictPort: true },
})
await server.listen()
console.log('歌词强调 Demo：http://127.0.0.1:4196/demo/lyrics/emphasis/')
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.close()
    process.exit(0)
  })
}
