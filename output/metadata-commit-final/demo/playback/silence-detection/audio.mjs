import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const ffmpeg = fileURLToPath(new URL('../../../resources/audio/ffmpeg.exe', import.meta.url))
export const sampleRate = 48000
export const channels = 2
export const parameters = Object.freeze({ noiseDb: -60, minimumSeconds: 1, paddingSeconds: 0.15 })

export function runFfmpeg(args) {
  const result = spawnSync(ffmpeg, ['-nostdin', '-hide_banner', ...args], {
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error || result.status !== 0)
    throw new Error(`FFmpeg failed: ${result.error ?? result.stderr.toString('utf8')}`)
  return result
}

export function wave(pcm) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * 2, 28)
  header.writeUInt16LE(channels * 2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export function synthesize(segments) {
  let seed = 75321
  return Buffer.concat(
    segments.map(({ seconds, kind, level = 0.12, rightOnly = false, frequency = 220 }) => {
      const frames = Math.round(seconds * sampleRate)
      const pcm = Buffer.alloc(frames * channels * 2)
      for (let frame = 0; frame < frames; frame++) {
        const time = frame / sampleRate
        const edge = Math.min(1, frame / 480, (frames - 1 - frame) / 480)
        const fade = kind === 'fade' ? Math.min(1, seconds - time) ** 2 : 1
        for (let channel = 0; channel < channels; channel++) {
          let value = 0
          if (kind === 'noise') {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
            value = ((seed / 0x100000000) * 2 - 1) * level
          } else if (kind !== 'silence' && (!rightOnly || channel === 1)) {
            // A gentle synthetic chord; every fixture is generated locally.
            value =
              level *
              edge *
              fade *
              (0.6 * Math.sin(2 * Math.PI * frequency * time) +
                0.25 * Math.sin(2 * Math.PI * frequency * 1.5 * time) +
                0.15 * Math.sin(2 * Math.PI * frequency * 2 * time))
          }
          pcm.writeInt16LE(Math.round(value * 32767), (frame * channels + channel) * 2)
        }
      }
      return pcm
    }),
  )
}

export function parseSilence(log, duration) {
  const intervals = []
  let start = null
  for (const match of log.matchAll(/\bsilence_(start|end):\s*([-+\d.eE]+)/g)) {
    const time = Math.max(0, Math.min(duration, Number(match[2])))
    if (!Number.isFinite(time)) throw new Error('Invalid silence timestamp')
    if (match[1] === 'start') start = time
    else if (start !== null) {
      if (time > start) intervals.push({ start, end: time })
      start = null
    }
  }
  if (start !== null && duration > start) intervals.push({ start, end: duration })
  return intervals
}

export function boundaryPlan(intervals, duration, padding = parameters.paddingSeconds) {
  const tolerance = 2 / sampleRate
  const leading = intervals.find((interval) => interval.start <= tolerance)
  const trailing = intervals.findLast((interval) => interval.end >= duration - tolerance)
  const allSilent = Boolean(leading && leading.end >= duration - tolerance)
  // An entirely silent file has no musical boundary; retain it for inspection.
  const start = allSilent ? 0 : Math.max(0, (leading?.end ?? 0) - padding)
  const end = allSilent ? duration : Math.min(duration, (trailing?.start ?? duration) + padding)
  return { start, end, allSilent }
}

export function analyze(path) {
  const filter = `asetpts=PTS-STARTPTS,silencedetect=noise=${parameters.noiseDb}dB:d=${parameters.minimumSeconds}`
  const result = runFfmpeg([
    '-v',
    'info',
    '-i',
    path,
    '-map',
    '0:a:0',
    '-vn',
    '-sn',
    '-dn',
    '-af',
    filter,
    '-ar',
    String(sampleRate),
    '-ac',
    String(channels),
    '-c:a',
    'pcm_s16le',
    '-f',
    's16le',
    'pipe:1',
  ])
  const pcm = result.stdout
  const duration = pcm.length / (sampleRate * channels * 2)
  if (!duration) throw new Error('Empty decoded audio')
  const log = result.stderr.toString('utf8')
  const intervals = parseSilence(log, duration)
  const plan = boundaryPlan(intervals, duration)
  const startFrame = Math.round(plan.start * sampleRate)
  const endFrame = Math.round(plan.end * sampleRate)
  return {
    pcm,
    log,
    duration,
    intervals,
    ...plan,
    trimmed: pcm.subarray(startFrame * channels * 2, endFrame * channels * 2),
  }
}

export function peaks(pcm, bins = 360) {
  const frames = pcm.length / (channels * 2)
  return Array.from({ length: bins }, (_, bin) => {
    let peak = 0
    for (
      let frame = Math.floor((bin * frames) / bins);
      frame < Math.floor(((bin + 1) * frames) / bins);
      frame++
    )
      for (let channel = 0; channel < channels; channel++)
        peak = Math.max(peak, Math.abs(pcm.readInt16LE((frame * channels + channel) * 2)) / 32768)
    return peak
  })
}
