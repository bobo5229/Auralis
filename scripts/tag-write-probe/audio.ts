import { NativePlaybackService } from '../../src/main/features/audio/nativePlaybackService'
import { PlaybackFileCoordinator } from '../../src/main/features/audio/playbackFileCoordinator'
import { PlaybackSpectrumService } from '../../src/main/features/audio/playbackSpectrumService'
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const directory = resolve(process.argv[2]!)
const baseline = process.argv.includes('--baseline')
await mkdir(directory, { recursive: true })
const mpvPath = resolve('resources/audio/mpv.exe'),
  ffmpegPath = resolve('resources/audio/ffmpeg.exe')
const format = process.argv.find((value) => value.startsWith('--format='))?.slice(9) ?? 'flac'
if (!['wav', 'flac', 'mp3', 'm4a', 'ogg', 'opus'].includes(format))
  throw new Error('Unsupported probe format')
const source = join(directory, `isolated.${format}`),
  raw = join(directory, 'source.raw')
const pcm = Buffer.alloc(48000 * 24 * 4)
let random = 1234567
const filtered = [0, 0]
for (let frame = 0; frame < pcm.length / 4; frame++) {
  for (let channel = 0; channel < 2; channel++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0
    filtered[channel] = filtered[channel]! * 0.8 + (random / 2 ** 32 - 0.5) * 0.2
    pcm.writeInt16LE(Math.round(filtered[channel]! * 28000), frame * 4 + channel * 2)
  }
}
await writeFile(raw, pcm)
execFileSync(
  ffmpegPath,
  [
    '-nostdin',
    '-v',
    'error',
    '-y',
    '-f',
    's16le',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-i',
    raw,
    '-metadata',
    'title=Before',
    source,
  ],
  { windowsHide: true },
)
execFileSync(
  mpvPath,
  [
    '--no-config',
    '--load-scripts=no',
    '--terminal=no',
    '--video=no',
    '--audio-display=no',
    '--idle=no',
    '--ao=pcm',
    `--ao-pcm-file=${join(directory, 'reference.raw')}`,
    '--ao-pcm-waveheader=no',
    '--audio-format=s16',
    '--audio-samplerate=48000',
    '--audio-channels=stereo',
    source,
  ],
  { windowsHide: true },
)
const warnings: string[] = [],
  events: unknown[] = [],
  seams: number[] = []
const coordinator = new PlaybackFileCoordinator({
  getTrackFilePath: () => source,
  getTrackIdsByFilePath: (path) => (path === source ? [1] : []),
  sendToRenderer: () => {},
})
const spectrum = new PlaybackSpectrumService({
  ffmpegPath,
  resolveTrack: async () => source,
  coordinator,
  emit: () => {},
  warn: (error) => warnings.push(String(error)),
})
const player = new NativePlaybackService({
  mpvPath,
  ffmpegPath,
  coordinator,
  mpvArgs: ['--ao=wasapi', '--prefetch-playlist=no'],
  resolveTrack: async () => source,
  emit: (event) => {
    events.push(event)
    spectrum.syncNative(player.getSpectrumSource())
  },
  warn: (error) => warnings.push(String(error)),
  suspendFileReaders: async (path) => {
    const start = player.getSpectrumSource()?.timelineOffset ?? 0
    seams.push(start, start + 8)
    return spectrum.suspendFileReaders(path)
  },
})
coordinator.setBufferedWriteCapability((path) => player.canWriteMetadata(path))
const recorder = spawn('python', [resolve('scripts/tag-write-probe/loopback.py'), directory], {
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let diagnostics = ''
recorder.stdout.on('data', (value) => {
  diagnostics += String(value)
})
recorder.stderr.on('data', (value) => {
  diagnostics += String(value)
})
const recorded = new Promise<void>((yes, no) => {
  recorder.once('error', no)
  recorder.once('close', (code) => (code === 0 ? yes() : no(new Error(diagnostics))))
})
void recorded.catch(() => undefined)
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (recorder.exitCode !== null) throw new Error(diagnostics)
    ready = await stat(join(directory, 'capture-ready')).then(
      () => true,
      () => false,
    )
    if (ready) break
    await delay(100)
  }
  if (!ready) throw new Error('Loopback recorder did not become ready')
  await player.command({ action: 'start', session: 1, trackId: 1, volume: 0.2, muted: false })
  await spectrum.subscribe(
    {
      subscriptionId: 'tag-probe',
      revision: 1,
      trackId: 1,
      currentTime: 0,
      isPlaying: true,
      enabled: true,
    },
    player.getSpectrumSource(),
  )
  const result = baseline
    ? { ok: true }
    : await player.writeMetadata(
        source,
        {
          trackId: 1,
          title: 'After',
          artistDisplay: null,
          albumTitle: null,
          albumArtistDisplay: null,
          genreDisplay: null,
          year: null,
          releaseDate: null,
        },
        async (commit) => {
          await commit()
        },
      )
  await writeFile(
    join(directory, 'playback.json'),
    JSON.stringify(
      { baseline, result, seams, warnings, events, spectrumDiagnostics: spectrum.diagnostics },
      null,
      2,
    ),
  )
  await recorded
  const alignment = JSON.parse(
    execFileSync('python', [resolve('scripts/tag-write-probe/analyze.py'), directory], {
      windowsHide: true,
      encoding: 'utf8',
    }),
  ) as { offsetSpreadFrames: number }
  if (alignment.offsetSpreadFrames > 2)
    throw new Error(`Loopback sample offset changed: ${alignment.offsetSpreadFrames} frames`)
  if (!result.ok || warnings.length) throw new Error(JSON.stringify({ result, warnings }))
  console.log(
    `Format: ${format}; loopback sample offset spread: ${alignment.offsetSpreadFrames} frames`,
  )
  console.log(await readFile(join(directory, 'capture.json'), 'utf8'))
} finally {
  await Promise.all([player.dispose(), spectrum.dispose()])
  if (recorder.exitCode === null) recorder.kill()
}
