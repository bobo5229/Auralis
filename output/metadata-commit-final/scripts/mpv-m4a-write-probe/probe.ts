import { openMpvClient, type MpvMessage } from '../../src/main/features/audio/mpvClient'
import { prepareAudioTagWrite } from '../../src/main/features/metadata/audioTagWriteService'
import { parseAudioMetadata } from '../../src/main/features/metadata/parseAudioMetadata'
import { verifyPreservedAudioTags } from '../../src/main/features/metadata/verifyPreservedAudioTags'
import { Mpeg4File, ReadStyle, ByteVector, StringType, Mpeg4BoxType } from 'node-taglib-sharp'
import { execFileSync, spawn } from 'node:child_process'
import { readFile, writeFile, mkdir, stat, copyFile, rename, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'

const root = resolve(process.argv[2]!)
await stat(join(root, 'ISOLATED_SYNTHETIC_ONLY'))
const mpv = resolve('resources/audio/mpv.exe'),
  ffmpeg = resolve('resources/audio/ffmpeg.exe')
const quick = process.argv.includes('--quick')
const device = process.argv.includes('--device')
const controls = process.argv.includes('--controls')
const queue = process.argv.includes('--queue')
const report = {
  root,
  mode: device ? 'device' : controls ? 'controls' : queue ? 'queue' : quick ? 'quick' : 'digital',
  results: [] as unknown[],
  errors: [] as string[],
  mpvVersion: '',
  mpvSha256: '',
  writerSha256: '',
  transportSha256: '',
}
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex')
function run(exe: string, args: string[]) {
  return execFileSync(exe, args, { windowsHide: true, timeout: 30000, maxBuffer: 32 * 1024 * 1024 })
}
const common = [
  '--no-config',
  '--load-scripts=no',
  '--terminal=no',
  '--video=no',
  '--audio-display=no',
  '--gapless-audio=yes',
  '--replaygain=no',
  '--audio-format=float',
  '--volume=100',
]
const metadata = (title: string) => ({
  trackId: 1,
  title,
  artistDisplay: '测试歌手; Artist B',
  albumTitle: '隔离专辑',
  albumArtistDisplay: '测试歌手',
  genreDisplay: 'Test; Jazz',
  year: 2026,
  releaseDate: '2026-10-13',
})

function media(b: Buffer) {
  const mdats: Buffer[] = [],
    atoms: string[] = []
  for (let p = 0; p < b.length; ) {
    let size = b.readUInt32BE(p),
      header = 8
    const id = b.toString('latin1', p + 4, p + 8)
    if (size === 1) {
      size = Number(b.readBigUInt64BE(p + 8))
      header = 16
    }
    if (!size) size = b.length - p
    assert.ok(size >= header && p + size <= b.length)
    atoms.push(id)
    if (id === 'mdat') mdats.push(b.subarray(p + header, p + size))
    p += size
  }
  assert.ok(mdats.length)
  return { hash: hash(Buffer.concat(mdats)), atoms }
}

async function fixture(
  codec: string,
  rate: number,
  channels: number,
  front: boolean,
  seconds = 12,
  label = '',
) {
  const name = `${codec}-${rate}-${channels}-${front ? 'front' : 'back'}${label ? '-' + label : ''}`
  const dir = join(root, name)
  await mkdir(dir)
  const raw = join(dir, 'synthetic.s16'),
    source = join(dir, 'source.m4a')
  const pcm = Buffer.alloc(seconds * rate * channels * 2)
  let random = 923451
  const filtered = Array(channels).fill(0)
  for (let n = 0; n < seconds * rate; n++)
    for (let c = 0; c < channels; c++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0
      filtered[c] = filtered[c] * 0.75 + (random / 2 ** 32 - 0.5) * 0.25
      pcm.writeInt16LE(Math.round(filtered[c] * 26000), (n * channels + c) * 2)
    }
  await writeFile(raw, pcm)
  run(ffmpeg, [
    '-v',
    'error',
    '-nostdin',
    '-f',
    's16le',
    '-ar',
    String(rate),
    '-ac',
    String(channels),
    '-i',
    raw,
    '-c:a',
    codec,
    ...(codec === 'aac' ? ['-b:a', '192k'] : []),
    ...(front ? ['-movflags', '+faststart'] : []),
    '-metadata',
    'title=Before',
    '-metadata',
    'comment=Kept comment',
    '-metadata',
    'track=2/12',
    source,
  ])
  // Exercise artwork and vendor data through Auralis's real preservation checks.
  const file = new Mpeg4File(source, ReadStyle.None)
  try {
    file.tag.setItunesStrings('example.vendor', 'Private', 'Retained private tag')
    file.tag.setQuickTimeData(ByteVector.fromString('zzzz', StringType.Latin1), [
      ByteVector.fromString('opaque-test-data', StringType.UTF8),
    ])
    file.tag.setQuickTimeData(
      Mpeg4BoxType.COVR,
      [
        ByteVector.fromByteArray(
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=',
            'base64',
          ),
        ),
      ],
      14,
    )
    file.save()
  } finally {
    file.dispose()
  }
  const original = join(dir, 'original.m4a')
  await copyFile(source, original)
  const reference = join(dir, 'reference.f32')
  run(mpv, [
    ...common,
    '--ao=pcm',
    `--ao-pcm-file=${reference}`,
    '--ao-pcm-waveheader=no',
    `--audio-samplerate=${rate}`,
    `--audio-channels=${channels === 1 ? 'mono' : 'stereo'}`,
    source,
  ])
  return { name, dir, source, original, reference, rate, channels, seconds }
}

type Fixture = Awaited<ReturnType<typeof fixture>>
async function waitFor(test: () => boolean | Promise<boolean>, label: string, timeout = 18000) {
  const deadline = Date.now() + timeout
  while (!(await test())) {
    assert.ok(Date.now() < deadline, `Timeout: ${label}`)
    await delay(20)
  }
}

async function digital(f: Fixture) {
  const events: (MpvMessage & { at?: number })[] = [],
    errors: string[] = [],
    writes: Record<string, unknown>[] = []
  const output = join(f.dir, 'playing.f32')
  const client = await openMpvClient(
    mpv,
    (e) => events.push({ at: performance.now(), ...e }),
    (e) => errors.push(String(e)),
    new AbortController().signal,
    [
      '--ao=pcm',
      `--ao-pcm-file=${output}`,
      '--ao-pcm-waveheader=no',
      '--af=lavfi=[arealtime]',
      '--prefetch-playlist=no',
      '--cache=no',
      '--demuxer-readahead-secs=0',
      '--stream-buffer-size=4096',
      `--audio-samplerate=${f.rate}`,
      `--audio-channels=${f.channels === 1 ? 'mono' : 'stereo'}`,
      '--volume=100',
    ],
  )
  try {
    await client.command('loadfile', f.source, 'replace')
    await waitFor(() => events.some((e) => e.event === 'file-loaded'), 'loaded')
    for (let n = 1; n <= 3; n++) {
      await waitFor(
        async () => Number(await client.command('get_property', 'time-pos')) >= n * 2,
        'write position',
      )
      const beforeTime = await client.command('get_property', 'time-pos')
      const before = await stat(f.source, { bigint: true })
      const title = n === 2 ? '大标签'.repeat(44000) : `修改-${n}`
      const start = performance.now()
      const prepared = await prepareAudioTagWrite(f.source, metadata(title), ffmpeg)
      try {
        await prepared.commit()
      } finally {
        await prepared.dispose()
      }
      const after = await stat(f.source, { bigint: true })
      assert.notEqual(before.ino, after.ino, 'Published path must refer to a new file object')
      assert.equal((await parseAudioMetadata(f.source)).common.title, title)
      assert.equal(media(await readFile(f.source)).hash, media(await readFile(f.original)).hash)
      await verifyPreservedAudioTags(f.original, f.source)
      writes.push({
        n,
        beforeTime,
        afterTime: await client.command('get_property', 'time-pos'),
        milliseconds: performance.now() - start,
        oldId: String(before.ino),
        newId: String(after.ino),
        titleBytes: Buffer.byteLength(title),
      })
      console.log(`${f.name}: write ${n} succeeded`)
    }
    await waitFor(() => events.some((e) => e.event === 'end-file'), 'EOF', f.seconds * 1000 + 6000)
  } finally {
    await client.close()
  }
  await writeFile(join(f.dir, 'events.json'), JSON.stringify({ events, errors, writes }, null, 2))
  const actual = await readFile(output),
    expected = await readFile(f.reference)
  const row = {
    name: f.name,
    frames: actual.length / (4 * f.channels),
    expectedFrames: expected.length / (4 * f.channels),
    pcmExact: actual.equals(expected),
    starts: events.filter((e) => e.event === 'start-file').length,
    ends: events.filter((e) => e.event === 'end-file'),
    errors,
    writes,
    originalAtoms: media(await readFile(f.original)).atoms,
  }
  report.results.push(row)
  assert.ok(row.pcmExact, 'Live file replacement must preserve every output sample')
  assert.equal(row.starts, 1)
  assert.equal(row.ends.length, 1)
  assert.equal(row.ends[0].reason, 'eof')
  assert.deepEqual(errors, [])
}

async function deviceTest(f: Fixture, edit: boolean) {
  const events: MpvMessage[] = [],
    errors: string[] = [],
    writes: Record<string, unknown>[] = []
  const recorder = spawn(
    resolve('.electron-home/mpv-m4a-write-probe/process-loopback.exe'),
    [String(process.pid), f.dir, String(f.seconds + 2)],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let diagnostic = ''
  recorder.stdout.on('data', (v) => (diagnostic += v))
  recorder.stderr.on('data', (v) => (diagnostic += v))
  const recorded = new Promise<void>((yes, no) => {
    recorder.once('error', no)
    recorder.once('close', (code) => (code === 0 ? yes() : no(new Error(diagnostic))))
  })
  void recorded.catch(() => undefined)
  const client = await openMpvClient(
    mpv,
    (e) => events.push(e),
    (e) => errors.push(String(e)),
    new AbortController().signal,
    [
      '--ao=wasapi',
      '--prefetch-playlist=no',
      '--cache=no',
      '--demuxer-readahead-secs=0',
      '--stream-buffer-size=4096',
      '--audio-samplerate=48000',
      '--audio-channels=stereo',
      '--volume=20',
    ],
  )
  try {
    await waitFor(
      async () => !!(await stat(join(f.dir, 'capture-ready')).catch(() => false)),
      'loopback ready',
      10000,
    )
    await client.command('loadfile', f.source, 'replace')
    await waitFor(() => events.some((e) => e.event === 'file-loaded'), 'WASAPI loaded')
    if (edit)
      for (let n = 1; n <= 3; n++) {
        await waitFor(
          async () => Number(await client.command('get_property', 'time-pos')) >= n * 3,
          'WASAPI write time',
        )
        const start = performance.now(),
          beforeTime = await client.command('get_property', 'time-pos')
        const prepared = await prepareAudioTagWrite(
          f.source,
          metadata(n === 2 ? '大标签'.repeat(44000) : `声卡验证-${n}`),
          ffmpeg,
        )
        try {
          await prepared.commit()
        } finally {
          await prepared.dispose()
        }
        writes.push({
          n,
          beforeTime,
          afterTime: await client.command('get_property', 'time-pos'),
          milliseconds: performance.now() - start,
        })
        console.log(`${f.name}: WASAPI write ${n}`)
      }
    await waitFor(
      () => events.some((e) => e.event === 'end-file'),
      'WASAPI EOF',
      (f.seconds + 5) * 1000,
    )
    await recorded
    const alignment = JSON.parse(
      run('python', [
        resolve('scripts/mpv-m4a-write-probe/loopback.py'),
        f.dir,
        String(f.seconds),
      ]).toString(),
    )
    assert.equal(events.filter((e) => e.event === 'start-file').length, 1)
    assert.equal(events.filter((e) => e.event === 'end-file').length, 1)
    assert.equal(events.find((e) => e.event === 'end-file')?.reason, 'eof')
    assert.deepEqual(errors, [])
    await verifyPreservedAudioTags(f.original, f.source)
    report.results.push({
      name: f.name,
      edit,
      writes,
      alignment,
      events,
      errors,
      device: JSON.parse((await readFile(join(f.dir, 'device.json'))).toString()),
    })
    console.log(
      `${f.name}: WASAPI ${edit ? 'edited' : 'baseline'} passed; spread ${alignment.offsetSpreadFrames} frames`,
    )
  } finally {
    await client.close()
    if (recorder.exitCode === null) recorder.kill()
  }
}

function handleProbe(path: string) {
  return JSON.parse(
    run('python', [resolve('scripts/mpv-m4a-write-probe/handle.py'), 'probe', path]).toString(),
  )
}
async function controlsTest(f: Fixture) {
  const events: MpvMessage[] = [],
    errors: string[] = [],
    steps: Record<string, unknown>[] = []
  const client = await openMpvClient(
    mpv,
    (e) => events.push(e),
    (e) => errors.push(String(e)),
    new AbortController().signal,
    [
      '--ao=wasapi',
      '--volume=0',
      '--pause=yes',
      '--prefetch-playlist=no',
      '--cache=no',
      '--demuxer-readahead-secs=0',
      '--stream-buffer-size=4096',
    ],
  )
  const backup = join(f.dir, 'retained-old.m4a')
  try {
    await client.command('loadfile', f.source, 'replace')
    await waitFor(() => events.some((e) => e.event === 'file-loaded'), 'control loaded')
    const oldId = String((await stat(f.source, { bigint: true })).ino)
    const prepared = await prepareAudioTagWrite(f.source, metadata('已发布的新版本'), ffmpeg)
    try {
      await prepared.assertUnchanged()
      await rename(f.source, backup)
      assert.equal(
        await stat(f.source).then(
          () => true,
          () => false,
        ),
        false,
      )
      const oldHandle = handleProbe(backup)
      assert.equal(oldHandle.winError, 32, 'mpv must still have the old file open')
      // Seek beyond the demux and stream caches while no file exists at its URL.
      await client.command('seek', 9.25, 'absolute+exact')
      await waitFor(
        async () => (await client.command('get_property', 'seeking')) === false,
        'seek without path',
      )
      const seekTime = Number(await client.command('get_property', 'time-pos'))
      assert.ok(Math.abs(seekTime - 9.25) < 0.01, `seek time ${seekTime}`)
      await rename(prepared.stagingPath, f.source)
      const newId = String((await stat(f.source, { bigint: true })).ino)
      assert.notEqual(oldId, newId)
      assert.equal(handleProbe(f.source).opened, true, 'new version is independently accessible')
      steps.push({ action: 'seek-while-original-path-absent', oldId, newId, oldHandle, seekTime })
    } finally {
      await prepared.dispose()
    }
    for (let n = 0; n < 3; n++) {
      const pos = Number(await client.command('get_property', 'time-pos'))
      const p = await prepareAudioTagWrite(f.source, metadata(`暂停时保存-${n}`), ffmpeg)
      try {
        await p.commit()
      } finally {
        await p.dispose()
      }
      assert.equal(await client.command('get_property', 'pause'), true)
      assert.ok(
        Math.abs(Number(await client.command('get_property', 'time-pos')) - pos) < 1 / f.rate,
      )
    }
    const cachedTitle = await client.command('get_property', 'metadata/by-key/title')
    assert.equal(cachedTitle, 'Before')
    assert.equal((await parseAudioMetadata(f.source)).common.title, '暂停时保存-2')
    steps.push({
      action: 'repeated-paused-saves',
      count: 3,
      cachedTitle,
      diskTitle: '暂停时保存-2',
    })

    // Inject publication failure after the first rename in an experimental
    // retained-backup transaction, then restore before resuming.
    const beforeRollback = hash(await readFile(f.source))
    const p = await prepareAudioTagWrite(f.source, metadata('不得发布'), ffmpeg)
    const rollback = join(f.dir, 'rollback-backup.m4a')
    try {
      await p.assertUnchanged()
      await rename(f.source, rollback)
      try {
        throw new Error('injected publication failure')
      } catch {
        await rename(rollback, f.source)
      }
    } finally {
      await p.dispose()
    }
    assert.equal(hash(await readFile(f.source)), beforeRollback)
    steps.push({ action: 'rollback-after-first-rename', originalBytesRestored: true })

    const blocker = spawn(
      'python',
      [resolve('scripts/mpv-m4a-write-probe/handle.py'), 'hold', f.source],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let ready = ''
    blocker.stdout.on('data', (b) => (ready += b))
    try {
      await waitFor(() => ready.includes('\n'), 'blocking reader')
      assert.equal(JSON.parse(ready).opened, true)
      const before = hash(await readFile(f.source))
      const blocked = await prepareAudioTagWrite(f.source, metadata('被阻止的保存'), ffmpeg)
      let failure = ''
      try {
        await blocked.commit()
      } catch (e) {
        failure = String(e)
      } finally {
        await blocked.dispose()
      }
      assert.ok(
        failure.includes('EPERM') || failure.includes('EACCES') || failure.includes('EBUSY'),
        failure,
      )
      assert.equal(hash(await readFile(f.source)), before)
      steps.push({ action: 'reader-denies-delete', failure, originalBytesRetained: true })
    } finally {
      blocker.stdin.end('\n')
      await new Promise<void>((yes) => blocker.once('close', () => yes()))
    }

    // Delete-pending old handles must remain seekable until mpv closes them.
    await rm(backup)
    await client.command('seek', 1.375, 'absolute+exact')
    await waitFor(
      async () => (await client.command('get_property', 'seeking')) === false,
      'seek after deleting old name',
    )
    assert.ok(Math.abs(Number(await client.command('get_property', 'time-pos')) - 1.375) < 0.01)
    await client.command('set_property', 'pause', false)
    await delay(500)
    assert.ok(Number(await client.command('get_property', 'time-pos')) > 1.6)
    await client.command('set_property', 'pause', true)
    steps.push({ action: 'seek-after-old-backup-unlinked-and-resume', succeeded: true })
    assert.equal(events.filter((e) => e.event === 'start-file').length, 1)
    assert.equal(events.filter((e) => e.event === 'end-file').length, 0)

    await client.command('loadfile', f.source, 'replace')
    await waitFor(
      () => events.filter((e) => e.event === 'file-loaded').length === 2,
      'reload published version',
    )
    assert.equal(await client.command('get_property', 'metadata/by-key/title'), '暂停时保存-2')
    steps.push({ action: 'subsequent-load-sees-latest-tags', succeeded: true })
    assert.deepEqual(errors, [])
    await verifyPreservedAudioTags(f.original, f.source)
    report.results.push({ name: f.name, steps, errors })
    console.log(`${f.name}: control, sharing and rollback checks passed`)
  } finally {
    await client.close()
    await writeFile(
      join(f.dir, 'control-events.json'),
      JSON.stringify({ events, errors, steps }, null, 2),
    )
  }
}

async function queueTest(codec: string) {
  const current = await fixture(codec, 48000, 2, true, 12, 'current')
  const next = await fixture(codec, 48000, 2, true, 8, 'next')
  const events: MpvMessage[] = [],
    errors: string[] = [],
    writes: Record<string, unknown>[] = []
  const output = join(current.dir, 'queue.f32')
  const baselineOutput = join(current.dir, 'queue-baseline.f32')
  const baselineEvents: MpvMessage[] = [],
    baselineErrors: string[] = []
  const baseline = await openMpvClient(
    mpv,
    (e) => baselineEvents.push(e),
    (e) => baselineErrors.push(String(e)),
    new AbortController().signal,
    [
      '--ao=pcm',
      `--ao-pcm-file=${baselineOutput}`,
      '--ao-pcm-waveheader=no',
      '--volume=100',
      '--audio-samplerate=48000',
      '--audio-channels=stereo',
      '--af=lavfi=[arealtime]',
      '--prefetch-playlist=yes',
      '--cache=yes',
      '--demuxer-readahead-secs=30',
    ],
  )
  try {
    await baseline.command('loadfile', current.source, 'replace')
    await waitFor(
      () => baselineEvents.some((e) => e.event === 'file-loaded'),
      'baseline queue loaded',
    )
    await baseline.command('loadfile', next.source, 'append')
    await waitFor(
      () => baselineEvents.filter((e) => e.event === 'end-file' && e.reason === 'eof').length === 2,
      'baseline natural EOF',
      30000,
    )
    assert.deepEqual(baselineErrors, [])
  } finally {
    await baseline.close()
  }
  console.log(`${codec}: unedited queue baseline captured`)
  const client = await openMpvClient(
    mpv,
    (e) => events.push(e),
    (e) => errors.push(String(e)),
    new AbortController().signal,
    [
      '--ao=pcm',
      `--ao-pcm-file=${output}`,
      '--ao-pcm-waveheader=no',
      '--volume=100',
      '--audio-samplerate=48000',
      '--audio-channels=stereo',
      '--af=lavfi=[arealtime]',
      '--prefetch-playlist=yes',
      '--cache=yes',
      '--demuxer-readahead-secs=30',
    ],
  )
  try {
    await client.command('loadfile', current.source, 'replace')
    await waitFor(() => events.some((e) => e.event === 'file-loaded'), 'queue loaded')
    await client.command('loadfile', next.source, 'append')
    await waitFor(
      () => handleProbe(next.source).winError === 32,
      'next file is actually held open',
      9000,
    )
    assert.equal(await client.command('get_property', 'path'), current.source)
    const preloadedAt = await client.command('get_property', 'time-pos')
    for (const [f, title] of [
      [current, '播放中修改当前曲'],
      [next, '预读时修改下一首'],
      [next, '大标签'.repeat(44000)],
    ] as const) {
      const beforeId = String((await stat(f.source, { bigint: true })).ino)
      const prepared = await prepareAudioTagWrite(f.source, metadata(title), ffmpeg)
      try {
        await prepared.commit()
      } finally {
        await prepared.dispose()
      }
      const afterId = String((await stat(f.source, { bigint: true })).ino)
      assert.notEqual(beforeId, afterId)
      assert.equal((await parseAudioMetadata(f.source)).common.title, title)
      await verifyPreservedAudioTags(f.original, f.source)
      writes.push({ path: f.source, titleBytes: Buffer.byteLength(title), beforeId, afterId })
    }
    await waitFor(
      () => events.filter((e) => e.event === 'end-file' && e.reason === 'eof').length === 2,
      'both natural EOF',
      30000,
    )
    const row = {
      codec,
      preloadedAt,
      writes,
      errors,
      starts: events.filter((e) => e.event === 'start-file').length,
      ends: events.filter((e) => e.event === 'end-file'),
      pcmExact: false,
      baselineVsStandaloneConcatExact: false,
      editedVsStandaloneConcatExact: false,
    }
    await client.close()
    const actual = await readFile(output),
      expected = await readFile(baselineOutput)
    const concatenated = Buffer.concat([
      await readFile(current.reference),
      await readFile(next.reference),
    ])
    row.pcmExact = actual.equals(expected)
    row.baselineVsStandaloneConcatExact = expected.equals(concatenated)
    row.editedVsStandaloneConcatExact = actual.equals(concatenated)
    assert.ok(row.pcmExact, 'Metadata saves must preserve the actual unedited queue output')
    assert.equal(row.starts, 2)
    assert.equal(row.ends.length, 2)
    assert.deepEqual(errors, [])
    report.results.push(row)
    console.log(`${codec}: preloaded-next replacement and natural transition passed`)
  } finally {
    await client.close()
    await writeFile(
      join(current.dir, 'queue-events.json'),
      JSON.stringify({ events, errors, writes }, null, 2),
    )
  }
}

report.mpvVersion = run(mpv, ['--version']).toString()
report.mpvSha256 = hash(await readFile(mpv))
report.writerSha256 = hash(
  await readFile(resolve('src/main/features/metadata/audioTagWriteService.ts')),
)
report.transportSha256 = hash(await readFile(resolve('src/main/features/audio/mpvClient.ts')))
try {
  if (device) {
    for (const codec of ['aac', 'alac'])
      for (const edit of [false, true]) {
        const f = await fixture(codec, 48000, 2, true, 18, edit ? 'edited' : 'baseline')
        await deviceTest(f, edit)
      }
  } else if (controls) {
    for (const codec of ['aac', 'alac'])
      await controlsTest(await fixture(codec, 48000, 2, true, 16))
  } else if (queue) {
    for (const codec of ['aac', 'alac']) await queueTest(codec)
  } else {
    const formats = quick
      ? [['aac', 48000, 2, true]]
      : [
          ['aac', 48000, 2, false],
          ['aac', 48000, 2, true],
          ['aac', 44100, 1, false],
          ['aac', 44100, 1, true],
          ['alac', 48000, 2, false],
          ['alac', 48000, 2, true],
          ['alac', 96000, 2, false],
          ['alac', 96000, 2, true],
        ]
    for (const [codec, rate, channels, front] of formats)
      await digital(
        await fixture(codec as string, rate as number, channels as number, front as boolean),
      )
  }
} catch (error) {
  report.errors.push(String(error))
  process.exitCode = 1
}
await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
