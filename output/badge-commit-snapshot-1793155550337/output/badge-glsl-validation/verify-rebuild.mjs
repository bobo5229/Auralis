import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const directory = resolve('src/renderer/features/archive/assets/milestones/materials')
async function fingerprints(folder, prefix = '') {
  const result = {}
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const name = prefix + entry.name
    if (entry.isDirectory()) Object.assign(result, await fingerprints(join(folder, entry.name), name + '/'))
    else result[name] = createHash('sha256').update(await readFile(join(folder, entry.name))).digest('hex')
  }
  return result
}
const before = await fingerprints(directory)
const run = spawnSync(process.execPath, ['scripts/badges/build.mjs'], { stdio: 'inherit', windowsHide: true })
assert.equal(run.status, 0)
const after = await fingerprints(directory)
assert.deepEqual(after, before)
await writeFile('output/badge-glsl-validation/rebuild-report.json', JSON.stringify({ passed: true, files: Object.keys(after).length, hashes: after }, null, 2))
console.log(`Deterministic rebuild: ${Object.keys(after).length} files unchanged`)
