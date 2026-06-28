import { splitDelimitedValues, isMultiValue, formatDelimitedValues } from './formatDelimitedValues'

export function splitArtistValues(value: string | null | undefined): string[] {
  return splitDelimitedValues(value)
}

export function isMultiValueArtist(value: string | null | undefined): boolean {
  return isMultiValue(value)
}

export function formatArtist(value: string | null | undefined): string {
  return formatDelimitedValues(value)
}
