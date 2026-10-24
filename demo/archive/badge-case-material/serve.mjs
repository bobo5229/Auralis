import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DOMParser } from '@xmldom/xmldom'

const directory = resolve(fileURLToPath(new URL('./', import.meta.url)))
const root = resolve(directory, '../../..')
export async function startServer(port = 4198) {
  const materialDirectory = resolve(
    root,
    'src/renderer/features/archive/assets/milestones/materials',
  )
  const manifest = JSON.parse(await readFile(resolve(materialDirectory, 'manifest.json'), 'utf8'))
  const catalog = await Promise.all(
    Object.values(manifest.badges).map(async (entry) => {
      const source = await readFile(
        resolve(root, 'demo/archive/enamel-milestone', entry.sources.lit.path),
        'utf8',
      )
      const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
      return {
        id: entry.id,
        name: entry.name,
        series: entry.series,
        contour: doc.getElementsByTagName('path')[0].getAttribute('d'),
        preview: `/badges/${entry.id}-lit.png`,
      }
    }),
  )
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405).end()
        return
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      if (pathname === '/catalog.json') {
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        response.end(request.method === 'HEAD' ? undefined : JSON.stringify(catalog))
        return
      }
      let file
      if (pathname === '/typography.css')
        file = resolve(root, 'src/renderer/app/styles/typography.css')
      else if (pathname === '/font.woff2')
        file = resolve(
          root,
          'src/renderer/assets/fonts/Plus_Jakarta_Sans/PlusJakartaSans-latin-variable.woff2',
        )
      else if (/^\/badges\/[a-z0-9-]+-lit\.png$/.test(pathname))
        file = resolve(materialDirectory, 'previews', pathname.slice(8))
      else {
        file = resolve(directory, pathname === '/' ? 'index.html' : pathname.slice(1))
        if (
          !file.startsWith(directory + sep) ||
          !['.html', '.css', '.js', '.png'].includes(extname(file))
        ) {
          response.writeHead(404).end()
          return
        }
      }
      const data = await readFile(file)
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.png': 'image/png',
        '.woff2': 'font/woff2',
      }
      response.writeHead(200, {
        'Content-Type': types[extname(file)],
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
  const { server, url } = await startServer(Number(process.env.BADGE_CASE_PORT || 4198))
  console.log(`Badge case material demo: ${url}`)
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close())
}
