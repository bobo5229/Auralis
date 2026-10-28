import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve, join } from 'node:path'
import electron from 'electron'

const root = resolve(import.meta.dirname, '../../..')
const compare = process.argv.includes('--compare')
const output = join(
  root,
  compare ? '.electron-home/background-composition' : '.electron-home/card-background-prototype',
)
await mkdir(output, { recursive: true })
const profile = await mkdtemp(join(output, 'profile-'))
await build({
  entryPoints: [join(import.meta.dirname, 'renderer.ts')],
  outfile: join(output, 'renderer.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  loader: { '.woff2': 'dataurl' },
  tsconfig: join(root, 'tsconfig.web.json'),
  sourcemap: true,
})
const coverPath = process.env.AURALIS_STARTUP_ALBUM_COVER
if (coverPath) await copyFile(coverPath, join(output, 'comparison-cover'))
const preview = {
  title: process.env.AURALIS_STARTUP_ALBUM_TITLE || '夜航 · Night Flight',
  artist: process.env.AURALIS_STARTUP_ALBUM_ARTIST || 'Auralis Studio',
  coverUrl: coverPath ? '/comparison-cover' : null,
  compare,
  verify: process.argv.includes('--verify'),
  // Reproducible composition for a fair comparison; regeneration remains available.
  seed: compare ? 0x12345678 : null,
}
const html = (await readFile(join(import.meta.dirname, 'index.html'), 'utf8'))
  .replace('./renderer.ts', './renderer.js')
  .replace('</head>', '<link rel="stylesheet" href="./renderer.css" /></head>')
  .replace(
    '<body>',
    `<body><script id="preview-config" type="application/json">${JSON.stringify(preview).replaceAll('<', '\\u003c')}</script>`,
  )
await writeFile(join(output, 'index.html'), html)
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/renderer.js', ['renderer.js', 'text/javascript; charset=utf-8']],
  ['/renderer.css', ['renderer.css', 'text/css; charset=utf-8']],
])
if (coverPath) files.set('/comparison-cover', ['comparison-cover', 'application/octet-stream'])
const server = createServer(async (request, response) => {
  const file = files.get(request.url)
  if (!file) {
    response.writeHead(404).end()
    return
  }
  try {
    response.setHeader('Content-Type', file[1])
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'none'",
    )
    response.end(await readFile(join(output, file[0])))
  } catch {
    response.writeHead(500).end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const env = {
  ...process.env,
  CARD_BACKGROUND_URL: `http://127.0.0.1:${server.address().port}`,
  CARD_BACKGROUND_OUTPUT: output,
  CARD_BACKGROUND_PROFILE: profile,
  CARD_BACKGROUND_VERIFY: process.argv.includes('--verify') ? '1' : '0',
  CARD_BACKGROUND_COMPARE: compare ? '1' : '0',
}
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [join(import.meta.dirname, 'window.mjs')], {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: process.argv.includes('--verify') || compare,
})
child.on('error', (error) => {
  console.error(error)
  server.close()
  process.exitCode = 1
})
child.on('exit', (code) => {
  server.close()
  process.exitCode = code ?? 1
})
process.on('SIGINT', () => {
  child.kill()
  server.close()
})
console.log('闪卡底图原型已启动；关闭窗口即可退出。')
