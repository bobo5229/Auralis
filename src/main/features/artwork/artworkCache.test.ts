import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { isArtworkTempFileName, isCurrentArtworkCacheKey } from './artworkCachePolicy'
import { convertArtworkToWebp, writeArtworkToCache } from './artworkCache'
import type { ArtworkSource } from './artworkTypes'

const tempDirs: string[] = []

async function makeTempCacheDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'auralis-artwork-cache-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function createJpeg(width: number, height: number, quality = 85): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 120, b: 60 },
    },
  })
    .jpeg({ quality })
    .toBuffer()
}

function jpegSource(data: Buffer): ArtworkSource {
  return { data, mimeType: 'image/jpeg' }
}

async function listFiles(dir: string): Promise<string[]> {
  return readdir(dir)
}

describe('convertArtworkToWebp', () => {
  it('shrinks a 5000x5000 jpeg to at most 1024x1024', async () => {
    const source = jpegSource(await createJpeg(5000, 5000))
    const converted = await convertArtworkToWebp(source)

    expect(converted).not.toBeNull()
    expect(converted!.width).toBe(1024)
    expect(converted!.height).toBe(1024)
    const metadata = await sharp(converted!.data).metadata()
    expect(metadata.format).toBe('webp')
  }, 60_000)

  it('preserves aspect ratio for landscape and portrait images', async () => {
    const landscape = await convertArtworkToWebp(jpegSource(await createJpeg(1200, 600)))
    const portrait = await convertArtworkToWebp(jpegSource(await createJpeg(600, 1200)))

    expect(landscape).not.toBeNull()
    expect(portrait).not.toBeNull()
    expect([landscape!.width, landscape!.height]).toEqual([1024, 512])
    expect([portrait!.width, portrait!.height]).toEqual([512, 1024])
  })

  it('does not upscale images smaller than 1024px', async () => {
    const converted = await convertArtworkToWebp(jpegSource(await createJpeg(200, 100)))

    expect(converted).not.toBeNull()
    expect([converted!.width, converted!.height]).toEqual([200, 100])
  })

  it('applies EXIF orientation', async () => {
    const raw = await createJpeg(100, 200)
    const oriented = await sharp(raw).withMetadata({ orientation: 6 }).jpeg().toBuffer()
    const converted = await convertArtworkToWebp(jpegSource(oriented))

    expect(converted).not.toBeNull()
    expect([converted!.width, converted!.height]).toEqual([200, 100])
  })

  it('converts a transparent PNG to WebP with alpha', async () => {
    const png = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer()
    const converted = await convertArtworkToWebp({ data: png, mimeType: 'image/png' })

    expect(converted).not.toBeNull()
    const metadata = await sharp(converted!.data).metadata()
    expect(metadata.format).toBe('webp')
    expect(metadata.hasAlpha).toBe(true)
  })

  it('returns null for corrupted image data', async () => {
    expect(await convertArtworkToWebp(jpegSource(Buffer.from('not an image')))).toBeNull()
  })

  it('fails safely for images over the pixel limit', async () => {
    // 8200x8200 = 67.2MP > 64MP input limit (ARTWORK_MAX_INPUT_PIXELS).
    // Note 8192x8192 equals exactly 64 * 1024 * 1024 and is NOT rejected.
    const huge = await sharp({
      create: {
        width: 8200,
        height: 8200,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    })
      .jpeg({ quality: 60 })
      .toBuffer()

    expect(await convertArtworkToWebp(jpegSource(huge))).toBeNull()
  }, 120_000)
})

describe('writeArtworkToCache', () => {
  it('writes a v2 webp key and skips re-encoding on the second write', async () => {
    const dir = await makeTempCacheDir()
    const source = jpegSource(await createJpeg(800, 600))
    const firstKey = await writeArtworkToCache(dir, source)
    const firstStats = await stat(join(dir, firstKey!))
    const firstMtimeMs = firstStats.mtimeMs

    expect(firstKey).not.toBeNull()
    expect(isCurrentArtworkCacheKey(firstKey)).toBe(true)

    const secondKey = await writeArtworkToCache(dir, source)
    expect(secondKey).toBe(firstKey)
    const secondStats = await stat(join(dir, secondKey!))
    expect(secondStats.mtimeMs).toBe(firstMtimeMs)

    const files = await listFiles(dir)
    expect(files).toHaveLength(1)
    expect(files[0]).toBe(firstKey)
  })

  it('leaves no temp files when two concurrent writers race for the same key', async () => {
    const dir = await makeTempCacheDir()
    const source = jpegSource(await createJpeg(640, 480))

    const [keyA, keyB] = await Promise.all([
      writeArtworkToCache(dir, source),
      writeArtworkToCache(dir, source),
    ])

    expect(keyA).toBe(keyB)
    expect(keyA).not.toBeNull()
    const files = await listFiles(dir)
    expect(files).toEqual([keyA])
    const content = await readFile(join(dir, keyA!))
    expect((await sharp(content).metadata()).format).toBe('webp')
  })

  it('reuses an existing final file without touching it', async () => {
    const dir = await makeTempCacheDir()
    const source = jpegSource(await createJpeg(400, 400))
    const key = await writeArtworkToCache(dir, source)
    const before = await readFile(join(dir, key!))
    const beforeStats = await stat(join(dir, key!))

    const reused = await writeArtworkToCache(dir, source)
    expect(reused).toBe(key)
    const after = await readFile(join(dir, key!))
    expect(after.equals(before)).toBe(true)
    expect((await stat(join(dir, key!))).mtimeMs).toBe(beforeStats.mtimeMs)
  })

  it('returns null for a corrupted source and leaves no final or temp file', async () => {
    const dir = await makeTempCacheDir()
    const key = await writeArtworkToCache(dir, jpegSource(Buffer.from('corrupted bytes')))

    expect(key).toBeNull()
    expect(await listFiles(dir)).toEqual([])
  })

  it('leaves exactly one complete file and no temp artifacts after a write', async () => {
    const dir = await makeTempCacheDir()
    const source = jpegSource(await createJpeg(1500, 1000))
    const key = await writeArtworkToCache(dir, source)

    expect(key).not.toBeNull()
    const files = await listFiles(dir)
    expect(files).toHaveLength(1)
    expect(files[0]).toBe(key)
    expect(isArtworkTempFileName(files[0])).toBe(false)

    const content = await readFile(join(dir, key!))
    const metadata = await sharp(content).metadata()
    expect(metadata.format).toBe('webp')
    expect(metadata.width).toBeLessThanOrEqual(1024)
    expect(metadata.height).toBeLessThanOrEqual(1024)
  })
})
