import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile, mkdtemp, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const here = fileURLToPath(new URL('.', import.meta.url))
const port = Number(process.env.AURALIS_LYRICS_DEMO_PORT ?? 4186)
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('AURALIS_LYRICS_DEMO_PORT must be an integer between 1024 and 65535')
}
const origin = `http://127.0.0.1:${port}`
const token = randomBytes(32).toString('hex')
const temporary = await mkdtemp(join(tmpdir(), 'auralis-lyrics-demo-'))
const outfile = join(temporary, 'backend.mjs')
async function cleanTemporary() {
  // Remove only the single artifact this launcher owns; never recursively delete a directory.
  await rm(outfile, { force: true })
  await rmdir(temporary)
}
// Compile only the string backend into a temporary directory; never build/start Auralis.
let handleDemoRequest
try {
  await build({
    entryPoints: [join(here, 'backend.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'warning',
  })
  ;({ handleDemoRequest } = await import(pathToFileURL(outfile).href))
} catch (error) {
  await cleanTemporary()
  throw error
}

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/sample.lrc', ['sample.lrc', 'text/plain; charset=utf-8']],
  [
    '/typography.css',
    ['../../../src/renderer/app/styles/typography.css', 'text/css; charset=utf-8'],
  ],
])
const maxBodyBytes = 32 * 1024 * 1024 // JSON escaping has overhead above backend text limits.

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  )
  // Exact Host blocks DNS rebinding; cross-site reads are never opted into CORS.
  if (
    request.headers.host !== `127.0.0.1:${port}` ||
    (request.headers.origin && request.headers.origin !== origin) ||
    (request.headers['sec-fetch-site'] &&
      !['same-origin', 'none'].includes(request.headers['sec-fetch-site']))
  ) {
    json(response, 403, { code: 'forbidden', message: 'Open this demo using its loopback URL.' })
    return
  }
  try {
    if (request.url === '/api' && request.method === 'POST') {
      if (
        request.headers.origin !== origin ||
        request.headers['x-demo-token'] !== token ||
        request.headers['content-type'] !== 'application/json'
      ) {
        json(response, 403, { code: 'forbidden', message: 'Invalid demo origin or token.' })
        return
      }
      let bytes = 0
      const chunks = []
      for await (const chunk of request) {
        bytes += chunk.length
        if (bytes > maxBodyBytes) {
          json(response, 413, {
            code: 'too-large',
            message: 'Request exceeds the demo size limit.',
          })
          return
        }
        chunks.push(chunk)
      }
      let payload
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        json(response, 400, { code: 'invalid-request', message: 'Invalid JSON request.' })
        return
      }
      json(response, 200, handleDemoRequest(payload))
      return
    }
    const asset = request.method === 'GET' ? assets.get(request.url) : undefined
    if (!asset) {
      json(response, 404, { code: 'not-found', message: 'Unknown demo resource.' })
      return
    }
    let content = await readFile(join(here, asset[0]), 'utf8')
    if (request.url === '/') content = content.replace('__DEMO_TOKEN__', token)
    response.writeHead(200, { 'Content-Type': asset[1] })
    response.end(content)
  } catch (error) {
    const known = typeof error?.code === 'string' && !['ENOENT', 'EACCES'].includes(error.code)
    json(response, known ? 400 : 500, {
      code: known ? error.code : 'internal-error',
      message: known ? error.message : 'Demo server failed; see the terminal.',
    })
    if (!known) console.error(error)
  }
})
server.requestTimeout = 15000
server.headersTimeout = 10000

let closing = false
async function close() {
  if (closing) return
  closing = true
  server.close()
  server.closeAllConnections()
  await cleanTemporary()
}
process.once('SIGINT', () => void close())
process.once('SIGTERM', () => void close())
server.once('error', async (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `Port ${port} is occupied; set AURALIS_LYRICS_DEMO_PORT to another port.`
      : error,
  )
  await close()
  process.exitCode = 1
})
server.listen(port, '127.0.0.1', () => {
  console.log(`Auralis 歌词实验室：${origin}`)
  console.log('仅使用字符串后端和模拟歌词；不连接曲库。Ctrl+C 停止。')
})
