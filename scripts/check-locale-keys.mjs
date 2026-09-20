// 校验唯一维护的简体中文资源，拒绝空文案和非字符串叶节点。
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const messages = JSON.parse(
  await readFile(resolve(root, 'src/renderer/locales/zh-Hans.json'), 'utf8'),
)

function validateMessages(value, path = '') {
  if (typeof value === 'string' && value.trim() !== '') return []
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value)
    if (entries.length > 0) {
      return entries.flatMap(([key, child]) =>
        validateMessages(child, path ? `${path}.${key}` : key),
      )
    }
  }
  return [path || '<root>']
}

const invalidKeys = validateMessages(messages)
if (invalidKeys.length > 0) {
  console.error('[locales:check] Invalid messages:', invalidKeys.join(', '))
  process.exit(1)
}
console.log('[locales:check] OK: zh-Hans')
