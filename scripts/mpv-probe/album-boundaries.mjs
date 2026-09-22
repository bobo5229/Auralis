import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    album: { type: 'string' },
    ffmpeg: { type: 'string', default: 'ffmpeg' },
    ffprobe: { type: 'string', default: 'ffprobe' },
    out: { type: 'string', default: 'artifacts/mpv-probe/boundaries' },
  },
})
if (!values.album)
  throw Error('Usage: node scripts/mpv-probe/album-boundaries.mjs --album <directory>')
const directory = resolve(values.album)
const out = join(resolve(values.out), new Date().toISOString().replace(/[:.]/g, '-'))
mkdirSync(out, { recursive: true })
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const run = (exe, args, options = {}) => {
  const result = spawnSync(exe, args, {
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  })
  if (result.error || result.status !== 0)
    throw Error(`${exe}: ${result.error ?? String(result.stderr)}`)
  return result.stdout
}
const tracks = readdirSync(directory)
  .filter((name) => /\.(m4a|mp3|flac|wav|ogg|opus)$/i.test(name))
  .map((name) => {
    const path = join(directory, name)
    const metadata = JSON.parse(
      run(values.ffprobe, [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=codec_name,sample_rate,channels,duration:format_tags=title,album,album_artist,artist,track,disc,iTunSMPB',
        '-of',
        'json',
        path,
      ]).toString('utf8'),
    )
    const stream = metadata.streams[0],
      tags = metadata.format?.tags ?? {}
    return {
      path,
      name,
      metadata,
      title: tags.title ?? name,
      disc: Number.parseInt(tags.disc, 10) || null,
      track: Number.parseInt(tags.track, 10) || null,
      album: tags.album ?? '',
      artist: tags.album_artist ?? tags.artist ?? '',
      sampleRate: Number(stream.sample_rate),
      channels: stream.channels,
      before: { sha256: hash(path), mtimeMs: statSync(path).mtimeMs },
    }
  })
  .sort(
    (a, b) =>
      (a.disc ?? 0) - (b.disc ?? 0) ||
      (a.track ?? 0) - (b.track ?? 0) ||
      a.name.localeCompare(b.name),
  )

/** Retain six seconds at either edge; never buffer a whole decoded album. */
async function decodeEdges(track) {
  const capacity = track.sampleRate * track.channels * 4 * 6
  const child = spawn(
    values.ffmpeg,
    ['-v', 'error', '-nostdin', '-i', track.path, '-map', '0:a:0', '-f', 'f32le', 'pipe:1'],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let head = Buffer.alloc(0),
    tail = Buffer.alloc(0),
    totalBytes = 0,
    diagnostic = ''
  child.stderr.on('data', (chunk) => {
    diagnostic += chunk.toString('utf8')
  })
  child.stdout.on('data', (chunk) => {
    totalBytes += chunk.length
    if (head.length < capacity)
      head = Buffer.concat([head, chunk.subarray(0, capacity - head.length)])
    tail = Buffer.concat([tail, chunk])
    if (tail.length > capacity) tail = tail.subarray(tail.length - capacity)
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill()
      reject(Error(`Decode timeout: ${track.name}`))
    }, 60000)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      code === 0 ? resolve() : reject(Error(diagnostic))
    })
  })
  const stride = track.channels * 4
  if (totalBytes % stride) throw Error('Incomplete PCM frame')
  function zeros(pcm, reverse) {
    let count = 0
    for (let frame = 0; frame < pcm.length / stride; frame++) {
      const position = (reverse ? pcm.length / stride - 1 - frame : frame) * stride
      let silent = true
      for (let channel = 0; channel < track.channels; channel++) {
        const value = pcm.readFloatLE(position + channel * 4)
        if (!Number.isFinite(value)) throw Error('Non-finite PCM')
        if (value !== 0) silent = false
      }
      if (!silent) break
      count++
    }
    return count
  }
  return {
    head,
    tail,
    decodedFrames: totalBytes / stride,
    headZeroFrames: zeros(head, false),
    tailZeroFrames: zeros(tail, true),
  }
}
const decoded = []
for (const track of tracks) {
  const edges = await decodeEdges(track)
  decoded.push(edges)
  console.log(
    `${track.name}: head ${((edges.headZeroFrames / track.sampleRate) * 1000).toFixed(3)}ms, tail ${((edges.tailZeroFrames / track.sampleRate) * 1000).toFixed(3)}ms`,
  )
}
const boundaries = []
for (let i = 1; i < tracks.length; i++) {
  const previous = tracks[i - 1],
    next = tracks[i],
    a = decoded[i - 1],
    b = decoded[i]
  const gapMs =
    (a.tailZeroFrames / previous.sampleRate) * 1000 + (b.headZeroFrames / next.sampleRate) * 1000
  const eligible =
    previous.disc !== null &&
    previous.disc === next.disc &&
    previous.track !== null &&
    next.track === previous.track + 1 &&
    previous.album !== '' &&
    previous.album === next.album &&
    previous.artist === next.artist &&
    previous.sampleRate === next.sampleRate &&
    previous.channels === next.channels
  boundaries.push({
    previous: previous.name,
    next: next.name,
    previousDisc: previous.disc,
    nextDisc: next.disc,
    previousTrack: previous.track,
    nextTrack: next.track,
    tailZeroFrames: a.tailZeroFrames,
    headZeroFrames: b.headZeroFrames,
    gapMs,
    consecutiveSameDisc: eligible,
    auditionCandidate: eligible && gapMs > 0 && gapMs <= 100,
    index: i,
  })
}
// Select a typical head gap, the shortest gap, and a two-sided gap. The 100ms cap is an experimental selection,
// not a product rule or a guarantee that silence was unintended.
const candidates = boundaries.filter(
  (boundary) => boundary.auditionCandidate && boundary.index !== 1,
)
const selections = [
  ...new Set([
    candidates[0],
    candidates.toSorted((a, b) => a.gapMs - b.gapMs)[0],
    candidates.findLast((candidate) => candidate.tailZeroFrames > 0),
  ]),
].filter(Boolean)
const auditions = []
for (const selected of selections) {
  const i = selected.index,
    previous = tracks[i - 1],
    a = decoded[i - 1],
    b = decoded[i]
  const stride = previous.channels * 4
  const original = Buffer.concat([a.tail, b.head])
  const trimmed = Buffer.concat([
    a.tail.subarray(0, a.tail.length - selected.tailZeroFrames * stride),
    b.head.subarray(selected.headZeroFrames * stride),
  ])
  const prefix = `${String(i).padStart(2, '0')}-to-${String(i + 1).padStart(2, '0')}`
  const outputs = {}
  for (const [label, pcm] of [
    ['original', original],
    ['strict-zero-cut', trimmed],
  ]) {
    const target = join(out, `${prefix}-${label}.wav`)
    run(
      values.ffmpeg,
      [
        '-v',
        'error',
        '-nostdin',
        '-f',
        'f32le',
        '-ar',
        String(previous.sampleRate),
        '-ac',
        String(previous.channels),
        '-i',
        'pipe:0',
        '-c:a',
        'pcm_s24le',
        target,
      ],
      { input: pcm },
    )
    outputs[label] = target
  }
  auditions.push({
    ...selected,
    outputs,
    originalBoundarySeconds: a.tail.length / stride / previous.sampleRate,
    trimmedBoundarySeconds:
      (a.tail.length / stride - selected.tailZeroFrames) / previous.sampleRate,
  })
}
const report = {
  ffmpegVersion: run(values.ffmpeg, ['-version']).toString('utf8').split('\n')[0],
  directory,
  exactZeroDefinition:
    'Every channel equals zero in decoded float32 PCM; six-second edge scan, no amplitude threshold.',
  experimentalSelectionCapMs: 100,
  tracks: tracks.map((track, i) => {
    const { head, tail, ...metrics } = decoded[i]
    return { ...track, ...metrics }
  }),
  boundaries,
  auditions,
  originalsUnchanged: tracks.every(
    (track) =>
      hash(track.path) === track.before.sha256 &&
      statSync(track.path).mtimeMs === track.before.mtimeMs,
  ),
  limits:
    'No original continuous master reference. Zero samples alone cannot establish whether a pause is intentional. A/B outputs are diagnostic only; player behavior unchanged.',
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
console.log(
  JSON.stringify(
    {
      report: join(out, 'report.json'),
      trackCount: tracks.length,
      boundaryCount: boundaries.length,
      withExactZero: boundaries.filter((b) => b.gapMs > 0).length,
      candidates: boundaries.filter((b) => b.auditionCandidate).length,
      originalsUnchanged: report.originalsUnchanged,
      auditions,
    },
    null,
    2,
  ),
)
if (!report.originalsUnchanged) process.exitCode = 1
