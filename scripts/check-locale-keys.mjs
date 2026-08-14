// 三语 key 集合一致性校验（Q6：MVP key 三语强制齐全）
// 用法：node scripts/check-locale-keys.mjs
// 三份 JSON 扁平化 key 集合必须完全一致；空字符串视为缺失 → exit 1。
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const localesDir = resolve(root, 'src/renderer/locales')

function flattenKeys(obj, prefix = '', out = []) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object') {
      flattenKeys(value, path, out)
    } else {
      if (typeof value !== 'string' || value.trim() === '') {
        // 空字符串视为缺失（TECHDOC §6.8）
        out.push(`${path}<=EMPTY`)
      } else {
        out.push(path)
      }
    }
  }
  return out
}

const files = ['zh-Hans.json', 'zh-Hant.json', 'en.json']
const parsed = {}
for (const file of files) {
  parsed[file] = JSON.parse(await readFile(resolve(localesDir, file), 'utf8'))
}

const sets = Object.fromEntries(
  Object.entries(parsed).map(([file, data]) => [file, new Set(flattenKeys(data))]),
)

const names = Object.keys(sets)
const [first, ...rest] = names
let ok = true
for (const name of rest) {
  const missing = [...sets[first]].filter((k) => !sets[name].has(k))
  const extra = [...sets[name]].filter((k) => !sets[first].has(k))
  if (missing.length > 0 || extra.length > 0) {
    ok = false
    console.error(`[locales:check] ${first} vs ${name} 不一致:`)
    for (const k of missing) console.error(`  - ${name} 缺: ${k}`)
    for (const k of extra) console.error(`  + ${name} 多: ${k}`)
  }
}

if (!ok) {
  console.error('[locales:check] FAILED：三语 key 集合不一致，禁止合入')
  process.exit(1)
}
console.log('[locales:check] OK：三语 key 集合一致')
