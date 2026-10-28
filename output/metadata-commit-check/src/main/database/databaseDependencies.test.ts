import { readFileSync, readdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

function runtimeModule(statement: ts.Statement): string | null {
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause
    if (clause?.isTypeOnly) return null
    const bindings = clause?.namedBindings
    if (
      !clause?.name &&
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.length > 0 &&
      bindings.elements.every((element) => element.isTypeOnly)
    )
      return null
    return ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : null
  }
  if (ts.isExportDeclaration(statement)) {
    if (statement.isTypeOnly || !statement.moduleSpecifier) return null
    const clause = statement.exportClause
    if (
      clause &&
      ts.isNamedExports(clause) &&
      clause.elements.length > 0 &&
      clause.elements.every((element) => element.isTypeOnly)
    )
      return null
    return ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : null
  }
  return null
}

it('keeps database runtime imports and re-exports free of circular dependencies', () => {
  const directory = fileURLToPath(new URL('.', import.meta.url))
  const files = readdirSync(directory).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
  )
  const dependencies = new Map<string, string[]>()
  for (const name of files) {
    const file = resolve(directory, name)
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest)
    const modules = source.statements.map(runtimeModule).filter((module) => module !== null)
    dependencies.set(
      file,
      modules.flatMap((module) => {
        if (module.startsWith('.')) return [resolve(directory, `${module}.ts`)]
        if (module.startsWith('@main/database/'))
          return [resolve(directory, `${module.slice('@main/database/'.length)}.ts`)]
        return []
      }),
    )
  }

  const visited = new Set<string>()
  const active: string[] = []
  const cycles: string[] = []
  function visit(file: string): void {
    const cycleStart = active.indexOf(file)
    if (cycleStart >= 0) {
      cycles.push([...active.slice(cycleStart), file].map((path) => basename(path)).join(' -> '))
      return
    }
    if (visited.has(file) || !dependencies.has(file)) return
    active.push(file)
    for (const dependency of dependencies.get(file)!) visit(dependency)
    active.pop()
    visited.add(file)
  }
  for (const file of dependencies.keys()) visit(file)
  expect(cycles).toEqual([])
})
