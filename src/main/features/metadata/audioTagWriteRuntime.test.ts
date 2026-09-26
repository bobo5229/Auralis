import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { rename } from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveAudioRuntimePaths } from '../audio/audioRuntimePaths'
import { writeAudioTags } from './audioTagWriteService'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
vi.mock('node:fs/promises', () => ({
  stat: vi.fn(async () => ({ size: 10, mtimeMs: 100 })),
  copyFile: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
}))
vi.mock('music-metadata', () => ({
  parseFile: vi.fn(async () => ({
    common: { picture: [{ data: new Uint8Array([1]), format: 'image/png' }] },
  })),
}))

const metadata = {
  trackId: 1,
  title: 'Test',
  artistDisplay: null,
  albumTitle: null,
  albumArtistDisplay: null,
  genreDisplay: null,
  year: null,
  releaseDate: null,
}

function processResult(error?: Error) {
  const child = new EventEmitter()
  Object.assign(child, { stderr: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }) })
  queueMicrotask(() => (error ? child.emit('error', error) : child.emit('close', 0)))
  return child as ReturnType<typeof spawn>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(spawn).mockImplementation(() => processResult())
})

describe('bundled audio runtime', () => {
  it.each([false, true])(
    'uses the bundled tools for playback and both tag remux steps (packaged=%s)',
    async (isPackaged) => {
      const paths = resolveAudioRuntimePaths({
        isPackaged,
        appPath: 'C:/Auralis dev',
        resourcesPath: 'D:/Auralis/resources',
      })
      const directory = isPackaged ? 'D:/Auralis/resources/audio' : 'C:/Auralis dev/resources/audio'
      expect(paths.mpvPath).toBe(join(directory, 'mpv.exe'))
      expect(paths.ffmpegPath).toBe(join(directory, 'ffmpeg.exe'))
      await writeAudioTags('isolated.flac', metadata, paths.ffmpegPath)
      expect(spawn).toHaveBeenCalledTimes(2)
      for (const [executable, , options] of vi.mocked(spawn).mock.calls) {
        expect(executable).toBe(paths.ffmpegPath)
        expect(options).toMatchObject({ windowsHide: true })
      }
    },
  )

  it('reports a missing bundled binary without replacing the original or using PATH', async () => {
    vi.mocked(spawn).mockImplementation(() =>
      processResult(Object.assign(new Error('missing'), { code: 'ENOENT' })),
    )
    await expect(writeAudioTags('isolated.flac', metadata, 'missing/ffmpeg.exe')).rejects.toThrow(
      'bundled FFmpeg',
    )
    expect(rename).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledTimes(1)
  })
})
