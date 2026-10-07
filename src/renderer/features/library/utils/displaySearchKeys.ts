import { convertChineseText } from '@renderer/features/appearance/utils/chineseText'
import { formatDelimitedParts, splitDelimitedValues } from '@shared/utils/delimitedValues'
import { normalizeSearchText } from './normalizeSearchText'

/** Original and displayed prefixes, independent of the selected display preference. */
export function createDisplaySearchKeys(
  value: string | null | undefined,
  multiValue = false,
): readonly string[] {
  const keys = new Set<string>([normalizeSearchText(value)])
  const parts = multiValue ? splitDelimitedValues(value) : []
  if (multiValue) {
    keys.add(normalizeSearchText(formatDelimitedParts(parts)))
    parts.forEach((part) => keys.add(normalizeSearchText(part)))
  }
  for (const script of ['simplified', 'traditional'] as const) {
    keys.add(normalizeSearchText(convertChineseText(value, script)))
    if (multiValue) {
      const displayedParts = parts.map((part) => convertChineseText(part, script))
      keys.add(normalizeSearchText(formatDelimitedParts(displayedParts)))
      displayedParts.forEach((part) => keys.add(normalizeSearchText(part)))
    }
  }
  keys.delete('')
  return Object.freeze([...keys])
}
