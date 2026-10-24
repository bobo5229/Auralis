import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import { profiles, selectProfiles } from './profiles.mjs'
import { previewFingerprint } from './fingerprint.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const { values: args } = parseArgs({
  options: {
    badge: { type: 'string' },
    output: { type: 'string' },
    'materials-only': { type: 'boolean' },
  },
})
const output = resolve(
  root,
  args.output || 'src/renderer/features/archive/assets/milestones/materials',
)
const selected = selectProfiles(args.badge)
const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'))
let previews
if (!args['materials-only'])
  previews = JSON.parse(await readFile(join(output, 'previews/manifest.json'), 'utf8'))
const provenance = JSON.parse(
  await readFile(new URL('./source-hashes.json', import.meta.url), 'utf8'),
)
for (const [file, hash] of Object.entries(provenance))
  assert.equal(
    createHash('sha256')
      .update(await readFile(join(root, 'demo/archive/enamel-milestone', file)))
      .digest('hex'),
    hash,
    file,
  )
for (const profile of selected) {
  const entry = manifest.badges[profile.id]
  assert.ok(entry, `Missing ${profile.id}`)
  if (previews) {
    assert.equal(
      previews.fingerprints[profile.id],
      await previewFingerprint(entry, output),
      `${profile.id}: preview is stale; run npm run badges:render`,
    )
    for (const state of ['lit', 'unlit']) {
      const preview = await sharp(join(output, 'previews', `${profile.id}-${state}.png`)).metadata()
      assert.equal(preview.width, 330)
      assert.equal(preview.height, 370)
    }
  }
  for (const state of ['lit', 'unlit']) {
    for (const kind of ['base', 'material', 'height', 'normal', 'ao', 'finish']) {
      const image = sharp(join(output, entry.states[state][kind]))
      const metadata = await image.metadata()
      assert.equal(metadata.width, entry.width)
      assert.equal(metadata.height, entry.height)
      if (['base', 'material', 'height', 'finish'].includes(kind)) {
        const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        for (const index of [
          0,
          info.width - 1,
          (info.height - 1) * info.width,
          info.width * info.height - 1,
        ])
          assert.equal(
            data[index * 4 + 3],
            0,
            `${profile.id}/${state}/${kind}: transparent corners`,
          )
        assert.ok(
          data.some((value, index) => index % 4 === 3 && value === 255),
          `${profile.id}/${state}/${kind}: empty`,
        )
        if (kind === 'material') {
          let metal = 0,
            dielectric = 0
          for (let i = 0; i < data.length; i += 4)
            if (data[i + 3] > 200) {
              assert.ok(data[i] + data[i + 1] + data[i + 2] > 200, 'Unclassified material')
              metal += data[i]
              dielectric += data[i + 1]
            }
          assert.ok(metal > 255, `${profile.id}: metal missing`)
          if (state === 'lit') assert.ok(dielectric > 255, `${profile.id}: dielectric missing`)
          else assert.equal(dielectric, 0)
        }
      }
    }
    const base = await readFile(join(output, profile.id, `${state}-base.svg`), 'utf8')
    assert.doesNotMatch(base, /<script|<linearGradient|<radialGradient|class="sheen"/)
    const ids = new Set(Array.from(base.matchAll(/\bid="([^"]+)"/g), (match) => match[1]))
    for (const match of base.matchAll(/url\(#([^)]+)\)/g))
      assert.ok(ids.has(match[1]), `Missing ${match[1]}`)
  }
}
if (selected.length === profiles.length)
  assert.deepEqual(
    Object.keys(manifest.badges).sort(),
    profiles.map((profile) => profile.id).sort(),
  )
console.log(
  `Passed: ${selected.length} badges / ${selected.length * 2} states; provenance, coverage, dimensions, alpha and de-lit SVG references.`,
)
