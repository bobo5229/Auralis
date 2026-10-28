import { readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

it('keeps scan implementations independent of the application and IPC adapters', () => {
  const directory = fileURLToPath(new URL('.', import.meta.url))
  const main = resolve(directory, '../..')
  const violations: string[] = []
  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue
    const path = resolve(directory, file)
    const imports = ts.preProcessFile(readFileSync(path, 'utf8'), true, true).importedFiles
    for (const { fileName } of imports) {
      const target = fileName.startsWith('@main/')
        ? resolve(main, fileName.slice(6))
        : resolve(dirname(path), fileName)
      const local = relative(main, target).replaceAll('\\', '/')
      if (
        fileName === 'electron' ||
        /^(app|ipc)\//u.test(local) ||
        fileName.startsWith('@shared/ipc/')
      )
        violations.push(`${file} -> ${fileName}`)
    }
  }
  expect(violations).toEqual([])
})
