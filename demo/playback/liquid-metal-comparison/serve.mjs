import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const html = new URL('./index.html', import.meta.url)
const server = createServer(async (request, response) => {
  if (request.url === '/favicon.ico') {
    response.writeHead(204)
    response.end()
    return
  }
  if (!['/', '/index.html'].includes(request.url)) {
    response.writeHead(404)
    response.end('Not found')
    return
  }
  try {
    const body = await readFile(html)
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    response.end(body)
  } catch (error) {
    response.writeHead(500)
    response.end('Demo is unavailable. Run build.cjs first.')
    console.error(error)
  }
})
server.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
server.listen(4177, '127.0.0.1', () =>
  console.log('LiquidMetal comparison: http://127.0.0.1:4177/'),
)
