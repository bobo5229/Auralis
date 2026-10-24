import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'
import postcss from 'postcss'
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
  {
    label: 'playback core independent of album feature implementations',
    roots: ['features/playback/core'],
    forbidden: 'features/albums',
  },
  {
    label: 'playback independent of settings feature implementations',
    roots: ['features/playback'],
    forbidden: 'features/settings',
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
      return /\.(?:ts|vue|css)$/u.test(entry.name) && !entry.name.endsWith('.test.ts') ? [file] : []
    })
  }

  function dependencies(file: string): string[] {
    const cached = imports.get(file)
    if (cached) return cached
    let source = readFileSync(file, 'utf8')
    const names: string[] = []
    const styles: string[] = []
    if (file.endsWith('.vue')) {
      const { descriptor } = parse(source, { filename: file })
      source = [descriptor.script?.content, descriptor.scriptSetup?.content].join('\n')
      for (const style of descriptor.styles) {
        if (style.src) names.push(style.src)
        else styles.push(style.content)
      }
    }
    if (file.endsWith('.css')) {
      styles.push(source)
    } else {
      names.push(
        ...ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName),
      )
    }
    for (const style of styles) {
      postcss.parse(style, { from: file }).walkAtRules('import', (rule) => {
        const match = /^(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s)]+))/u.exec(rule.params)
        const name = match?.[1] ?? match?.[2] ?? match?.[3]
        if (name) names.push(name)
      })
    }
    const result = names.flatMap((fileName) => {
      let target: string
      const name = fileName.split('?')[0]
      if (name.startsWith('.')) target = resolve(dirname(file), name)
      else if (name.startsWith('@renderer/')) target = resolve(renderer, name.slice(10))
      else if (name.startsWith('@shared/')) target = resolve(shared, name.slice(8))
      else return []
      const resolved = [target, `${target}.ts`, resolve(target, 'index.ts')].find(
        (path) => /\.(?:ts|vue|css)$/u.test(path) && existsSync(path),
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
