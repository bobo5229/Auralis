import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import {
  prepareTagAudioBuffer,
  tagAudioContinuation,
  TAG_PLAYBACK_EXTENSIONS,
} from './tagAudioBuffer'
import { prepareAudioTagWrite } from '../metadata/audioTagWriteService'
import { readMpvTimestampOrigin } from './softTransition'

const mpv = resolve('resources/audio/mpv.exe'),
  ffmpeg = resolve('resources/audio/ffmpeg.exe')
const available = process.platform === 'win32' && existsSync(mpv) && existsSync(ffmpeg)
const formats = [
  ['wav', 'pcm_s16le'],
  ['flac', 'flac'],
  ['mp3', 'libmp3lame'],
  ['m4a', 'aac'],
  ['aac', 'aac'],
  ['ogg', 'libvorbis'],
  ['opus', 'libopus'],
] as const

describe.skipIf(!available)('same-song PCM buffers with the bundled decoders', () => {
  let directory: string
  const run = (executable: string, args: string[]) =>
    execFileSync(executable, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
      maxBuffer: 64 * 1024 * 1024,
    })
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'auralis-tag-pcm-test-'))
    const raw = join(directory, 'source.raw')
    const pcm = Buffer.alloc(48000 * 12 * 4)
    for (let frame = 0; frame < pcm.length / 4; frame++) {
      pcm.writeInt16LE(
        Math.round(10000 * Math.sin(frame * 0.027) + 6000 * Math.sin(frame * 0.119)),
        frame * 4,
      )
      pcm.writeInt16LE(Math.round(13000 * Math.sin(frame * 0.031)), frame * 4 + 2)
    }
    await writeFile(raw, pcm)
    for (const [extension, codec] of formats)
      run(ffmpeg, [
        '-nostdin',
        '-v',
        'error',
        '-f',
        's16le',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-i',
        raw,
        '-c:a',
        codec,
        join(directory, `source.${extension}`),
      ])
    for (const [extension] of formats)
      run(mpv, [
        '--no-config',
        '--load-scripts=no',
        '--terminal=no',
        '--video=no',
        '--audio-display=no',
        '--idle=no',
        '--keep-open=no',
        '--replaygain=no',
        '--volume=100',
        '--ao=pcm',
        `--ao-pcm-file=${join(directory, `reference-${extension}.raw`)}`,
        '--ao-pcm-waveheader=no',
        '--audio-format=float',
        '--audio-samplerate=48000',
        '--audio-channels=stereo',
        join(directory, `source.${extension}`),
      ])
  })
  afterAll(async () => {
    if (
      !resolve(directory).startsWith(resolve(tmpdir()) + sep) ||
      !basename(directory).startsWith('auralis-tag-pcm-test-')
    )
      throw new Error('Unsafe test directory')
    await rm(directory, { recursive: true, force: true })
  })
  it.each(formats)(
    'keeps the sample interval in %s, compared with uninterrupted decoding',
    async (extension) => {
      const source = join(directory, `source.${extension}`)
      const referencePath = join(directory, `reference-${extension}.raw`)
      const buffer = await prepareTagAudioBuffer(
        mpv,
        ffmpeg,
        source,
        2,
        12,
        true,
        new AbortController().signal,
      )
      try {
        const actual = run(ffmpeg, [
          '-nostdin',
          '-v',
          'error',
          '-i',
          buffer.path,
          '-f',
          'f32le',
          'pipe:1',
        ])
        const expected = (await readFile(referencePath)).subarray(2 * 48000 * 8, 10 * 48000 * 8)
        expect(actual.length).toBe(expected.length)
        let squared = 0,
          maximum = 0
        for (let offset = 0; offset < actual.length; offset += 4) {
          const difference = Math.abs(actual.readFloatLE(offset) - expected.readFloatLE(offset))
          maximum = Math.max(maximum, difference)
          squared += difference * difference
        }
        if (['wav', 'flac', 'mp3'].includes(extension)) expect(actual.equals(expected)).toBe(true)
        else {
          // Codec seeking may change initial synthesis state; sample loss or duplication fails these bounds.
          expect(Math.sqrt(squared / (actual.length / 4))).toBeLessThan(0.0001)
          expect(maximum).toBeLessThan(0.005)
        }
      } finally {
        await buffer.dispose()
      }
    },
    15000,
  )
  it.each([
    [22050, 1, 0.123],
    [44100, 2, 1.317],
    [96000, 1, 10.121],
    [192000, 2, 11.357],
  ])(
    'keeps exact samples at %i Hz with %i channels, including the song tail',
    async (rate, channels, start) => {
      const source = join(directory, `${rate}-${channels}.flac`)
      const referencePath = join(directory, `${rate}-${channels}.raw`)
      run(ffmpeg, [
        '-nostdin',
        '-v',
        'error',
        '-i',
        join(directory, 'source.flac'),
        '-ar',
        String(rate),
        '-ac',
        String(channels),
        source,
      ])
      run(mpv, [
        '--no-config',
        '--load-scripts=no',
        '--terminal=no',
        '--video=no',
        '--audio-display=no',
        '--idle=no',
        '--keep-open=no',
        '--ao=pcm',
        `--ao-pcm-file=${referencePath}`,
        '--ao-pcm-waveheader=no',
        '--audio-format=float',
        `--audio-samplerate=${rate}`,
        `--audio-channels=${channels === 1 ? 'mono' : 'stereo'}`,
        source,
      ])
      const buffer = await prepareTagAudioBuffer(
        mpv,
        ffmpeg,
        source,
        start,
        12,
        true,
        new AbortController().signal,
      )
      try {
        const actual = run(ffmpeg, [
          '-nostdin',
          '-v',
          'error',
          '-i',
          buffer.path,
          '-f',
          'f32le',
          'pipe:1',
        ])
        const reference = await readFile(referencePath)
        expect(
          actual.equals(
            reference.subarray(
              Math.round(buffer.start * rate) * channels * 4,
              Math.round(buffer.end * rate) * channels * 4,
            ),
          ),
        ).toBe(true)
      } finally {
        await buffer.dispose()
      }
    },
    15000,
  )
  it.each(formats.filter(([extension]) => extension !== 'aac'))(
    'checks both %s seams against the enabled playback write formats',
    async (extension) => {
      const source = join(directory, `source.${extension}`)
      const prepared = await prepareAudioTagWrite(
        source,
        {
          trackId: 1,
          title: 'Updated',
          artistDisplay: null,
          albumTitle: null,
          albumArtistDisplay: null,
          genreDisplay: null,
          year: null,
          releaseDate: null,
        },
        ffmpeg,
      )
      const buffer = await prepareTagAudioBuffer(
        mpv,
        ffmpeg,
        source,
        2,
        12,
        true,
        new AbortController().signal,
      )
      const output = join(directory, `joined-${extension}.raw`)
      try {
        const expected = await readFile(join(directory, `reference-${extension}.raw`))
        const origin = await readMpvTimestampOrigin(
          mpv,
          prepared.stagingPath,
          new AbortController().signal,
        )
        run(mpv, [
          '--no-config',
          '--load-scripts=no',
          '--terminal=no',
          '--video=no',
          '--audio-display=no',
          '--idle=no',
          '--keep-open=no',
          '--gapless-audio=yes',
          '--replaygain=no',
          '--volume=100',
          '--ao=pcm',
          `--ao-pcm-file=${output}`,
          '--ao-pcm-waveheader=no',
          '--audio-format=float',
          '--audio-samplerate=48000',
          '--audio-channels=stereo',
          '--hr-seek=yes',
          '--hr-seek-demuxer-offset=1',
          '--{',
          `--end=${buffer.start + 0.25 / buffer.rate}`,
          source,
          '--}',
          buffer.path,
          tagAudioContinuation(
            prepared.stagingPath,
            buffer.end,
            expected.length / 8 / 48000,
            buffer.rate,
            origin,
          ),
        ])
        const actual = await readFile(output)
        const sameLength = actual.length === expected.length
        let squared = 0,
          maximum = 0
        for (let offset = 0; offset < Math.min(actual.length, expected.length); offset += 4) {
          const difference = Math.abs(actual.readFloatLE(offset) - expected.readFloatLE(offset))
          squared += difference * difference
          maximum = Math.max(maximum, difference)
        }
        const seamless =
          sameLength &&
          (['wav', 'flac'].includes(extension)
            ? actual.equals(expected)
            : Math.sqrt(squared / (actual.length / 4)) < 0.0001 && maximum < 0.005)
        expect(seamless, `RMS ${Math.sqrt(squared / (actual.length / 4))}, max ${maximum}`).toBe(
          TAG_PLAYBACK_EXTENSIONS.includes(`.${extension}`),
        )
      } finally {
        await buffer.dispose()
        await prepared.dispose()
      }
    },
    15000,
  )
})
