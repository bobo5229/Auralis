import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

const sourceRoot = fileURLToPath(new URL('..', import.meta.url))
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name)
    if (entry.isDirectory()) return files(file)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [file] : []
  })
}
const graph = new Map<string, string[]>()
function dependencies(file: string): string[] {
  const cached = graph.get(file)
  if (cached) return cached
  const result = ts
    .preProcessFile(readFileSync(file, 'utf8'), true, true)
    .importedFiles.flatMap(({ fileName }) => {
      const alias = /^@(main|shared)\/(.*)$/u.exec(fileName)
      const target = alias
        ? resolve(sourceRoot, alias[1], alias[2])
        : fileName.startsWith('.')
          ? resolve(dirname(file), fileName)
          : null
      if (!target) return []
      const resolved = [`${target}.ts`, resolve(target, 'index.ts')].find(existsSync)
      return resolved ? [resolved] : []
    })
  graph.set(file, result)
  return result
}

it('keeps shared contracts acyclic, including type imports and re-exports', () => {
  const active: string[] = []
  const visited = new Set<string>()
  const cycles: string[][] = []
  function visit(file: string): void {
    const index = active.indexOf(file)
    if (index >= 0) {
      cycles.push([...active.slice(index), file].map((path) => relative(sourceRoot, path)))
      return
    }
    if (visited.has(file)) return
    active.push(file)
    for (const dependency of dependencies(file)) visit(dependency)
    active.pop()
    visited.add(file)
  }
  for (const file of files(resolve(sourceRoot, 'shared'))) visit(file)
  expect(cycles).toEqual([])
})

it.each([
  { roots: ['main/features'], forbidden: 'main/ipc' },
  { roots: ['main/repositories', 'main/shared'], forbidden: 'main/features' },
  {
    roots: [
      'main/shared/artworkCachePolicy.ts',
      'main/repositories/trackScanWriter.ts',
      'main/repositories/metadataTrackWriter.ts',
    ],
    forbidden: 'main/features/artwork',
  },
])('keeps $roots independent of $forbidden implementations', ({ roots, forbidden }) => {
  const forbiddenRoot = resolve(sourceRoot, forbidden) + sep
  const violations: string[][] = []
  for (const root of roots) {
    const entry = resolve(sourceRoot, root)
    for (const file of root.endsWith('.ts') ? [entry] : files(entry)) {
      const visited = new Set<string>()
      function visit(current: string, chain: string[]): void {
        if (current.startsWith(forbiddenRoot)) {
          violations.push([...chain, current].map((path) => relative(sourceRoot, path)))
          return
        }
        if (visited.has(current)) return
        visited.add(current)
        for (const dependency of dependencies(current)) visit(dependency, [...chain, current])
      }
      visit(file, [])
    }
  }
  expect(violations).toEqual([])
})
