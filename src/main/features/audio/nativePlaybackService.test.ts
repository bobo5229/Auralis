import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import type { NativePlaybackEvent } from '@shared/ipc/contracts'
import { NativePlaybackService } from './nativePlaybackService'

const mpvPath = resolve('resources/audio/mpv.exe')
const ffmpegPath = resolve('resources/audio/ffmpeg.exe')
const available = process.platform === 'win32' && existsSync(mpvPath) && existsSync(ffmpegPath)
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(!available)('native mpv integration (isolated audio)', () => {
  let directory: string
  const events: NativePlaybackEvent[] = []
  const services: NativePlaybackService[] = []
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'auralis-mpv-test-'))
    for (const rate of [44100, 48000, 96000])
      for (const id of [1, 2]) {
        const data = Buffer.alloc(rate * 4 * 2 * 2)
        for (let frame = 0; frame < rate * 4; frame++) {
          const silent = id === 1 ? frame >= rate * 4 - 192 : frame < 1984
          const sample = silent ? 0 : frame % 2 ? -1000 : 1000
          data.writeInt16LE(sample, frame * 4)
          data.writeInt16LE(sample, frame * 4 + 2)
        }
        const raw = join(directory, `${rate}-${id}.raw`)
        await writeFile(raw, data)
        execFileSync(
          ffmpegPath,
          [
            '-v',
            'error',
            '-f',
            's16le',
            '-ar',
            String(rate),
            '-ac',
            '2',
            '-i',
            raw,
            '-metadata',
            'album=Test Live',
            '-metadata',
            'artist=Test Artist',
            '-metadata',
            'disc=1',
            '-metadata',
            `track=${id}`,
            join(directory, `${rate}-${id}.flac`),
          ],
          { windowsHide: true },
        )
      }
    return async () => {
      if (
        !resolve(directory).startsWith(resolve(tmpdir()) + sep) ||
        !basename(directory).startsWith('auralis-mpv-test-')
      ) {
        throw new Error('Refusing to remove unexpected test directory')
      }
      await rm(directory, { recursive: true, force: true })
    }
  })
  afterEach(() => {
    services.splice(0).forEach((service) => service.dispose())
    events.length = 0
  })
  function create(args: string[], rate = 48000) {
    const service = new NativePlaybackService({
      mpvPath,
      ffmpegPath,
      mpvArgs: args,
      resolveTrack: async (id) => {
        if (id > 2) throw new Error('Unknown track')
        return join(directory, `${rate}-${id}.flac`)
      },
      emit: (event) => events.push(event),
      warn: (error) => {
        throw error
      },
    })
    services.push(service)
    return service
  }
  async function waitFor(predicate: () => boolean, timeout = 10000) {
    const deadline = Date.now() + timeout
    while (!predicate() && Date.now() < deadline) await delay(20)
    expect(events.filter((event) => event.kind === 'error')).toEqual([])
    expect(predicate()).toBe(true)
  }
  it('handles pause, seek, resume, cancel, stale sessions and natural advance', async () => {
    const service = create(['--ao=null'])
    await service.command({ action: 'start', session: 1, trackId: 1, volume: 0, muted: true })
    await service.command({ action: 'pause', session: 1 })
    await waitFor(() => events.at(-1)?.isPlaying === false)
    await service.command({ action: 'seek', session: 1, time: 1 })
    await service.command({ action: 'next', session: 1, trackId: 2, trimDigitalSilence: false })
    await service.command({ action: 'cancel-next', session: 1 })
    expect(await service.command({ action: 'seek', session: 0, time: 3 })).toEqual({
      accepted: false,
    })
    await service.command({ action: 'next', session: 1, trackId: 2, trimDigitalSilence: false })
    await service.command({ action: 'resume', session: 1 })
    await waitFor(() => events.some((event) => event.kind === 'boundary' && event.trackId === 2))
    await waitFor(() => events.some((event) => event.kind === 'ended'))
    expect(events.filter((event) => event.kind === 'boundary')).toHaveLength(1)
  }, 15000)
  it.each([44100, 48000, 96000])(
    'preserves all nonzero PCM at %i Hz',
    async (rate) => {
      const pcm = join(directory, 'joined.pcm')
      const service = create(
        [
          '--ao=pcm',
          '--ao-pcm-waveheader=no',
          `--ao-pcm-file=${pcm}`,
          '--audio-format=s16',
          '--pause=yes',
        ],
        rate,
      )
      await service.command({ action: 'start', session: 1, trackId: 1, volume: 1, muted: false })
      expect(
        await service.command({ action: 'next', session: 1, trackId: 2, trimDigitalSilence: true }),
      ).toEqual({ accepted: true })
      await service.command({ action: 'resume', session: 1 })
      await waitFor(() => events.some((event) => event.kind === 'ended'))
      service.dispose()
      await delay(100)
      const left = await readFile(join(directory, `${rate}-1.raw`))
      const right = await readFile(join(directory, `${rate}-2.raw`))
      const expected = Buffer.concat([
        left.subarray(0, (rate * 4 - 192) * 4),
        right.subarray(1984 * 4),
      ])
      const actual = await readFile(pcm)
      let firstDifference = 0
      while (
        firstDifference < actual.length &&
        actual[firstDifference] === expected[firstDifference]
      )
        firstDifference++
      expect({ length: actual.length, firstDifference }).toEqual({
        length: expected.length,
        firstDifference: expected.length,
      })
      expect(actual.equals(expected)).toBe(true)
    },
    15000,
  )
  it.skipIf(!process.env.AURALIS_MPV_REAL_REPORT)(
    'matches the approved real AAC pair without modifying sources',
    async () => {
      const reportPath = process.env.AURALIS_MPV_REAL_REPORT!
      const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
        files: { path: string; sha256: string; mtimeMs: number }[]
      }
      const pcm = join(directory, 'real-joined.pcm')
      const service = new NativePlaybackService({
        mpvPath,
        ffmpegPath,
        mpvArgs: [
          '--ao=pcm',
          '--ao-pcm-waveheader=no',
          `--ao-pcm-file=${pcm}`,
          '--audio-format=s16',
          '--pause=yes',
        ],
        resolveTrack: async (id) => report.files[id - 1].path,
        emit: (event) => events.push(event),
        warn: (error) => {
          throw error
        },
      })
      services.push(service)
      await service.command({ action: 'start', session: 1, trackId: 1, volume: 1, muted: false })
      expect(
        await service.command({ action: 'next', session: 1, trackId: 2, trimDigitalSilence: true }),
      ).toEqual({ accepted: true })
      await service.command({ action: 'resume', session: 1 })
      await waitFor(() => events.some((event) => event.kind === 'ended'), 30000)
      service.dispose()
      await delay(100)
      const left = await readFile(join(dirname(reportPath), 'single-1.pcm'))
      const right = await readFile(join(dirname(reportPath), 'single-2.pcm'))
      // Float32 analysis found 1984 all-zero frames. Do not also remove the two
      // very quiet frames that become zero only after s16 quantization.
      const expected = Buffer.concat([left, right.subarray(1984 * 4)])
      const actual = await readFile(pcm)
      expect(actual.length).toBe(expected.length)
      expect(actual.equals(expected)).toBe(true)
      for (const file of report.files) {
        const hash = createHash('sha256')
          .update(await readFile(file.path))
          .digest('hex')
        expect(hash).toBe(file.sha256)
        expect((await stat(file.path)).mtimeMs).toBe(file.mtimeMs)
      }
    },
    45000,
  )
})
