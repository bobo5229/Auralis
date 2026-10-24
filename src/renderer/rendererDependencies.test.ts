import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'
import { expect, it } from 'vitest'

it.each([
  {
    label: 'features and shared independent of the app shell',
    roots: ['features', 'shared'],
    forbidden: 'app',
  },
  {
    label: 'shared independent of feature implementations',
    roots: ['shared'],
    forbidden: 'features',
  },
])('keeps $label, including types and re-exports', ({ roots, forbidden }) => {
  const renderer = fileURLToPath(new URL('.', import.meta.url))
  const shared = resolve(renderer, '../shared')
  const forbiddenDirectory = resolve(renderer, forbidden) + sep
  const imports = new Map<string, string[]>()

  function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = resolve(directory, entry.name)
      if (entry.isDirectory()) return sourceFiles(file)
      return /\.(?:ts|vue)$/u.test(entry.name) && !entry.name.endsWith('.test.ts') ? [file] : []
    })
  }

  function dependencies(file: string): string[] {
    const cached = imports.get(file)
    if (cached) return cached
    let source = readFileSync(file, 'utf8')
    if (file.endsWith('.vue')) {
      const { descriptor } = parse(source, { filename: file })
      source = [descriptor.script?.content, descriptor.scriptSetup?.content].join('\n')
    }
    const result = ts.preProcessFile(source, true, true).importedFiles.flatMap(({ fileName }) => {
      let target: string
      const name = fileName.split('?')[0]
      if (name.startsWith('.')) target = resolve(dirname(file), name)
      else if (name.startsWith('@renderer/')) target = resolve(renderer, name.slice(10))
      else if (name.startsWith('@shared/')) target = resolve(shared, name.slice(8))
      else return []
      const resolved = [target, `${target}.ts`, resolve(target, 'index.ts')].find(
        (path) => /\.(?:ts|vue)$/u.test(path) && existsSync(path),
      )
      return resolved ? [resolved] : []
    })
    imports.set(file, result)
    return result
  }

  const violations: string[] = []
  for (const file of roots.flatMap((root) => sourceFiles(resolve(renderer, root)))) {
    const visited = new Set<string>()
    function visit(current: string, chain: string[]): void {
      if (current.startsWith(forbiddenDirectory)) {
        violations.push([...chain, current].map((path) => relative(renderer, path)).join(' -> '))
        return
      }
      if (visited.has(current)) return
      visited.add(current)
      for (const dependency of dependencies(current)) visit(dependency, [...chain, current])
    }
    visit(file, [])
  }
  expect(violations).toEqual([])
})
