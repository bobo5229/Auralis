import { build } from 'esbuild'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'

const root = await mkdtemp(join(tmpdir(), 'auralis-mpv-m4a-'))
await writeFile(join(root, 'ISOLATED_SYNTHETIC_ONLY'), '')
const buildRoot = resolve('.electron-home/mpv-m4a-write-probe')
await mkdir(buildRoot, { recursive: true })
await build({
  entryPoints: ['scripts/mpv-m4a-write-probe/probe.ts'],
  outfile: join(buildRoot, 'probe.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  alias: { '@main': resolve('src/main'), '@shared': resolve('src/shared') },
})
console.log(`Isolated output: ${root}`)
const child = spawn(
  process.execPath,
  [join(buildRoot, 'probe.mjs'), root, ...process.argv.slice(2)],
  {
    windowsHide: true,
    stdio: 'inherit',
  },
)
child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
