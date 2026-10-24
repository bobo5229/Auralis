import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

it('keeps repositories independent of scan internals, including through types and re-exports', () => {
  const directory = fileURLToPath(new URL('.', import.meta.url))
  const main = resolve(directory, '..')
  const shared = resolve(main, '../shared')
  const scan = resolve(main, 'features/libraryScan') + sep
  const imports = new Map<string, string[]>()

  function dependencies(file: string): string[] {
    const cached = imports.get(file)
    if (cached) return cached
    const result = ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles.flatMap(
      ({ fileName }) => {
        let target: string
        if (fileName.startsWith('.')) target = resolve(dirname(file), fileName)
        else if (fileName.startsWith('@main/')) target = resolve(main, fileName.slice(6))
        else if (fileName.startsWith('@shared/')) target = resolve(shared, fileName.slice(8))
        else return []
        const resolved = [target, `${target}.ts`, resolve(target, 'index.ts')].find(
          (path) => path.endsWith('.ts') && existsSync(path),
        )
        return resolved ? [resolved] : []
      },
    )
    imports.set(file, result)
    return result
  }

  const violations: string[] = []
  for (const name of readdirSync(directory).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
  )) {
    const visited = new Set<string>()
    function visit(file: string, chain: string[]): void {
      if (file.startsWith(scan)) {
        violations.push([...chain, file].map((path) => relative(main, path)).join(' -> '))
        return
      }
      if (visited.has(file)) return
      visited.add(file)
      for (const dependency of dependencies(file)) visit(dependency, [...chain, file])
    }
    visit(resolve(directory, name), [])
  }
  expect(violations).toEqual([])
})
