import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS_SECTION, SETTINGS_SECTIONS, isSettingsSection } from './settingsSections'

describe('settingsSections', () => {
  it('defaults to appearance', () => {
    expect(DEFAULT_SETTINGS_SECTION).toBe('appearance')
  })

  it('exposes four sections in nav order', () => {
    expect([...SETTINGS_SECTIONS]).toEqual(['appearance', 'playback', 'library', 'about'])
  })

  it('accepts known sections and rejects unknown ids', () => {
    expect(isSettingsSection('appearance')).toBe(true)
    expect(isSettingsSection('library')).toBe(true)
    expect(isSettingsSection('about')).toBe(true)
    expect(isSettingsSection('playback')).toBe(true)
    expect(isSettingsSection('Appearance')).toBe(false)
    expect(isSettingsSection('')).toBe(false)
    expect(isSettingsSection(null)).toBe(false)
    expect(isSettingsSection(undefined)).toBe(false)
  })
})
