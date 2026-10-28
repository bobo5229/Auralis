import { normalize } from 'node:path'

export function toPathVariants(filePath: string): string[] {
  const normalizedPath = normalize(filePath)
  const slashPath = normalizedPath.replace(/\\/g, '/')
  const backslashPath = normalizedPath.replace(/\//g, '\\')

  return [...new Set([normalizedPath, slashPath, backslashPath])]
}

export function toRootPrefixes(rootPath: string): string[] {
  return toPathVariants(rootPath).map((pathVariant) => {
    if (pathVariant.endsWith('/') || pathVariant.endsWith('\\')) {
      return pathVariant
    }

    return pathVariant.includes('/') && !pathVariant.includes('\\')
      ? `${pathVariant}/`
      : `${pathVariant}\\`
  })
}

export function escapeLikePattern(value: string): string {
  return value.replace(/~/g, '~~').replace(/%/g, '~%').replace(/_/g, '~_')
}
