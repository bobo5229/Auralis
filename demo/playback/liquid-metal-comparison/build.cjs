/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const esbuild = require('esbuild')

const version = '0.0.81'
const integrity =
  'jeGdyjMscZ2bxmQdo8lhwUufHUf4iq3s1ayjh8PXU7Go42Rw8E3I0It1FZdc3HuWt5J82m//DRWaxsRqRfA4Gg=='
const vendor = path.join(__dirname, 'vendor')

async function main() {
  await fs.mkdir(vendor, { recursive: true })
  const bundled = path.join(vendor, 'paper-shaders.js')
  try {
    await fs.access(bundled)
  } catch {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'auralis-paper-shaders-'))
    const response = await fetch(
      `https://registry.npmjs.org/@paper-design/shaders/-/shaders-${version}.tgz`,
    )
    if (!response.ok) throw new Error(`Paper download failed: ${response.status}`)
    const archive = Buffer.from(await response.arrayBuffer())
    if (crypto.createHash('sha512').update(archive).digest('base64') !== integrity)
      throw new Error('Paper package integrity mismatch')
    const tarball = path.join(temp, 'paper.tgz')
    await fs.writeFile(tarball, archive)
    execFileSync('tar', ['-xf', tarball, '-C', temp], { windowsHide: true })
    const entry = path.join(temp, 'package', 'dist', 'index.js')
    await esbuild.build({
      stdin: {
        contents: `export { ShaderMount, liquidMetalFragmentShader, getShaderColorFromString } from ${JSON.stringify(entry)};`,
        resolveDir: temp,
        sourcefile: 'paper-entry.js',
      },
      outfile: bundled,
      bundle: true,
      format: 'esm',
      minify: true,
      legalComments: 'inline',
      banner: {
        js: `/* Paper Shaders ${version} — Apache-2.0. See vendor/LICENSE and vendor/NOTICE. */`,
      },
    })
    for (const file of ['LICENSE', 'NOTICE'])
      await fs.copyFile(path.join(temp, 'package', file), path.join(vendor, file))
  }
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, 'app.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    write: false,
    target: 'chrome120',
    legalComments: 'inline',
  })
  const [template, css, license, notice] = await Promise.all(
    ['index.template.html', 'style.css', 'vendor/LICENSE', 'vendor/NOTICE'].map((file) =>
      fs.readFile(path.join(__dirname, file), 'utf8'),
    ),
  )
  const escape = (text) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const html = template
    .replace('/* DEMO_CSS */', () => css)
    .replace('/* DEMO_JS */', () => result.outputFiles[0].text.replaceAll('</script', '<\\/script'))
    .replace('<!-- PAPER_LICENSE -->', () => `<pre>${escape(notice + '\n' + license)}</pre>`)
  await fs.writeFile(path.join(__dirname, 'index.html'), html, 'utf8')
  console.log(`Built offline LiquidMetal comparison with Paper Shaders ${version}`)
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
