import { tinycolor } from 'vue-color'

export type PickerAccentResult =
  | { valid: true; color: string }
  | { valid: false; reason: 'invalid' | 'alpha' }

/**
 * Adapt the SketchPicker event to the persisted opaque HEX preference.
 * Keep this dependency in the lazy settings module, away from first-frame boot.
 */
export function parseOpaquePickerAccent(value: unknown): PickerAccentResult {
  const color = tinycolor(value as Parameters<typeof tinycolor>[0])
  if (!color.isValid()) return { valid: false, reason: 'invalid' }
  if (color.getAlpha() < 1) return { valid: false, reason: 'alpha' }
  return { valid: true, color: color.toHexString().toUpperCase() }
}
