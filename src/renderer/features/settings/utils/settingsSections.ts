export const SETTINGS_SECTIONS = ['appearance', 'library', 'about'] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export const DEFAULT_SETTINGS_SECTION: SettingsSection = 'appearance'

export function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && (SETTINGS_SECTIONS as readonly string[]).includes(value)
}
