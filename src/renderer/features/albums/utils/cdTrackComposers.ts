import { splitDelimitedValues } from '@shared/utils/delimitedValues'

export function presentCdTrackComposers(value: string | null | undefined): string[] | null {
  const names = splitDelimitedValues(value)
  return names.length > 0 ? names : null
}
