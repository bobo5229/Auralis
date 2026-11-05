import { tinycolor } from 'vue-color'

export type PickerColorResult =
  | { valid: true; color: string }
  | { valid: false; reason: 'invalid' | 'alpha' }
export interface PickerColorChange {
  color: string
  input: 'hsl' | 'other'
  hsl: { h: number; s: number; l: number }
}

/** Normalize the picker input into an opaque six-digit HEX color. */
export function parseOpaquePickerColor(value: unknown): PickerColorResult {
  const color = tinycolor(value as Parameters<typeof tinycolor>[0])
  if (!color.isValid()) return { valid: false, reason: 'invalid' }
  if (color.getAlpha() < 1) return { valid: false, reason: 'alpha' }
  return { valid: true, color: color.toHexString().toUpperCase() }
}

/** Translate library-specific event details into a small, neutral payload. */
export function pickerColorChange(value: unknown, color: string): PickerColorChange {
  const picked = tinycolor(value as Parameters<typeof tinycolor>[0])
  const original = picked.getOriginalInput()
  const input =
    original && typeof original === 'object' && 'h' in original && 'l' in original ? 'hsl' : 'other'
  const { h, s, l } = picked.toHsl()
  return { color, input, hsl: { h, s, l } }
}
