import { createReadStream } from 'node:fs'
import {
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { isDeepStrictEqual } from 'node:util'
import { parseFile } from 'music-metadata'
import taglib from 'node-taglib-sharp'
import sharp from 'sharp'

const SUPPORTED = new Set(['.mp3', '.flac', '.m4a'])
const OTHER_AUDIO = new Set([
  '.aac',
  '.aif',
  '.aiff',
  '.alac',
  '.ape',
  '.dsf',
  '.dff',
  '.m4b',
  '.m4p',
  '.mp4',
  '.mka',
  '.mp1',
  '.mp2',
  '.mpc',
  '.ogg',
  '.oga',
  '.opus',
  '.wav',
  '.wave',
  '.wma',
  '.wv',
  '.tta',
  '.tak',
])
const BACKUPS = '.auralis-cover-backups'
const LOCK = '.auralis-cover.lock'
const WORK = '.auralis-cover-work-'
const DEFAULT_FFMPEG = fileURLToPath(new URL('../resources/audio/ffmpeg.exe', import.meta.url))
const digest = (data) => createHash('sha256').update(data).digest('hex')

async function fileHash(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function fingerprint(path) {
  const stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
    throw new Error(`拒绝链接或非普通文件：${path}`)
  return { size: stat.size, mtimeMs: stat.mtimeMs, hash: await fileHash(path) }
}

async function assertUnchanged(path, expected) {
  if (!isDeepStrictEqual(await fingerprint(path), expected))
    throw new Error(`文件在处理期间发生变化：${path}`)
}

async function directoryNames(directory) {
  return (await readdir(directory))
    .filter((name) => ![BACKUPS, LOCK].includes(name.toLowerCase()))
    .sort()
}

async function scan(directory, plans) {
  const entries = await readdir(directory, { withFileTypes: true })
  if (entries.some((entry) => entry.name.toLowerCase().startsWith(WORK)))
    throw new Error(`发现未完成的暂存文件，请先恢复：${directory}`)
  const covers = entries.filter((entry) => entry.name.toLowerCase() === 'cover.jpg')
  if (covers.length) {
    const plan = { directory, cover: join(directory, covers[0].name), tracks: [], blockers: [] }
    plans.push(plan)
    if (covers.length !== 1) plan.blockers.push('存在多个大小写不同的 cover.jpg')
    try {
      plan.coverFingerprint = await fingerprint(plan.cover)
      const image = await readFile(plan.cover)
      const info = await sharp(image, {
        failOn: 'error',
        limitInputPixels: 40_000_000,
      }).metadata()
      if (info.format !== 'jpeg') throw new Error('cover.jpg 的实际格式不是 JPEG')
      // metadata() only reads the header; force a complete image decode.
      await sharp(image, { failOn: 'error', limitInputPixels: 40_000_000 }).raw().toBuffer()
    } catch (error) {
      plan.blockers.push(error.message)
    }
    for (const entry of entries) {
      const extension = extname(entry.name).toLowerCase()
      if (OTHER_AUDIO.has(extension)) plan.blockers.push(`未支持的音频：${entry.name}`)
      if (!SUPPORTED.has(extension)) continue
      const track = { path: join(directory, entry.name), action: 'blocked' }
      plan.tracks.push(track)
      try {
        track.original = await fingerprint(track.path)
        track.before = snapshotMetadata(
          await parseFile(track.path, { skipCovers: false, duration: true }),
        )
        const pictures = track.before.pictures
        if (pictures[0]?.hash === plan.coverFingerprint?.hash) {
          track.action = 'verify'
        } else if (pictures.length) {
          throw new Error('已有不同的内嵌封面，需人工处理')
        } else {
          track.action = 'embed'
        }
      } catch (error) {
        plan.blockers.push(`${entry.name}：${error.message}`)
      }
    }
    if (!plan.tracks.length) plan.blockers.push('目录中没有支持的歌曲')
    plan.names = await directoryNames(directory)
  }
  for (const entry of entries) {
    if (entry.name.toLowerCase() === BACKUPS) continue
    // Never traverse junctions/symlinks, even when the target is inside the root.
    if (entry.isDirectory() && !entry.isSymbolicLink())
      await scan(join(directory, entry.name), plans)
  }
}

function nativeCounts(metadata) {
  const counts = new Map()
  const pictureIds = new Set([
    'APIC',
    'PIC',
    'COVR',
    'METADATA_BLOCK_PICTURE',
    'COVERART',
    'COVERARTMIME',
  ])
  for (const [type, tags] of Object.entries(metadata.native)) {
    for (const tag of tags) {
      if (pictureIds.has(tag.id.toUpperCase())) continue
      const key = JSON.stringify([type, tag.id, tag.value])
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

// Keep hashes instead of every embedded image's bytes throughout a large scan.
function snapshotMetadata(metadata) {
  const { picture = [], ...common } = metadata.common
  return {
    common,
    pictures: picture.map(({ data, ...properties }) => ({ ...properties, hash: digest(data) })),
    native: nativeCounts(metadata),
    format: metadata.format,
  }
}

function verifyTags(before, after, image) {
  after = snapshotMetadata(after)
  const previous = before.pictures,
    actual = after.pictures
  const beforeCommon = before.common,
    afterCommon = after.common
  if (!isDeepStrictEqual(beforeCommon, afterCommon)) {
    const changed = [
      ...new Set([...Object.keys(beforeCommon), ...Object.keys(afterCommon)]),
    ].filter((key) => !isDeepStrictEqual(beforeCommon[key], afterCommon[key]))
    throw new Error(`非封面公共标签发生变化：${changed.join(', ')}`)
  }
  const afterCounts = after.native
  for (const [key, count] of before.native) {
    if ((afterCounts.get(key) ?? 0) < count) throw new Error('原生标签丢失或变化')
  }
  const remaining = [...actual]
  for (const picture of previous) {
    const index = remaining.findIndex((candidate) => isDeepStrictEqual(candidate, picture))
    if (index < 0) throw new Error('原有内嵌图片发生变化')
    remaining.splice(index, 1)
  }
  // Auralis displays the first embedded image; require that image to be the cover.
  if (!actual[0] || actual[0].hash !== digest(image) || actual[0].format !== 'image/jpeg')
    throw new Error('内嵌首图与 cover.jpg 不一致')
  if (!previous.length && actual[0].type && actual[0].type !== 'Cover (front)')
    throw new Error('新增图片不是正面封面')
  for (const key of [
    'codec',
    'sampleRate',
    'numberOfChannels',
    'bitsPerSample',
    'numberOfSamples',
  ]) {
    if (before.format[key] !== after.format[key]) throw new Error(`音频属性发生变化：${key}`)
  }
  if (Math.abs((before.format.duration ?? 0) - (after.format.duration ?? 0)) > 0.001)
    throw new Error('音频时长发生变化')
}

async function decodedHash(path, ffmpeg) {
  return new Promise((accept, reject) => {
    const child = spawn(
      ffmpeg,
      [
        '-v',
        'error',
        '-xerror',
        '-nostdin',
        '-i',
        path,
        '-map',
        '0:a',
        '-vn',
        '-c:a',
        'pcm_f64le',
        '-f',
        'hash',
        '-hash',
        'sha256',
        '-',
      ],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let output = '',
      errors = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      errors = (errors + chunk).slice(-4000)
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code !== 0 || errors.trim() || !/^SHA256=[a-f0-9]{64}\s*$/.test(output))
        reject(new Error(`音频解码验证失败：${errors.trim() || `FFmpeg exit ${code}`}`))
      else accept(output.trim())
    })
  })
}

async function verifyTrack(track, path, image, ffmpeg, expectedAudioHash) {
  verifyTags(track.before, await parseFile(path, { skipCovers: false, duration: true }), image)
  if ((await decodedHash(path, ffmpeg)) !== expectedAudioHash)
    throw new Error('完整音频解码哈希发生变化')
}

async function embedTrack(track, plan, context) {
  const { root, backupDirectory, ffmpeg, log, image } = context
  await assertUnchanged(track.path, track.original)
  const audioHash = await decodedHash(track.path, ffmpeg)
  if (track.action === 'verify') {
    await verifyTrack(track, track.path, image, ffmpeg, audioHash)
    await assertUnchanged(track.path, track.original)
    track.final = track.original
    await log({ event: 'verified-existing', path: track.path })
    return
  }
  const staging = join(dirname(track.path), `${WORK}${randomUUID()}${extname(track.path)}`)
  const backup = join(backupDirectory, 'audio', relative(root, track.path))
  let originalMoved = false
  let replacementInstalled = false
  let stagedFingerprint
  try {
    await copyFile(track.path, staging, constants.COPYFILE_EXCL)
    let file
    const defaultMpegTags = taglib.MpegAudioFileSettings.defaultTagTypes
    try {
      // Avoid the library creating a new ID3v1 block (including an empty year).
      taglib.MpegAudioFileSettings.defaultTagTypes = taglib.TagTypes.Id3v2
      file = taglib.File.createFromPath(staging)
      if (!file.isWritable) throw new Error('音频文件不可安全写入')
      const target =
        extname(track.path).toLowerCase() === '.mp3'
          ? file.getTag(taglib.TagTypes.Id3v2, true)
          : file.tag
      target.pictures = [
        taglib.Picture.fromFullData(
          taglib.ByteVector.fromByteArray(image),
          taglib.PictureType.FrontCover,
          'image/jpeg',
          'Front cover',
        ),
      ]
      file.save()
    } finally {
      file?.dispose()
      taglib.MpegAudioFileSettings.defaultTagTypes = defaultMpegTags
    }
    await verifyTrack(track, staging, image, ffmpeg, audioHash)
    stagedFingerprint = await fingerprint(staging)
    await assertUnchanged(track.path, track.original)
    await assertUnchanged(plan.cover, plan.coverFingerprint)
    await mkdir(dirname(backup), { recursive: true })
    await log({
      event: 'replace-intent',
      path: track.path,
      staging,
      backup,
      original: track.original,
    })
    await rename(track.path, backup)
    originalMoved = true
    await assertUnchanged(backup, track.original)
    // Refuse to overwrite a concurrently created file at the original path.
    await link(staging, track.path)
    replacementInstalled = true
    await rm(staging)
    await verifyTrack(track, track.path, image, ffmpeg, audioHash)
    track.final = await fingerprint(track.path)
    await log({ event: 'verified-replacement', path: track.path, backup, final: track.final })
  } catch (error) {
    if (originalMoved) {
      // Keep the backup intact. Never replace a concurrently created file.
      try {
        if (replacementInstalled) {
          await rm(staging, { force: true })
          await assertUnchanged(track.path, stagedFingerprint)
          await rm(track.path)
        }
        await copyFile(backup, track.path, constants.COPYFILE_EXCL)
        await log({ event: 'restored', path: track.path, backup })
      } catch (restoreError) {
        throw Object.assign(
          new Error(
            `${error.message}；自动恢复未完成：${restoreError.message}。原文件备份：${backup}`,
          ),
          { recoveryRequired: true },
        )
      }
    }
    throw error
  } finally {
    await rm(staging, { force: true })
  }
}

/** Default is read-only. Importable so isolated tests exercise the actual entry. */
export async function run(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      root: { type: 'string' },
      apply: { type: 'boolean' },
      clean: { type: 'boolean' },
      ffmpeg: { type: 'string', default: DEFAULT_FFMPEG },
      help: { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log(
      '用法：node scripts/embed-directory-covers.mjs --root <目录> [--apply [--clean]] [--ffmpeg <路径>]\n默认只预览；--clean 将验证成功的 cover.jpg 移入备份目录，原音频也保留备份。',
    )
    return { plans: 0, tracks: 0, cleaned: 0 }
  }
  if (!values.root) throw new Error('必须显式指定 --root')
  if (values.clean && !values.apply) throw new Error('--clean 必须与 --apply 一起使用')
  const root = await realpath(resolve(values.root))
  if (!(await lstat(root)).isDirectory()) throw new Error('--root 必须为目录')
  const lockPath = join(root, LOCK)
  const lockExists = await lstat(lockPath).then(
    () => true,
    (error) => {
      if (error.code === 'ENOENT') return false
      throw error
    },
  )
  if (lockExists) throw new Error('发现运行锁；请检查未完成操作和备份后再手动解除')
  let lock,
    journal,
    recoveryRequired = false
  const plans = []
  let cleaned = 0
  try {
    if (values.apply) {
      lock = await open(lockPath, 'wx')
      await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }))
      await lock.sync()
    }
    await scan(root, plans)
    for (const plan of plans) {
      console.log(plan.directory)
      for (const track of plan.tracks) console.log(`  ${track.action} ${track.path}`)
      for (const blocker of plan.blockers) console.log(`  阻止执行：${blocker}`)
    }
    const summary = {
      plans: plans.length,
      tracks: plans.reduce((sum, plan) => sum + plan.tracks.length, 0),
      cleaned: 0,
    }
    if (!values.apply) {
      console.log(`预览：${summary.plans} 个封面目录，${summary.tracks} 首歌曲；未修改任何文件。`)
      return summary
    }
    if (plans.some((plan) => plan.blockers.length))
      throw new Error('预检未通过，未写入歌曲或清理封面')
    if (!plans.length) return summary
    // Validate the runtime before creating backups or writing any audio.
    await decodedHash(plans[0].tracks[0].path, values.ffmpeg)
    const backupRoot = join(root, BACKUPS)
    await mkdir(backupRoot, { recursive: true })
    if ((await lstat(backupRoot)).isSymbolicLink()) throw new Error('备份目录不能是链接')
    const backupDirectory = join(backupRoot, randomUUID())
    await mkdir(backupDirectory)
    console.log(`备份与日志：${backupDirectory}`)
    journal = await open(join(backupDirectory, 'journal.jsonl'), 'wx')
    const log = async (entry) => {
      await journal.writeFile(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`)
      await journal.sync()
    }
    await log({ event: 'start', root, clean: !!values.clean })
    for (const plan of plans) {
      await assertUnchanged(plan.cover, plan.coverFingerprint)
      const image = await readFile(plan.cover)
      if (digest(image) !== plan.coverFingerprint.hash)
        throw new Error(`封面在读取期间发生变化：${plan.cover}`)
      for (const track of plan.tracks) {
        try {
          await embedTrack(track, plan, {
            root,
            backupDirectory,
            ffmpeg: values.ffmpeg,
            log,
            image,
          })
          console.log(`验证通过：${track.path}`)
        } catch (error) {
          error.message = `${track.path}：${error.message}`
          throw error
        }
      }
    }
    // Global barrier: no cover is moved until ALL directories have passed.
    for (const plan of plans) {
      if (!isDeepStrictEqual(await directoryNames(plan.directory), plan.names))
        throw new Error(`目录清单发生变化：${plan.directory}`)
      await assertUnchanged(plan.cover, plan.coverFingerprint)
      for (const track of plan.tracks) await assertUnchanged(track.path, track.final)
    }
    if (values.clean) {
      for (const plan of plans) {
        // Recheck immediately before each move as cleanup may take time.
        if (!isDeepStrictEqual(await directoryNames(plan.directory), plan.names))
          throw new Error(`目录清单发生变化：${plan.directory}`)
        for (const track of plan.tracks) await assertUnchanged(track.path, track.final)
        await assertUnchanged(plan.cover, plan.coverFingerprint)
        const backup = join(backupDirectory, 'covers', relative(root, plan.cover))
        await mkdir(dirname(backup), { recursive: true })
        await log({
          event: 'cover-move-intent',
          path: plan.cover,
          backup,
          original: plan.coverFingerprint,
        })
        await rename(plan.cover, backup)
        cleaned++
        await log({ event: 'cover-moved', path: plan.cover, backup })
      }
    }
    await log({ event: 'complete', cleaned })
    console.log(`完成：${summary.tracks} 首歌曲验证成功，${cleaned} 张外部封面移入备份。`)
    return { ...summary, cleaned, backupDirectory }
  } catch (error) {
    recoveryRequired = !!error.recoveryRequired
    if (journal) {
      await journal.writeFile(
        `${JSON.stringify({ event: 'failed', message: error.message, recoveryRequired })}\n`,
      )
      await journal.sync()
    }
    throw error
  } finally {
    await journal?.close()
    await lock?.close()
    if (lock && !recoveryRequired) await rm(lockPath)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
