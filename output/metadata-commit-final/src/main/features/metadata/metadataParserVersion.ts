import { extname } from 'node:path'

// Bump the common revision for shared decoding/normalization changes, or only
// the affected format revision for compatibility fixes. Never reuse a token.
const COMMON_REVISION = 4
const FORMAT_REVISIONS: Readonly<Record<string, number>> = { '.mp3': 3 }

export function getMetadataParserVersion(filePath: string): string {
  const extension = extname(filePath).toLowerCase()
  const revision = FORMAT_REVISIONS[extension]
  const common = `metadata:${COMMON_REVISION}`
  return revision === undefined ? common : `${common}/${extension.slice(1)}:${revision}`
}
