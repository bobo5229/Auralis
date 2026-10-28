import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseArgs } from 'node:util'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { openMpv } from './mpv-ipc.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    mpv: { type: 'string' },
    ffprobe: { type: 'string', default: 'ffprobe' },
    ffmpeg: { type: 'string', default: 'ffmpeg' },
    out: { type: 'string', default: 'artifacts/mpv-probe/real' },
  },
})
if (!values.mpv || positionals.length !== 2)
  throw Error('Usage: node scripts/mpv-probe/real-tracks.mjs --mpv <mpv.exe> <track1> <track2>')
const files = positionals.map((file) => resolve(file))
const mpv = resolve(values.mpv)
const out = join(resolve(values.out), new Date().toISOString().replace(/[:.]/g, '-'))
mkdirSync(out, { recursive: true })
const run = (exe, args) => {
  const result = spawnSync(exe, args, {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) throw Error(`${exe}: ${result.error ?? result.stderr}`)
  return result.stdout + result.stderr
}
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const before = files.map((file) => ({
  path: file,
  sha256: hash(file),
  mtimeMs: statSync(file).mtimeMs,
}))
const metadata = files.map((file) =>
  JSON.parse(
    run(values.ffprobe, [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_name,sample_rate,channels,duration,duration_ts,time_base:format_tags=title,album,track,disc,iTunSMPB',
      '-of',
      'json',
      file,
    ]),
  ),
)
assert.ok(
  metadata.every(
    (item) => item.streams[0].sample_rate === '44100' && item.streams[0].channels === 2,
  ),
  'This probe expects 44.1 kHz stereo samples; no implicit resampling.',
)
function render(paths, name) {
  const output = join(out, `${name}.pcm`)
  const log = run(mpv, [
    '--no-config',
    '--load-scripts=no',
    '--video=no',
    '--audio-display=no',
    '--gapless-audio=yes',
    '--replaygain=no',
    '--volume=100',
    '--ao=pcm',
    `--ao-pcm-file=${output}`,
    '--ao-pcm-waveheader=no',
    '--audio-format=s16',
    '--audio-samplerate=44100',
    '--audio-channels=stereo',
    '--',
    ...paths,
  ])
  writeFileSync(join(out, `${name}.log`), log, 'utf8')
  return readFileSync(output)
}
const singles = files.map((file, index) => render([file], `single-${index + 1}`))
const combined = render(files, 'playlist')
const concatenated = Buffer.concat(singles)
function rms(pcm) {
  let sum = 0
  for (let i = 0; i < pcm.length; i += 2) sum += (pcm.readInt16LE(i) / 32768) ** 2
  return 20 * Math.log10(Math.sqrt(sum / (pcm.length / 2)))
}
const boundary = singles[0].length
const radius = 44100 * 4 * 10
writeFileSync(
  join(out, 'boundary-20s.pcm'),
  combined.subarray(Math.max(0, boundary - radius), Math.min(combined.length, boundary + radius)),
)
run(values.ffmpeg, [
  '-v',
  'error',
  '-nostdin',
  '-f',
  's16le',
  '-ar',
  '44100',
  '-ac',
  '2',
  '-i',
  join(out, 'boundary-20s.pcm'),
  join(out, 'boundary-20s.wav'),
])
const report = {
  mpvVersion: run(mpv, ['--version']).trim(),
  files: before,
  metadata,
  playlistEqualsConcatenatedStandaloneDecode: combined.equals(concatenated),
  playlistFrames: combined.length / 4,
  standaloneFrames: singles.map((pcm) => pcm.length / 4),
  originalFileDurationFrames: metadata.map((item) => item.streams[0].duration_ts),
  boundarySeconds: boundary / 4 / 44100,
  tail100msRmsDb: rms(singles[0].subarray(-4410 * 4)),
  head100msRmsDb: rms(singles[1].subarray(0, 4410 * 4)),
  leftChannelBoundaryStep:
    Math.abs(singles[1].readInt16LE(0) - singles[0].readInt16LE(singles[0].length - 4)) / 32768,
  audition: join(out, 'boundary-20s.wav'),
  limits:
    'PCM file-sink continuity and muted WASAPI state transitions only. Not a loopback capture or listening verdict; original mastering/encoder padding cannot be inferred without a reference.',
}
const player = await openMpv(mpv, [
  '--ao=wasapi',
  '--mute=yes',
  '--pause=yes',
  '--gapless-audio=yes',
])
try {
  await player.command('loadfile', files[0], 'replace')
  await player.waitForEvent('file-loaded')
  await player.command('loadfile', files[1], 'append')
  const duration = await player.command('get_property', 'duration')
  await player.command('seek', duration - 2, 'absolute+exact')
  const cursor = player.events.length
  await player.command('set_property', 'pause', false)
  await player.waitForEvent('file-loaded', cursor, 10000)
  assert.equal(await player.command('get_property', 'playlist-pos'), 1)
  const loadedAt = performance.now()
  let position = 0
  while (position <= 0 && performance.now() - loadedAt < 3000) {
    await delay(50)
    position = await player.command('get_property', 'time-pos')
  }
  report.wasapi = {
    advancedToSecond: true,
    position,
    positiveProgressAfterLoadedMs: performance.now() - loadedAt,
  }
  assert.ok(report.wasapi.position > 0)
} catch (error) {
  report.wasapi = { error: String(error) }
  process.exitCode = 1
} finally {
  await player.close()
  report.originalsUnchanged = before.every(
    (item) => hash(item.path) === item.sha256 && statSync(item.path).mtimeMs === item.mtimeMs,
  )
  writeFileSync(join(out, 'ipc-events.json'), JSON.stringify(player.events, null, 2), 'utf8')
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
}
console.log(JSON.stringify(report, null, 2))
if (!report.playlistEqualsConcatenatedStandaloneDecode || !report.originalsUnchanged)
  process.exitCode = 1
