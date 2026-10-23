import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve, extname, sep } from 'node:path'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const repo = fileURLToPath(new URL('../../../../', import.meta.url))
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}
export async function startServer(port = 4196) {
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405).end()
        return
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      if (pathname === '/') {
        response.writeHead(302, { Location: '/glsl/index.html' }).end()
        return
      }
      let file
      if (['/vendor/three.module.js', '/vendor/three.core.js'].includes(pathname))
        file = resolve(repo, 'node_modules/three/build', pathname.split('/').at(-1))
      else if (pathname === '/fonts/jakarta.woff2')
        file = resolve(
          repo,
          'src/renderer/assets/fonts/Plus_Jakarta_Sans/PlusJakartaSans-latin-variable.woff2',
        )
      else {
        file = resolve(root, `.${pathname === '/' ? '/glsl/index.html' : pathname}`)
        if (
          !file.startsWith(root + sep) ||
          !['.html', '.css', '.js', '.json', '.png', '.svg'].includes(extname(file))
        ) {
          response.writeHead(404).end()
          return
        }
      }
      const data = await readFile(file)
      response.writeHead(200, {
        'Content-Type': types[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      response.end(request.method === 'HEAD' ? undefined : data)
    } catch {
      response.writeHead(404).end('Not found')
    }
  })
  await new Promise((resolveReady, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolveReady)
  })
  return { server, url: `http://127.0.0.1:${server.address().port}/glsl/index.html` }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { server, url } = await startServer(Number(process.env.BADGE_PORT || 4196))
  console.log(`Badge material preview: ${url}`)
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close())
}
