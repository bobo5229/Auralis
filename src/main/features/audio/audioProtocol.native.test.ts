import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAudioProtocolHandler, type AudioProtocolResolver } from './audioProtocol'

const tempDirs: string[] = []

async function createFixture(): Promise<{ root: string; filePath: string }> {
  const root = await mkdtemp(join(tmpdir(), 'auralis-audio-protocol-'))
  tempDirs.push(root)
  const filePath = join(root, 'track.mp3')
  await writeFile(filePath, '0123456789')
  return { root, filePath }
}

function resolver(
  filePath: string | null,
  roots: string[],
  onFileMissing?: AudioProtocolResolver['onFileMissing'],
): AudioProtocolResolver {
  return {
    getFilePathByTrackId: () => filePath,
    getLibraryRootPaths: () => roots,
    onFileMissing,
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('audio protocol handler', () => {
  it('rejects invalid hosts, paths, and unsupported extensions', async () => {
    const handler = createAudioProtocolHandler(resolver('C:\\Music\\track.txt', ['C:\\Music']))

    expect((await handler(new Request('auralis-audio://other/1'))).status).toBe(400)
    expect((await handler(new Request('auralis-audio://track/not-an-id'))).status).toBe(400)
    expect((await handler(new Request('auralis-audio://track/1'))).status).toBe(415)
  })

  it('rejects files outside every configured library root', async () => {
    const { root } = await createFixture()
    const handler = createAudioProtocolHandler(resolver(join(root, '..', 'outside.mp3'), [root]))

    expect((await handler(new Request('auralis-audio://track/1'))).status).toBe(403)
  })

  it('reports missing files after path authorization', async () => {
    const { root } = await createFixture()
    const missingPath = join(root, 'missing.mp3')
    const onFileMissing = vi.fn()
    const handler = createAudioProtocolHandler(resolver(missingPath, [root], onFileMissing))

    expect((await handler(new Request('auralis-audio://track/7'))).status).toBe(404)
    expect(onFileMissing).toHaveBeenCalledWith(7, missingPath)
  })

  it('returns byte ranges with media headers', async () => {
    const { root, filePath } = await createFixture()
    const handler = createAudioProtocolHandler(resolver(filePath, [root]))
    const response = await handler(
      new Request('auralis-audio://track/1', { headers: { Range: 'bytes=2-5' } }),
    )

    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(response.headers.get('Content-Length')).toBe('4')
    expect(Buffer.from(await response.arrayBuffer()).toString('utf-8')).toBe('2345')
  })

  it('returns 416 for ranges beyond the end of the file', async () => {
    const { root, filePath } = await createFixture()
    const handler = createAudioProtocolHandler(resolver(filePath, [root]))
    const response = await handler(
      new Request('auralis-audio://track/1', { headers: { Range: 'bytes=10-' } }),
    )

    expect(response.status).toBe(416)
    expect(response.headers.get('Content-Range')).toBe('bytes */10')
  })

  it('rejects directories even when their names use an audio extension', async () => {
    const { root } = await createFixture()
    const directoryPath = join(root, 'folder.mp3')
    await mkdir(directoryPath)
    const onFileMissing = vi.fn()
    const handler = createAudioProtocolHandler(resolver(directoryPath, [root], onFileMissing))

    expect((await handler(new Request('auralis-audio://track/9'))).status).toBe(404)
    expect(onFileMissing).toHaveBeenCalledWith(9, directoryPath)
  })
})
