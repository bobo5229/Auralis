import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { parseFile } from 'music-metadata'
import sharp from 'sharp'
import taglib from 'node-taglib-sharp'
import { run } from './embed-directory-covers.mjs'

const ffmpeg = fileURLToPath(new URL('../resources/audio/ffmpeg.exe', import.meta.url))

test('隔离真实格式：只读预览、三格式写入、重复执行与全局清理门槛', async () => {
  const root = await mkdtemp(join(tmpdir(), 'auralis-cover-test-'))
  console.log(`隔离样本：${root}`)
  try {
    const image = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#346789' },
    })
      .jpeg()
      .toBuffer()
    const samples = []
    for (const [extension, codec] of [
      ['mp3', 'libmp3lame'],
      ['flac', 'flac'],
      ['m4a', 'aac'],
    ]) {
      const directory = extension === 'm4a' ? root : join(root, extension)
      if (directory !== root) await mkdir(directory)
      const path = join(directory, `sample.${extension}`)
      execFileSync(
        ffmpeg,
        [
          '-v',
          'error',
          '-nostdin',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=0.3',
          '-c:a',
          codec,
          '-metadata',
          'title=隔离测试',
          '-metadata',
          'artist=Artist A; Artist B',
          '-metadata',
          'album=Album',
          '-metadata',
          'comment=Keep this comment',
          '-metadata',
          'lyrics=Keep these lyrics',
          '-metadata',
          'TEST_PRIVATE=keep-private',
          '-metadata',
          'replaygain_track_gain=-3.25 dB',
          path,
        ],
        { windowsHide: true },
      )
      if (extension === 'm4a') {
        const file = taglib.File.createFromPath(path)
        try {
          file.tag.setItunesStrings('com.apple.iTunes', 'TEST_PRIVATE', ['keep-private'])
          file.save()
        } finally {
          file.dispose()
        }
      }
      await writeFile(join(directory, 'cover.jpg'), image)
      samples.push({ directory, path, bytes: await readFile(path) })
    }
    const originalNames = await readdir(root)
    const preview = await run(['--root', root])
    assert.equal(preview.tracks, 3)
    assert.deepEqual(await readdir(root), originalNames)
    for (const sample of samples) assert.deepEqual(await readFile(sample.path), sample.bytes)

    const embedded = await run(['--root', root, '--apply'])
    assert.equal(embedded.cleaned, 0)
    for (const sample of samples) {
      const metadata = await parseFile(sample.path)
      assert.deepEqual(Buffer.from(metadata.common.picture[0].data), image)
      assert.equal(metadata.common.title, '隔离测试')
      assert.deepEqual(await readFile(join(sample.directory, 'cover.jpg')), image)
      assert.deepEqual(
        await readFile(join(embedded.backupDirectory, 'audio', relative(root, sample.path))),
        sample.bytes,
      )
      sample.embedded = await readFile(sample.path)
    }

    // A blocker in one directory must prevent cleanup everywhere, even when
    // the other directories already have matching embedded covers.
    const unsupported = join(samples[0].directory, 'unsupported.wav')
    await writeFile(unsupported, 'not a supported audio file')
    await assert.rejects(run(['--root', root, '--apply', '--clean']), /预检未通过/)
    for (const sample of samples)
      assert.deepEqual(await readFile(join(sample.directory, 'cover.jpg')), image)
    await rm(unsupported)

    const different = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#ab1234' },
    })
      .jpeg()
      .toBuffer()
    await writeFile(join(samples[1].directory, 'cover.jpg'), different)
    await assert.rejects(run(['--root', root, '--apply', '--clean']), /预检未通过/)
    for (const sample of samples) assert.deepEqual(await readFile(sample.path), sample.embedded)
    await writeFile(join(samples[1].directory, 'cover.jpg'), image)

    // mdta is a real unsupported M4A layout in the current writer. A successful
    // tag parse alone must not permit installing an undecodable replacement.
    const mdtaDirectory = join(root, 'mdta')
    await mkdir(mdtaDirectory)
    const mdtaPath = join(mdtaDirectory, 'mdta.m4a')
    execFileSync(
      ffmpeg,
      [
        '-v',
        'error',
        '-nostdin',
        '-f',
        'lavfi',
        '-i',
        'sine=duration=0.2',
        '-c:a',
        'aac',
        '-metadata',
        'title=mdta',
        '-movflags',
        'use_metadata_tags',
        mdtaPath,
      ],
      { windowsHide: true },
    )
    await writeFile(join(mdtaDirectory, 'cover.jpg'), image)
    const mdtaOriginal = await readFile(mdtaPath)
    await assert.rejects(run(['--root', root, '--apply', '--clean']), /音频解码验证失败/)
    assert.deepEqual(await readFile(mdtaPath), mdtaOriginal)
    for (const sample of samples)
      assert.deepEqual(await readFile(join(sample.directory, 'cover.jpg')), image)
    assert.deepEqual((await readdir(mdtaDirectory)).sort(), ['cover.jpg', 'mdta.m4a'])
    await rm(mdtaDirectory, { recursive: true })

    // Exercise a failure after preflight using an invalid decoder executable.
    await assert.rejects(
      run(['--root', root, '--apply', '--clean', '--ffmpeg', join(root, 'missing-ffmpeg.exe')]),
      /ENOENT/,
    )
    for (const sample of samples)
      assert.deepEqual(await readFile(join(sample.directory, 'cover.jpg')), image)

    const cleaned = await run(['--root', root, '--apply', '--clean'])
    assert.equal(cleaned.cleaned, 3)
    for (const sample of samples) {
      assert.deepEqual(await readFile(sample.path), sample.embedded)
      await assert.rejects(readFile(join(sample.directory, 'cover.jpg')), { code: 'ENOENT' })
      assert.deepEqual(
        await readFile(
          join(
            cleaned.backupDirectory,
            'covers',
            relative(root, join(sample.directory, 'cover.jpg')),
          ),
        ),
        image,
      )
    }
    const journal = await readFile(join(cleaned.backupDirectory, 'journal.jsonl'), 'utf8')
    assert.equal(
      journal
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
        .at(-1).event,
      'complete',
    )
    assert.equal((await run(['--root', root, '--apply', '--clean'])).plans, 0)
  } finally {
    // root was created by mkdtemp in this test, never supplied by the user.
    await rm(root, { recursive: true, force: true })
  }
})
