import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function flatten(value, path = '', result = {}) {
  if (typeof value === 'string' && value.trim()) result[path] = value
  else if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length
  ) {
    for (const [key, child] of Object.entries(value))
      flatten(child, path ? `${path}.${key}` : key, result)
  } else throw new Error(`Invalid locale message: ${path || '<root>'}`)
  return result
}
const params = (value) =>
  [...new Set([...value.matchAll(/\{([a-zA-Z_]\w*)\}/g)].map((match) => match[1]))].sort().join(',')
const [zh, en] = await Promise.all(
  ['zh-Hans', 'en'].map(async (locale) =>
    flatten(
      JSON.parse(await readFile(resolve(root, `src/renderer/locales/${locale}.json`), 'utf8')),
    ),
  ),
)
const problems = []
for (const key of new Set([...Object.keys(zh), ...Object.keys(en)])) {
  if (!(key in zh) || !(key in en))
    problems.push(`${key}: missing in ${key in zh ? 'en' : 'zh-Hans'}`)
  else if (params(zh[key]) !== params(en[key]))
    problems.push(`${key}: interpolation parameters differ`)
}
if (problems.length) {
  console.error('[locales:check]', problems.join('\n'))
  process.exit(1)
}
console.log(`[locales:check] OK: zh-Hans / en (${Object.keys(zh).length} keys)`)
