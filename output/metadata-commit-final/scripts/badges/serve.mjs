import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve, extname, sep } from 'node:path'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../../', import.meta.url))
export const materialDirectory = resolve(
  root,
  'src/renderer/features/archive/assets/milestones/materials',
)
export async function startServer(port = 4197) {
  const bundle = await build({
    entryPoints: [resolve(root, 'scripts/badges/workbench.mjs')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  })
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405).end()
        return
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      let data, extension
      if (pathname === '/') {
        data = await readFile(new URL('./workbench.html', import.meta.url))
        extension = '.html'
      } else if (pathname === '/workbench.js') {
        data = bundle.outputFiles[0].contents
        extension = '.js'
      } else {
        const scope = pathname.startsWith('/materials/')
          ? materialDirectory
          : pathname.startsWith('/original/')
            ? resolve(root, 'demo/archive/enamel-milestone')
            : null
        if (!scope) {
          response.writeHead(404).end()
          return
        }
        const relative = pathname.replace(/^\/(materials|original)\//, '')
        const file = resolve(scope, relative)
        extension = extname(file)
        if (!file.startsWith(scope + sep) || !['.png', '.json', '.svg'].includes(extension)) {
          response.writeHead(404).end()
          return
        }
        data = await readFile(file)
      }
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      }
      response.writeHead(200, {
        'Content-Type': types[extension],
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
  return { server, url: `http://127.0.0.1:${server.address().port}/` }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { server, url } = await startServer(Number(process.env.BADGE_PORT || 4197))
  console.log(`Badge workbench: ${url}`)
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close())
}
