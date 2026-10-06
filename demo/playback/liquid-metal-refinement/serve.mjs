import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const server = createServer(async (request, response) => {
  if (request.url !== '/' && request.url !== '/index.html') {
    response.writeHead(404).end()
    return
  }
  try {
    const html = await readFile(new URL('index.html', import.meta.url))
    response
      .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      .end(html)
  } catch {
    response.writeHead(500).end('Run node demo/playback/liquid-metal-refinement/build.mjs first.')
  }
})
server.listen(4180, '127.0.0.1', () =>
  console.log('Liquid metal prototype: http://127.0.0.1:4180/'),
)
