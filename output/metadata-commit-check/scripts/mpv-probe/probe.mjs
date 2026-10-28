import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseArgs } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { openMpv } from './mpv-ipc.mjs'

const { values } = parseArgs({
  options: {
    mpv: { type: 'string' },
    ffmpeg: { type: 'string', default: 'ffmpeg' },
    out: { type: 'string', default: 'artifacts/mpv-probe/runs' },
    'audio-output': { type: 'string', default: 'null' },
  },
})
if (!values.mpv)
  throw new Error('Usage: node scripts/mpv-probe/probe.mjs --mpv <mpv.exe> [--ffmpeg <ffmpeg.exe>]')
const mpv = resolve(values.mpv)
const out = join(resolve(values.out), new Date().toISOString().replace(/[:.]/g, '-'))
mkdirSync(out, { recursive: true })
const rate = 44100
const framesPerTrack = rate * 3 + 137
const common = [
  '--no-config',
  '--load-scripts=no',
  '--video=no',
  '--audio-display=no',
  '--gapless-audio=yes',
  '--replaygain=no',
  '--volume=100',
]
function run(executable, args) {
  const result = spawnSync(executable, args, {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error || result.status !== 0)
    throw new Error(`${executable}: ${result.error ?? result.stderr ?? result.stdout}`)
  return result.stdout + result.stderr
}
function wav(pcm) {
  const header = Buffer.alloc(44)
  header.write('RIFF')
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(2, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 4, 28)
  header.writeUInt16LE(4, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}
const original = Buffer.alloc(framesPerTrack * 3 * 4)
for (let frame = 0; frame < original.length / 4; frame++) {
  const t = frame / rate
  for (let channel = 0; channel < 2; channel++) {
    const sample = Math.round(
      9000 * Math.sin(2 * Math.PI * (317 * t + 1.7 * t * t) + channel * 0.4) +
        3500 * Math.cos(2 * Math.PI * 53 * t),
    )
    original.writeInt16LE(sample, frame * 4 + channel * 2)
  }
}
writeFileSync(join(out, 'continuous-reference.wav'), wav(original))
const formats = { wav: [], flac: [], mp3: [], m4a: [] }
for (let index = 0; index < 3; index++) {
  const input = join(out, `track-${index + 1}.wav`)
  writeFileSync(
    input,
    wav(original.subarray(index * framesPerTrack * 4, (index + 1) * framesPerTrack * 4)),
  )
  formats.wav.push(input)
  for (const [extension, codec] of [
    ['flac', ['-c:a', 'flac']],
    ['mp3', ['-c:a', 'libmp3lame', '-b:a', '320k']],
    ['m4a', ['-c:a', 'aac', '-b:a', '256k']],
  ]) {
    const target = join(out, `track-${index + 1}.${extension}`)
    run(values.ffmpeg, ['-v', 'error', '-nostdin', '-i', input, ...codec, target])
    formats[extension].push(target)
  }
}
function renderPcm(paths, name) {
  const target = join(out, `${name}.pcm`)
  const log = run(mpv, [
    ...common,
    '--ao=pcm',
    `--ao-pcm-file=${target}`,
    '--ao-pcm-waveheader=no',
    '--audio-format=s16',
    '--audio-samplerate=44100',
    '--audio-channels=stereo',
    '--',
    ...paths,
  ])
  writeFileSync(join(out, `${name}.log`), log, 'utf8')
  return readFileSync(target)
}
const report = {
  mpvVersion: run(mpv, ['--version']).trim(),
  ffmpegVersion: run(values.ffmpeg, ['-version']).split('\n')[0],
  outputDirectory: out,
  method:
    'Synthetic continuous stereo signal split at exact sample boundaries. PCM file sink checks inserted/dropped samples, not physical output-device continuity. IPC checks are muted.',
  ipcAudioOutput: values['audio-output'],
  formats: {},
  controls: {},
}
writeFileSync(join(out, 'playlist.m3u8'), formats.flac.join('\n') + '\n', 'utf8')
for (const [format, paths] of Object.entries(formats)) {
  const separate = Buffer.concat(paths.map((path, i) => renderPcm([path], `${format}-single-${i}`)))
  const playlist = renderPcm(paths, `${format}-playlist`)
  const decodedFrames = playlist.length / 4
  const same = separate.equals(playlist)
  let firstDifferentByte = -1
  for (let i = 0; i < Math.min(playlist.length, separate.length); i++)
    if (playlist[i] !== separate[i]) {
      firstDifferentByte = i
      break
    }
  report.formats[format] = {
    expectedOriginalFrames: original.length / 4,
    decodedFrames,
    extraFramesVsOriginal: decodedFrames - original.length / 4,
    standaloneFrames: separate.length / 4,
    equalsConcatenatedStandaloneDecode: same,
    firstDifferentByte,
    losslessMatchesOriginal: ['wav', 'flac'].includes(format) ? original.equals(playlist) : null,
  }
  console.log(format, JSON.stringify(report.formats[format]))
}
const player = await openMpv(mpv, [
  `--ao=${values['audio-output']}`,
  '--mute=yes',
  '--pause=yes',
  '--gapless-audio=yes',
])
try {
  await player.command('observe_property', 1, 'time-pos')
  await player.command('observe_property', 2, 'playlist-pos')
  await player.command('loadfile', formats.flac[0], 'replace')
  await player.waitForEvent('file-loaded')
  await player.command('loadfile', formats.flac[1], 'append')
  await player.command('loadfile', formats.flac[2], 'append')
  assert.equal(await player.command('get_property', 'playlist-count'), 3)
  await player.command('set_property', 'pause', false)
  await delay(250)
  const advancing = await player.command('get_property', 'time-pos')
  assert.ok(advancing > 0)
  await player.command('set_property', 'pause', true)
  await delay(100)
  const paused = await player.command('get_property', 'time-pos')
  await delay(200)
  assert.ok(Math.abs((await player.command('get_property', 'time-pos')) - paused) < 0.025)
  report.controls.pauseResume = true
  const seekCursor = player.events.length
  await player.command('seek', 1.25, 'absolute+exact')
  await player.waitForEvent('playback-restart', seekCursor)
  const seekPosition = await player.command('get_property', 'time-pos')
  report.controls.pausedSeek = {
    requested: 1.25,
    observed: seekPosition,
    within50ms: Math.abs(seekPosition - 1.25) < 0.05,
  }
  await player.command('set_property', 'pause', false)
  const resumeAt = performance.now()
  await delay(150)
  const resumedPosition = await player.command('get_property', 'time-pos')
  report.controls.resumedSeek = {
    observed: resumedPosition,
    expected: 1.25 + (performance.now() - resumeAt) / 1000,
  }
  assert.ok(Math.abs(resumedPosition - report.controls.resumedSeek.expected) < 0.08)
  await player.command('set_property', 'pause', true)
  report.controls.seekAfterResume = true
  await player.command('set_property', 'volume', 37)
  assert.equal(await player.command('get_property', 'volume'), 37)
  await player.command('set_property', 'mute', true)
  assert.equal(await player.command('get_property', 'mute'), true)
  report.controls.volumeMute = true
  await player.command('playlist-move', 2, 1)
  assert.equal((await player.command('get_property', 'playlist'))[1].filename, formats.flac[2])
  await player.command('playlist-remove', 1)
  assert.equal(await player.command('get_property', 'playlist-count'), 2)
  report.controls.queueEdit = true
  const nextCursor = player.events.length
  await player.command('playlist-next', 'force')
  await player.waitForEvent('file-loaded', nextCursor)
  assert.equal(await player.command('get_property', 'playlist-pos'), 1)
  report.controls.manualNext = true
  const previousCursor = player.events.length
  await player.command('playlist-prev', 'force')
  await player.waitForEvent('file-loaded', previousCursor)
  assert.equal(await player.command('get_property', 'playlist-pos'), 0)
  report.controls.manualPrevious = true
  const boundaryCursor = player.events.length
  await player.command('seek', 2.7, 'absolute+exact')
  await player.command('set_property', 'pause', false)
  await player.waitForEvent('file-loaded', boundaryCursor)
  assert.equal(await player.command('get_property', 'playlist-pos'), 1)
  report.controls.naturalAdvance = true
  report.controls.progressEvents = player.events.filter(
    (e) => e.event === 'property-change' && e.name === 'time-pos' && typeof e.data === 'number',
  ).length
  assert.ok(report.controls.progressEvents > 0)
} catch (error) {
  report.controls.error = String(error)
  process.exitCode = 1
} finally {
  await player.close()
  writeFileSync(join(out, 'ipc-events.json'), JSON.stringify(player.events, null, 2), 'utf8')
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
}
console.log(
  JSON.stringify({ controls: report.controls, report: join(out, 'report.json') }, null, 2),
)
