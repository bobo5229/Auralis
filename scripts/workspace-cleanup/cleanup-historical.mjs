#!/usr/bin/env node
// Preview: node scripts/workspace-cleanup/cleanup-historical.mjs
// Execute: node scripts/workspace-cleanup/cleanup-historical.mjs --execute <plan-id>
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// Exact, previously identified validation outputs. No wildcards or user-supplied paths.
const candidates = [
  ['.cache/full-regression-20261027/head-baseline/src', '历史测试基线源码副本'],
  ['.cache/full-regression-20261027/head-baseline/scripts', '历史测试基线脚本副本'],
  ['.electron-home/architecture-7-11-validation/checkout/out', '隔离工程构建输出'],
  ['output/lyrics-editor-validation-runtime/node_modules', '隔离验证重复依赖'],
  ['output/metadata-commit-check', '历史元数据验证工程副本'],
  ['output/metadata-commit-final', '历史元数据验证工程副本'],
  ...[
    'delivered-all',
    'stable-all',
    'verified-all',
    'release-all',
    'final-all',
    'before-all',
    'after-all',
    'controls',
    'interaction',
  ].map((name) => [
    `.electron-home/fullscreen-player-optimization-2026-10-06/${name}.trace.json`,
    '历史性能验证原始 trace（保留汇总与截图）',
  ]),
  ...[
    'after-visible',
    'baseline-visible',
    'baseline-lighttrace',
    'after-lighttrace',
    'clip-fixed',
    'snapshot-trim',
  ].map((name) => [
    `.electron-home/album-lyrics-collapse-performance-2026-10-02/${name}.trace.json`,
    '历史性能验证原始 trace（保留汇总与截图）',
  ]),
]
const args = process.argv.slice(2)
if (
  args.length &&
  !(args.length === 2 && args[0] === '--execute' && /^[a-f0-9]{64}$/.test(args[1]))
) {
  console.error(
    'Usage: node scripts/workspace-cleanup/cleanup-historical.mjs [--execute <plan-id>]',
  )
  process.exit(2)
}

// Include both index and HEAD, including staged additions and staged removals.
function trackedFiles() {
  const git = (...args) =>
    execFileSync('git', ['-C', root, ...args], { maxBuffer: 64 * 1024 * 1024 })
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .map((p) => p.toLowerCase())
  const tracked = git('ls-files', '-z')
  const headExists = execFileSync('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], {
    encoding: 'utf8',
  })
  if (headExists.trim()) tracked.push(...git('ls-tree', '-r', '--name-only', '-z', 'HEAD'))
  return tracked
}

const protectedName = /^(?:data|user-data|backups?|\.git)$|备份/i
const protectedExtension =
  /\.(?:db(?:-wal|-shm|-journal)?|sqlite\w*|bak|backup|mp3|m4a|flac|wav|ogg|opus|aac|aiff?|wma|ape|alac|dsf|dff|wv|mp4|mka)$/i

function inspect(relative, tracked) {
  const full = path.resolve(root, relative)
  if (!full.startsWith(root + path.sep)) throw new Error('目标越过工作区')
  const canonical = relative.replaceAll('\\', '/').toLowerCase()
  if (tracked.some((p) => p === canonical || p.startsWith(canonical + '/')))
    throw new Error('包含 Git 跟踪文件')
  // Check all ancestors as well as descendants; never traverse a junction or symlink.
  let current = root
  for (const part of relative.split('/')) {
    current = path.join(current, part)
    if (lstatSync(current).isSymbolicLink()) throw new Error(`路径包含链接: ${current}`)
  }
  const entries = []
  const stack = [full]
  const dependencyTree = relative === 'output/lyrics-editor-validation-runtime/node_modules'
  let bytes = 0
  let files = 0
  while (stack.length) {
    const entry = stack.pop()
    const info = lstatSync(entry)
    if (info.isSymbolicLink()) throw new Error(`包含链接: ${entry}`)
    const name = path.basename(entry)
    const isPackageData = dependencyTree && info.isDirectory() && /^data$/i.test(name)
    const isArchive = /\.(?:zip|7z|rar|tar|gz)$/i.test(name)
    const isBackupFile =
      !info.isDirectory() && /backup|备份/i.test(name) && !/\.(?:js|ts|map)$/i.test(name)
    if (
      (!isPackageData && protectedName.test(name)) ||
      protectedExtension.test(name) ||
      isBackupFile ||
      (!dependencyTree && isArchive)
    ) {
      throw new Error(`包含数据、备份或音频文件: ${entry}`)
    }
    if (!info.isDirectory() && !info.isFile()) throw new Error(`包含非常规文件: ${entry}`)
    entries.push(
      `${path.relative(root, entry)}\0${info.mode}\0${info.size}\0${info.mtimeMs}\0${info.ctimeMs}`,
    )
    if (info.isDirectory()) {
      for (const child of readdirSync(entry)) stack.push(path.join(entry, child))
    } else {
      bytes += info.size
      files++
    }
  }
  entries.sort()
  return {
    relative,
    full,
    bytes,
    files,
    fingerprint: createHash('sha256').update(entries.join('\n')).digest('hex'),
  }
}

function makePlan() {
  const actions = []
  const tracked = trackedFiles()
  for (const [relative, reason] of candidates) {
    try {
      const item = inspect(relative, tracked)
      actions.push({ ...item, reason })
    } catch (error) {
      console.log(`跳过 ${relative}: ${error.code === 'ENOENT' ? '不存在' : error.message}`)
    }
  }
  const id = createHash('sha256')
    .update(JSON.stringify(actions.map(({ relative, fingerprint }) => [relative, fingerprint])))
    .digest('hex')
  return { actions, id }
}

const plan = makePlan()
console.log(`工作区: ${root}`)
for (const item of plan.actions)
  console.log(
    `${(item.bytes / 1024 ** 2).toFixed(1)} MiB  ${item.files} 个文件  ${item.relative}  (${item.reason})`,
  )
console.log(
  `合计: ${(plan.actions.reduce((sum, item) => sum + item.bytes, 0) / 1024 ** 3).toFixed(2)} GiB（文件逻辑大小）`,
)
console.log(`Plan ID: ${plan.id}`)
if (!args.length) {
  console.log('仅预览。确认清单后，使用 --execute <Plan ID> 执行。')
} else if (args[1] !== plan.id) {
  console.error('清单已变化或 Plan ID 不匹配，未删除任何内容。请重新预览。')
  process.exitCode = 1
} else {
  // Recheck each tree immediately before deleting it. Fail closed on any change.
  for (const item of plan.actions) {
    try {
      if (inspect(item.relative, trackedFiles()).fingerprint !== item.fingerprint)
        throw new Error('内容已变化')
      rmSync(item.full, { recursive: true })
      console.log(`已删除: ${item.relative}`)
    } catch (error) {
      console.error(`停止，未完成所有目标: ${item.relative}: ${error.message}`)
      process.exitCode = 1
      break
    }
  }
}
