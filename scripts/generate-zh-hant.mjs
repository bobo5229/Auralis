// zh-Hans.json → zh-Hant.json（OpenCC s2tw，台湾繁体）
// 用法：node scripts/generate-zh-hant.mjs
// 注意：zh-Hant.json 是生成物，禁止手改；改简体后重跑本脚本。
// s2tw 词典局限（如「窗口」→台繁口语「視窗」）由 zh-hant-overrides.json 词级覆盖。
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Converter } from 'opencc-js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcPath = resolve(root, 'src/renderer/locales/zh-Hans.json')
const outPath = resolve(root, 'src/renderer/locales/zh-Hant.json')
const overridesPath = resolve(root, 'scripts/zh-hant-overrides.json')

// s2tw：简体 → 台湾繁体（含台湾用词转换）
const convert = Converter({ from: 'cn', to: 'tw' })

/** 台湾用词覆盖表：s2tw 结果再按词级覆盖（如 窗口 → 視窗）。 */
const overrides = JSON.parse(await readFile(overridesPath, 'utf8'))

function applyOverrides(text) {
  let out = text
  for (const [from, to] of Object.entries(overrides)) {
    if (from !== to) {
      out = out.split(from).join(to)
    }
  }
  return out
}

/**
 * 深度遍历：仅转换 string 叶子，跳过 key 路径本身。
 * 保持对象键序与源一致，便于 diff。
 */
function convertDeep(value) {
  if (typeof value === 'string') {
    return applyOverrides(convert(value))
  }
  if (Array.isArray(value)) {
    return value.map(convertDeep)
  }
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const [key, child] of Object.entries(value)) {
      out[key] = convertDeep(child)
    }
    return out
  }
  return value
}

const source = JSON.parse(await readFile(srcPath, 'utf8'))
const converted = convertDeep(source)

await writeFile(outPath, `${JSON.stringify(converted, null, 2)}\n`, 'utf8')
console.log(`[locales] zh-Hant.json generated from zh-Hans.json (s2tw)`)
