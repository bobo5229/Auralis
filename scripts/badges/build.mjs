import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import { profiles, selectProfiles } from './profiles.mjs'
import { prepareSvg, deriveSvg, normalFromHeight } from './materialPipeline.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const { values: args } = parseArgs({
  options: {
    badge: { type: 'string' },
    size: { type: 'string' },
    output: { type: 'string' },
    list: { type: 'boolean' },
  },
})
if (args.list) {
  console.log(profiles.map((profile) => `${profile.id}\t${profile.name}`).join('\n'))
  process.exit(0)
}
const selected = selectProfiles(args.badge)
const width = Number(args.size || 1320),
  height = (width * 370) / 330
if (!Number.isInteger(width) || width < 330 || width > 2640 || !Number.isInteger(height))
  throw new Error('--size must be a multiple of 33 between 330 and 2640')
const output = resolve(
  root,
  args.output || 'src/renderer/features/archive/assets/milestones/materials',
)
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const provenance = JSON.parse(
  await readFile(new URL('./source-hashes.json', import.meta.url), 'utf8'),
)
let previous
try {
  previous = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
const manifest = { version: 2, badges: { ...(previous?.badges || {}) } }
for (const profile of selected) {
  const entry = {
    id: profile.id,
    catalogId: profile.catalogId,
    name: profile.name,
    series: profile.series,
    amount: ['hours', 'days'].includes(profile.series)
      ? Number(profile.id.split('-').at(-1))
      : null,
    width,
    height,
    roughness: profile.roughness,
    baseline: !!profile.preserveBaseline,
    states: {},
    sources: {},
  }
  const folder = join(output, profile.id)
  await mkdir(folder, { recursive: true })
  for (const state of ['lit', 'unlit']) {
    const unlit = state === 'unlit'
    const sourcePath = `${profile.series}/assets/${profile.id}${unlit ? '-unlit' : ''}.svg`
    const source = await readFile(join(root, 'demo/archive/enamel-milestone', sourcePath))
    if (!provenance[sourcePath] || provenance[sourcePath] !== sha(source))
      throw new Error(`Source provenance mismatch: ${sourcePath}`)
    const { doc, removed } = prepareSvg(source.toString('utf8'), profile, unlit)
    entry.sources[state] = { path: sourcePath, sha256: sha(source), removed }
    const maps = {}
    let heightBuffer
    for (const mode of ['base', 'material', 'height', 'ao', 'finish']) {
      const svg = deriveSvg(doc, profile, unlit, mode, width, height)
      const png = await sharp(Buffer.from(svg)).png().toBuffer()
      maps[mode] = `${profile.id}/${state}-${mode}.png`
      await writeFile(join(output, maps[mode]), png)
      if (mode === 'base') await writeFile(join(folder, `${state}-base.svg`), svg)
      if (mode === 'height') heightBuffer = png
    }
    maps.normal = `${profile.id}/${state}-normal.png`
    await writeFile(join(output, maps.normal), await normalFromHeight(heightBuffer, width, height))
    entry.states[state] = maps
  }
  manifest.badges[profile.id] = entry
  console.log(`Generated ${profile.id}: lit/unlit (${width} × ${height})`)
}
// A selected build retains other entries, while the registry is the source of ordering.
manifest.badges = Object.fromEntries(
  profiles
    .filter((profile) => manifest.badges[profile.id])
    .map((profile) => [profile.id, manifest.badges[profile.id]]),
)
await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Manifest: ${Object.keys(manifest.badges).length} badges → ${output}`)
