import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

function findDirectory(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate
    }
  }
  return null
}

function findRecursive(dir, predicate) {
  const results = []
  if (!fs.existsSync(dir)) return results

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findRecursive(fullPath, predicate))
    } else if (entry.isFile() && predicate(entry.name, fullPath)) {
      results.push(fullPath)
    }
  }
  return results
}

function verifyArtifacts(targetDir) {
  console.log(`\n========================================`)
  console.log(`🔍 Auralis 安装与分发产物完整性校验 (Artifact Verification)`)
  console.log(`========================================`)

  // 若未指定 targetDir，按优先级自动探测 candidate 路径
  const resolvedDir =
    targetDir ||
    findDirectory([
      path.join(ROOT_DIR, 'release', 'win-unpacked'),
      path.join(ROOT_DIR, 'release', 'installer', 'win-unpacked'),
      path.join(ROOT_DIR, 'release', 'portable', 'win-unpacked'),
      path.join(ROOT_DIR, 'dist', 'win-unpacked'),
    ])

  if (!resolvedDir || !fs.existsSync(resolvedDir)) {
    console.error(`❌ 错误：未找到解包产物目录！`)
    console.error(`已尝试探测以下候选路径：`)
    console.error(` - release/win-unpacked`)
    console.error(` - release/installer/win-unpacked`)
    console.error(` - release/portable/win-unpacked`)
    console.error(` - dist/win-unpacked`)
    console.error(`💡 请先执行 npm run pack:dir 或 electron-builder --dir 打包解包目录。`)
    process.exit(1)
  }

  console.log(`📁 校验目标目录: ${resolvedDir}\n`)

  const checks = []
  let hasFailure = false

  function recordCheck(name, passed, detail) {
    checks.push({ name, passed, detail })
    const icon = passed ? '✅' : '❌'
    console.log(`${icon} [${name}]: ${detail}`)
    if (!passed) {
      hasFailure = true
    }
  }

  // 1. 校验主执行程序 Auralis.exe
  const exePath = path.join(resolvedDir, 'Auralis.exe')
  if (fs.existsSync(exePath)) {
    const stat = fs.statSync(exePath)
    if (stat.size > 10 * 1024 * 1024) {
      recordCheck('主执行文件 (Auralis.exe)', true, `存在且大小正常 (${formatBytes(stat.size)})`)
    } else {
      recordCheck(
        '主执行文件 (Auralis.exe)',
        false,
        `文件过小 (${formatBytes(stat.size)})，可能损坏`,
      )
    }
  } else {
    recordCheck('主执行文件 (Auralis.exe)', false, `未在根目录找到 Auralis.exe`)
  }

  // 2. 校验核心动态库与运行时文件
  const requiredRuntimes = ['ffmpeg.dll', 'icudtl.dat', 'v8_context_snapshot.bin', 'resources.pak']
  for (const file of requiredRuntimes) {
    const p = path.join(resolvedDir, file)
    if (fs.existsSync(p) && fs.statSync(p).size > 0) {
      recordCheck(`运行时依赖 (${file})`, true, `存在 (${formatBytes(fs.statSync(p).size)})`)
    } else {
      recordCheck(`运行时依赖 (${file})`, false, `缺失或为空文件`)
    }
  }

  // 3. 校验 resources 目录及 app.asar
  const resourcesDir = path.join(resolvedDir, 'resources')
  const asarPath = path.join(resourcesDir, 'app.asar')
  if (fs.existsSync(asarPath)) {
    const stat = fs.statSync(asarPath)
    if (stat.size > 1024 * 1024) {
      recordCheck('主应用包 (app.asar)', true, `存在且非空 (${formatBytes(stat.size)})`)
    } else {
      recordCheck('主应用包 (app.asar)', false, `文件过小 (${formatBytes(stat.size)})`)
    }
  } else {
    recordCheck('主应用包 (app.asar)', false, `未找到 resources/app.asar`)
  }

  // 4. 校验原生模块 unpacked (better-sqlite3 & sharp)
  const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked')
  if (fs.existsSync(unpackedDir)) {
    const nodeFiles = findRecursive(unpackedDir, (name) => name.endsWith('.node'))
    const hasBetterSqlite = nodeFiles.some(
      (f) =>
        f.toLowerCase().includes('better-sqlite3') || f.toLowerCase().includes('better_sqlite3'),
    )
    const hasSharp = nodeFiles.some((f) => f.toLowerCase().includes('sharp'))

    if (hasBetterSqlite) {
      recordCheck(
        '原生数据库模块 (better-sqlite3.node)',
        true,
        '已正确提取并在 asar.unpacked 中就绪',
      )
    } else {
      recordCheck(
        '原生数据库模块 (better-sqlite3.node)',
        false,
        '未在 asar.unpacked 中找到 better-sqlite3 模块',
      )
    }

    if (hasSharp) {
      recordCheck('原生图片模块 (sharp.node)', true, '已正确提取并在 asar.unpacked 中就绪')
    } else {
      recordCheck('原生图片模块 (sharp.node)', false, '未在 asar.unpacked 中找到 sharp 模块')
    }
  } else {
    recordCheck(
      '原生解包目录 (app.asar.unpacked)',
      false,
      '未找到 resources/app.asar.unpacked 目录',
    )
  }

  // 5. 校验 extraResources (如 icons/icon.png)
  const iconPath = path.join(resourcesDir, 'icons', 'icon.png')
  if (fs.existsSync(iconPath)) {
    recordCheck(
      '应用图标资源 (icons/icon.png)',
      true,
      `存在 (${formatBytes(fs.statSync(iconPath).size)})`,
    )
  } else {
    recordCheck('应用图标资源 (icons/icon.png)', false, `未在 resources/icons/ 中找到 icon.png`)
  }

  console.log(`\n========================================`)
  if (hasFailure) {
    console.error(`❌ 产物验证失败！请检查上述缺失或损坏的项目。`)
    process.exit(1)
  } else {
    console.log(`✨ 产物验证全部通过！所有关键二进制文件、asar 包与原生依赖均完整无缺。`)
    process.exit(0)
  }
}

// 支持 CLI 参数 --dir
const args = process.argv.slice(2)
const dirArgIdx = args.indexOf('--dir')
const customDir = dirArgIdx !== -1 ? path.resolve(args[dirArgIdx + 1]) : undefined

verifyArtifacts(customDir)
