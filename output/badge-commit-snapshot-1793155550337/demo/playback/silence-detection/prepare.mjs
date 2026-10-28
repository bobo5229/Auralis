import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import './sequence.js'
import {
  analyze,
  boundaryPlan,
  parameters,
  parseSilence,
  peaks,
  runFfmpeg,
  synthesize,
  wave,
} from './audio.mjs'

const output = fileURLToPath(
  new URL('../../../.electron-home/silence-detection-demo/', import.meta.url),
)
await mkdir(output, { recursive: true })
const tone = (seconds, extra = {}) => ({ kind: 'tone', seconds, ...extra })
const silence = (seconds) => ({ kind: 'silence', seconds })
const cases = [
  {
    id: 'long-tail',
    name: '结尾 3 秒静音',
    description: '音乐结束后，跳过结尾空白。',
    segments: [tone(4), silence(3)],
    start: 0,
    end: 4.15,
  },
  {
    id: 'both-ends',
    name: '首尾都有静音',
    description: '开头 2 秒、结尾 3 秒空白，分别保留 0.15 秒余量。',
    segments: [silence(2), tone(4), silence(3)],
    start: 1.85,
    end: 6.15,
  },
  {
    id: 'middle-pause',
    name: '中间停顿 2 秒',
    description: '只处理首尾；音乐中间的停顿完整保留。',
    segments: [tone(3), silence(2), tone(3)],
    unchanged: true,
  },
  {
    id: 'short-tail',
    name: '结尾只有 0.5 秒静音',
    description: '不足 1 秒，不触发长静音处理。',
    segments: [tone(4), silence(0.5)],
    unchanged: true,
  },
  {
    id: 'no-silence',
    name: '没有长静音',
    description: '连续音频保持原样。',
    segments: [tone(6)],
    unchanged: true,
  },
  {
    id: 'quiet-noise',
    name: '结尾带极轻底噪',
    description: '结尾噪声峰值约 −75 dBFS，也能识别为空白。',
    segments: [tone(4), { kind: 'noise', seconds: 3, level: 10 ** (-75 / 20) }],
    start: 0,
    end: 4.15,
  },
  {
    id: 'audible-noise',
    name: '结尾仍有较明显声音',
    description: '结尾噪声峰值约 −40 dBFS，高于检测阈值，保留。',
    segments: [tone(4), { kind: 'noise', seconds: 3, level: 0.01 }],
    unchanged: true,
  },
  {
    id: 'right-channel',
    name: '只有右声道仍在发声',
    description: '左声道静音、右声道有音乐，整段保留。',
    segments: [tone(4), tone(3, { rightOnly: true })],
    unchanged: true,
  },
  {
    id: 'fade-tail',
    name: '渐弱收尾后静音',
    description: '音乐最后 1 秒渐弱，再接 3 秒空白；保留余量保护尾音。',
    segments: [tone(4, { kind: 'fade' }), silence(3)],
    endRange: [4, 4.2],
  },
  {
    id: 'all-silent',
    name: '整段都是静音',
    description: '单独标记整段静音，保留原音频供检查。',
    segments: [silence(3)],
    allSilent: true,
  },
]

// Verify EOF handling and boundary selection separately from real FFmpeg output.
assert.deepEqual(parseSilence('silence_start: 4\n', 7), [{ start: 4, end: 7 }])
assert.deepEqual(boundaryPlan([{ start: 3, end: 5 }], 8), { start: 0, end: 8, allSilent: false })

for (const entry of cases) {
  entry.file = `${entry.id}.wav`
  await writeFile(join(output, entry.file), wave(synthesize(entry.segments)))
}
for (const [id, extension, encoder] of [
  ['mp3-tail', 'mp3', 'libmp3lame'],
  ['aac-tail', 'm4a', 'aac'],
]) {
  const file = `${id}.${extension}`
  runFfmpeg([
    '-v',
    'error',
    '-y',
    '-i',
    join(output, 'long-tail.wav'),
    '-c:a',
    encoder,
    '-b:a',
    '128k',
    join(output, file),
  ])
  cases.push({
    id,
    name: `${extension === 'mp3' ? 'MP3' : 'AAC'} 结尾长静音`,
    description: '有损压缩后的测试音频，同样检测并跳过结尾空白。',
    file,
    start: 0,
    end: 4.15,
    tolerance: 0.07,
  })
}

const samples = []
const analyses = new Map()
for (const entry of cases) {
  const path = join(output, entry.file)
  const hash = () =>
    readFile(path).then((bytes) => createHash('sha256').update(bytes).digest('hex'))
  const before = await hash()
  const result = analyze(path)
  analyses.set(entry.id, result)
  const tolerance = entry.tolerance ?? 0.02
  if (entry.unchanged) {
    assert.equal(result.start, 0, `${entry.id}: start must be unchanged`)
    assert.equal(result.end, result.duration, `${entry.id}: end must be unchanged`)
    assert(result.trimmed.equals(result.pcm), `${entry.id}: PCM must be unchanged`)
  }
  if (entry.start !== undefined)
    assert(
      Math.abs(result.start - entry.start) < tolerance,
      `${entry.id}: unexpected start ${result.start}`,
    )
  if (entry.end !== undefined)
    assert(
      Math.abs(result.end - entry.end) < tolerance,
      `${entry.id}: unexpected end ${result.end}`,
    )
  if (entry.endRange)
    assert(
      result.end >= entry.endRange[0] && result.end <= entry.endRange[1],
      `${entry.id}: fade tail was cut`,
    )
  assert.equal(result.allSilent, entry.allSilent ?? false, `${entry.id}: all-silent classification`)
  const trimmedFile = `${entry.id}-preview.wav`
  await writeFile(join(output, trimmedFile), wave(result.trimmed))
  // Decode the written comparison artifact to verify real playability and duration.
  const played = runFfmpeg([
    '-v',
    'error',
    '-i',
    join(output, trimmedFile),
    '-f',
    's16le',
    '-c:a',
    'pcm_s16le',
    'pipe:1',
  ]).stdout
  assert(played.equals(result.trimmed), `${entry.id}: preview PCM differs after decoding`)
  assert.equal(await hash(), before, `${entry.id}: source file was modified`)
  await writeFile(join(output, `${entry.id}-ffmpeg.log`), result.log, 'utf8')
  const kept = result.trimmed.length / (48000 * 2 * 2)
  samples.push({
    id: entry.id,
    name: entry.name,
    description: entry.description,
    source: entry.file,
    preview: trimmedFile,
    duration: result.duration,
    start: result.start,
    end: result.end,
    kept,
    removed: result.duration - kept,
    allSilent: result.allSilent,
    intervals: result.intervals,
    waveform: peaks(result.pcm),
  })
  console.log(
    `PASS ${entry.id}: ${result.duration.toFixed(3)}s -> ${kept.toFixed(3)}s${result.allSilent ? ' (all silent)' : ''}`,
  )
}

// Two distinct sources: A ends in three seconds of silence; B has a higher pitch.
const first = analyses.get('long-tail')
const secondFile = 'sequence-b.wav'
await writeFile(join(output, secondFile), wave(synthesize([tone(4, { frequency: 392 })])))
const second = analyze(join(output, secondFile))
// For this direct hand-off demo, use no extra tail padding.
const cutEnd = Math.round(boundaryPlan(first.intervals, first.duration, 0).end * 48000) / 48000
assert(Math.abs(cutEnd - 4) < 0.02, 'Sequence A must end at its detected musical boundary')
const sequence = {
  first: {
    name: '片段 A · 低音',
    duration: first.duration,
    pcmBase64: first.pcm.toString('base64'),
  },
  second: {
    name: '片段 B · 高音',
    duration: second.duration,
    pcmBase64: second.pcm.toString('base64'),
  },
  sampleRate: 48000,
  channels: 2,
  cutEnd,
  removed: first.duration - cutEnd,
  fadeSeconds: 2,
}
for (const skip of [false, true]) {
  const a = skip ? first.pcm.subarray(0, Math.round(cutEnd * 48000) * 4) : first.pcm
  const joined = Buffer.concat([a, second.pcm])
  const file = `sequence-${skip ? 'skip' : 'original'}.wav`
  await writeFile(join(output, file), wave(joined))
  const decoded = analyze(join(output, file))
  assert(decoded.pcm.equals(joined), `${file}: joined PCM must preserve both source segments`)
  assert(Math.abs(decoded.duration - (a.length / (48000 * 4) + second.duration)) < 1 / 48000)
  if (skip)
    assert.equal(decoded.intervals.length, 0, 'Skipped sequence must have no long gap at the join')
  else
    assert(
      decoded.intervals.some(
        ({ start, end }) => Math.abs(start - 4) < 0.02 && Math.abs(end - 7) < 0.02,
      ),
      'Original sequence must retain its three-second gap',
    )
  console.log(
    `PASS ${file}: ${decoded.duration.toFixed(3)}s; long gaps: ${decoded.intervals.length}`,
  )
}

// Independent FFmpeg reference for the browser's complementary cosine envelopes.
const fadePlan = globalThis.silenceSequencePlan({
  mode: 'crossfade',
  firstDuration: first.duration,
  secondDuration: second.duration,
  cutEnd,
  fadeSeconds: sequence.fadeSeconds,
})
const endFrames = Math.round(cutEnd * 48000)
const fadeFrames = Math.round(fadePlan.overlap * 48000)
const bStartFrame = endFrames - fadeFrames
const filter = `[0:a]atrim=end_sample=${endFrames},asetpts=PTS-STARTPTS,aformat=sample_fmts=flt[a];[1:a]aformat=sample_fmts=flt[b];[a][b]acrossfade=ns=${fadeFrames}:c1=hsin:c2=hsin[out]`
const reference = runFfmpeg([
  '-v',
  'error',
  '-i',
  join(output, 'long-tail.wav'),
  '-i',
  join(output, secondFile),
  '-filter_complex',
  filter,
  '-map',
  '[out]',
  '-c:a',
  'pcm_f32le',
  '-f',
  'f32le',
  'pipe:1',
]).stdout
const outputFrames = reference.length / 8
assert.equal(outputFrames, endFrames + second.pcm.length / 4 - fadeFrames)
let maximumError = 0
const converted = Buffer.alloc(outputFrames * 4)
for (let frame = 0; frame < outputFrames; frame++) {
  const progress = (frame - bStartFrame) / fadeFrames
  const gainB =
    frame < bStartFrame ? 0 : frame >= endFrames ? 1 : (1 - Math.cos(Math.PI * progress)) / 2
  const gainA = frame < bStartFrame ? 1 : frame >= endFrames ? 0 : 1 - gainB
  for (let channel = 0; channel < 2; channel++) {
    const a = frame < endFrames ? first.pcm.readInt16LE(frame * 4 + channel * 2) / 32768 : 0
    const bFrame = frame - bStartFrame
    const b = bFrame >= 0 ? second.pcm.readInt16LE(bFrame * 4 + channel * 2) / 32768 : 0
    const actual = reference.readFloatLE(frame * 8 + channel * 4)
    maximumError = Math.max(maximumError, Math.abs(actual - (a * gainA + b * gainB)))
    converted.writeInt16LE(
      Math.max(-32768, Math.min(32767, Math.round(actual * 32768))),
      frame * 4 + channel * 2,
    )
  }
}
assert(maximumError < 0.00002, `Crossfade envelopes differ from FFmpeg: ${maximumError}`)
await writeFile(join(output, 'sequence-crossfade.wav'), wave(converted))
const crossfade = analyze(join(output, 'sequence-crossfade.wav'))
assert.equal(crossfade.intervals.length, 0, 'Crossfade must have no long silent gap')
assert(Math.abs(crossfade.duration - fadePlan.totalDuration) < 1 / 48000)
sequence.crossfadeDuration = crossfade.duration
sequence.crossfadeMaximumError = maximumError
console.log(
  `PASS sequence-crossfade.wav: ${crossfade.duration.toFixed(3)}s; overlap: ${fadePlan.overlap.toFixed(3)}s; error: ${maximumError}`,
)

const report = {
  generatedAt: new Date().toISOString(),
  parameters,
  passed: samples.length,
  samples,
  sequence,
  sequencePassed: 3,
}
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
await writeFile(
  join(output, 'report.js'),
  `window.SILENCE_DEMO_REPORT = ${JSON.stringify(report)};\n`,
  'utf8',
)
console.log(`\n${samples.length} real FFmpeg cases passed. Artifacts: ${output}`)
console.log('Demo UI was not opened. No audio was played.')
