import { createServer } from 'vite'
const server = await createServer({
  configFile: 'vite.browser.config.ts',
  mode: 'development',
  server: { host: '127.0.0.1', port: 5192, strictPort: true, open: false },
})
await server.listen()
console.log('Archive capture renderer ready: http://127.0.0.1:5192')
