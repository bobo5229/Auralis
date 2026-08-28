import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

// 默认预算配置（单位：字节）
const BUDGETS = {
  rendererJs: {
    name: 'Renderer JS',
    maxSingleFileSize: 2.5 * 1024 * 1024, // 单 chunk < 2.5MB
    maxTotalSize: 5.0 * 1024 * 1024, // 总 JS < 5.0MB
  },
  rendererCss: {
    name: 'Renderer CSS',
    maxSingleFileSize: 500 * 1024, // 单 chunk < 500KB
    maxTotalSize: 1.0 * 1024 * 1024, // 总 CSS < 1.0MB
  },
  rendererFonts: {
    name: 'Renderer Fonts',
    maxSingleFileSize: 20 * 1024 * 1024, // 单字体 < 20MB
    maxTotalSize: 80 * 1024 * 1024, // 总字体 < 80MB
  },
  mainJs: {
    name: 'Main Process JS',
    maxSingleFileSize: 2.5 * 1024 * 1024, // 单 chunk < 2.5MB
    maxTotalSize: 5.0 * 1024 * 1024, // 总 JS < 5.0MB
  },
  preloadJs: {
    name: 'Preload JS',
    maxSingleFileSize: 500 * 1024, // 单文件 < 500KB
    maxTotalSize: 1.0 * 1024 * 1024, // 总 Preload < 1.0MB
  },
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

function collectFiles(dir) {
  const results = []
  if (!fs.existsSync(dir)) return results

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath))
    } else if (entry.isFile()) {
      const stats = fs.statSync(fullPath)
      results.push({
        fullPath,
        relativePath: path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/'),
        name: entry.name,
        size: stats.size,
        ext: path.extname(entry.name).toLowerCase(),
      })
    }
  }
  return results
}

function runBudgetCheck(outDir = path.join(ROOT_DIR, 'out')) {
  console.log(`\n========================================`)
  console.log(`📦 Auralis 构建资产预算校验 (Bundle Budget Check)`)
  console.log(`========================================`)
  console.log(`📁 产物目录: ${outDir}\n`)

  if (!fs.existsSync(outDir)) {
    console.error(`❌ 错误：产物目录不存在: ${outDir}`)
    console.error(`💡 请先执行 npm run build 构建应用产物。`)
    process.exit(1)
  }

  const allFiles = collectFiles(outDir)
  if (allFiles.length === 0) {
    console.error(`❌ 错误：产物目录中未找到任何文件: ${outDir}`)
    process.exit(1)
  }

  // 分类归集文件
  const categories = {
    rendererJs: [],
    rendererCss: [],
    rendererFonts: [],
    mainJs: [],
    preloadJs: [],
  }

  for (const file of allFiles) {
    const rel = file.relativePath
    if (rel.startsWith('out/renderer/') || rel.includes('/renderer/')) {
      if (file.ext === '.js') {
        categories.rendererJs.push(file)
      } else if (file.ext === '.css') {
        categories.rendererCss.push(file)
      } else if (['.woff2', '.woff', '.ttf', '.otf', '.eot'].includes(file.ext)) {
        categories.rendererFonts.push(file)
      }
    } else if (rel.startsWith('out/main/') || rel.includes('/main/')) {
      if (file.ext === '.js' || file.ext === '.cjs' || file.ext === '.mjs') {
        categories.mainJs.push(file)
      }
    } else if (rel.startsWith('out/preload/') || rel.includes('/preload/')) {
      if (file.ext === '.js' || file.ext === '.cjs' || file.ext === '.mjs') {
        categories.preloadJs.push(file)
      }
    }
  }

  let totalViolations = 0

  for (const [key, budget] of Object.entries(BUDGETS)) {
    const files = categories[key] || []
    const totalSize = files.reduce((acc, f) => acc + f.size, 0)
    const maxSingleFile = files.reduce((max, f) => (f.size > (max?.size ?? 0) ? f : max), null)

    const isTotalOver = totalSize > budget.maxTotalSize
    const isSingleOver = maxSingleFile && maxSingleFile.size > budget.maxSingleFileSize

    console.log(`🔍 [${budget.name}] (${files.length} 个文件)`)
    console.log(
      `   总大小: ${formatBytes(totalSize)} / 上限 ${formatBytes(budget.maxTotalSize)} [${isTotalOver ? '❌ 超限' : '✅ 通过'}]`,
    )

    if (maxSingleFile) {
      console.log(
        `   最大单文件: ${maxSingleFile.relativePath} (${formatBytes(maxSingleFile.size)}) / 上限 ${formatBytes(budget.maxSingleFileSize)} [${isSingleOver ? '❌ 超限' : '✅ 通过'}]`,
      )
    }

    if (isTotalOver) {
      totalViolations++
      console.error(
        `   🚨 错误：${budget.name} 总大小超限！当前: ${formatBytes(totalSize)}, 上限: ${formatBytes(budget.maxTotalSize)}`,
      )
    }

    if (isSingleOver) {
      totalViolations++
      console.error(
        `   🚨 错误：${budget.name} 存在超大单文件！${maxSingleFile.relativePath} (${formatBytes(maxSingleFile.size)} > ${formatBytes(budget.maxSingleFileSize)})`,
      )
    }

    console.log('')
  }

  console.log(`========================================`)
  if (totalViolations > 0) {
    console.error(`❌ 资产预算校验未通过！共发现 ${totalViolations} 项超限。`)
    process.exit(1)
  } else {
    console.log(`✨ 资产预算校验全部通过！所有生成资源均在预算控制范围内。`)
    process.exit(0)
  }
}

// 支持 CLI 参数 --out-dir
const args = process.argv.slice(2)
const outDirArgIdx = args.indexOf('--out-dir')
const customOutDir = outDirArgIdx !== -1 ? path.resolve(args[outDirArgIdx + 1]) : undefined

runBudgetCheck(customOutDir)
