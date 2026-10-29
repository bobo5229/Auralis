import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { MetadataArtworkEdits } from './metadataArtworkEdits'
describe('artwork edit session expiry', () => {
  it('actively releases imports and previews at the original session deadline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'auralis-artwork-expiry-test-'))
    const edits = new MetadataArtworkEdits(root)
    try {
      const image = join(root, 'input.png')
      await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } })
        .png()
        .toFile(image)
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
      const deadline = Date.now() + 1000
      const release = vi.spyOn(edits, 'release')
      const imported = await edits.import('session', image, deadline)
      if (!imported.ok || !imported.value) throw Error('Import failed')
      const records = (edits as unknown as { imports: Map<string, { path: string }> }).imports
      const rawPath = records.get(imported.value.imageToken)!.path
      expect((await stat(rawPath)).isFile()).toBe(true)
      edits.protectPreview('session', deadline + 30000)
      expect(edits.hasResources()).toBe(true)
      await vi.advanceTimersByTimeAsync(1000)
      expect(release).toHaveBeenCalledWith('session')
      await release.mock.results[0].value
      expect(edits.hasResources()).toBe(false)
      await expect(stat(rawPath)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(
        edits.resolve('session', [{ kind: 'add', imageToken: imported.value.imageToken }], 0),
      ).rejects.toThrow('Artwork import expired')
      edits.protectPreview('preview-only', Date.now() + 500)
      expect(edits.hasResources()).toBe(true)
      await vi.advanceTimersByTimeAsync(500)
      expect(release).toHaveBeenCalledWith('preview-only')
      expect(edits.hasResources()).toBe(false)
    } finally {
      vi.useRealTimers()
      await edits.clear()
      if (!root.startsWith(join(tmpdir(), 'auralis-artwork-expiry-test-')))
        throw Error('Unsafe test cleanup')
      await rm(root, { recursive: true, force: true })
    }
  })
})
