import { describe, expect, it } from 'vitest'
import { resolveSettingsPresentation } from './settingsPresentation'

describe('resolveSettingsPresentation', () => {
  it('enables manuscript only on the settings route', () => {
    expect(resolveSettingsPresentation('settings', 'manuscript')).toBe('manuscript')
    expect(resolveSettingsPresentation('settings', 'modern')).toBe('modern')
  })

  it('keeps every unrelated or missing route modern', () => {
    expect(resolveSettingsPresentation('library', 'manuscript')).toBe('modern')
    expect(resolveSettingsPresentation('playlist', 'manuscript')).toBe('modern')
    expect(resolveSettingsPresentation('albums', 'manuscript')).toBe('modern')
    expect(resolveSettingsPresentation('album-detail', 'manuscript')).toBe('modern')
    expect(resolveSettingsPresentation('archive', 'manuscript')).toBe('modern')
    expect(resolveSettingsPresentation('setting', 'manuscript')).toBe('modern')
    expect(resolveSettingsPresentation('Settings', 'manuscript')).toBe('modern')
    expect(resolveSettingsPresentation(null, 'manuscript')).toBe('modern')
    expect(resolveSettingsPresentation(undefined, 'manuscript')).toBe('modern')
  })
})
