import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function previewFingerprint(entry, materialDirectory) {
  const digest = createHash('sha256')
  digest.update(
    JSON.stringify({ baseline: entry.baseline, roughness: entry.roughness, size: [330, 370] }),
  )
  for (const file of ['badgeMaterialRenderer.ts', 'badgeShaders.ts'])
    digest.update(
      await readFile(
        new URL(`../../src/renderer/features/archive/runtime/${file}`, import.meta.url),
      ),
    )
  for (const state of ['lit', 'unlit'])
    for (const kind of ['base', 'material', 'normal', 'ao', 'finish'])
      digest.update(await readFile(join(materialDirectory, entry.states[state][kind])))
  return digest.digest('hex')
}
