import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import electron from 'electron'

const root = resolve(import.meta.dirname, '../..')
const output = join(root, '.electron-home/startup-album')
await mkdir(output, { recursive: true })
const profile = await mkdtemp(join(output, 'profile-'))
await build({
  entryPoints: [join(root, 'scripts/startup-album/fixtureMain.ts')],
  outfile: join(output, 'fixture.cjs'),
  platform: 'node',
  format: 'cjs',
  bundle: true,
  packages: 'external',
  tsconfig: join(root, 'tsconfig.node.json'),
  define: { __dirname: JSON.stringify(join(root, 'out/main')) },
})
const cases = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'skip',
      'skip-settled',
      'skip-hidden',
      'skip-context-loss',
      'skip-reduced',
      'play',
      'play-settled',
      'play-small',
      'play-hidpi',
      'play-light',
      'play-hidden',
      'play-resize',
      'play-context-loss',
      'play-motion-change',
      'play-target-lost',
      'play-no-target',
      'play-reduced',
      'play-fallback',
      'controls',
      'first-frame-cancel',
      'escape',
      'disabled',
      'empty',
      'recommendation-history',
      'fallback',
      'light',
      'context',
      'hover-default',
      'hover-small',
      'hover-hidpi',
      'contrast-dark',
      'contrast-light',
      'surface-red',
      'text-default',
      'text-hidpi',
      'text-small',
      'text-long',
      'settings',
      'interrupted',
      'hidden-timeout',
    ]
const results = []
for (const name of cases) {
  const env = {
    ...process.env,
    AURALIS_STARTUP_ALBUM_PROFILE: profile,
    AURALIS_STARTUP_ALBUM_CASE: name,
    AURALIS_STARTUP_ALBUM_OUTPUT: output,
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  await new Promise((yes, no) => {
    const child = spawn(electron, [join(output, 'fixture.cjs')], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    child.stdout.on('data', (data) => {
      stdout += data
      process.stdout.write(data)
    })
    child.stderr.on('data', (data) => process.stderr.write(data))
    child.on('error', no)
    child.on('exit', (code) => {
      if (code !== 0) {
        no(new Error(`Startup album case ${name} failed (${code})`))
        return
      }
      const line = stdout.split(/\r?\n/).find((value) => value.startsWith('STARTUP_ALBUM_RESULT '))
      if (!line) {
        no(new Error(`Missing result for ${name}`))
        return
      }
      results.push(JSON.parse(line.slice('STARTUP_ALBUM_RESULT '.length)))
      yes()
    })
  })
}
await writeFile(join(output, 'verification.json'), JSON.stringify({ profile, results }, null, 2))
console.log(`Startup album verification passed: ${results.length} processes; artifacts: ${output}`)
