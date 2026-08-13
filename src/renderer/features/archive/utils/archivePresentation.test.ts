import { describe, expect, it } from 'vitest'
import { resolveArchivePresentation } from './archivePresentation'

describe('resolveArchivePresentation', () => {
  it('enables the shared manuscript preference only on the archive route', () => {
    expect(resolveArchivePresentation('archive', 'manuscript')).toBe('manuscript')
    expect(resolveArchivePresentation('archive', 'modern')).toBe('modern')
  })

  it('keeps every unrelated route modern', () => {
    expect(resolveArchivePresentation('library', 'manuscript')).toBe('modern')
    expect(resolveArchivePresentation('albums', 'manuscript')).toBe('modern')
    expect(resolveArchivePresentation(undefined, 'manuscript')).toBe('modern')
  })
})
