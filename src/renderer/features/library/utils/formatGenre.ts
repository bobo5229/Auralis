import { splitDelimitedValues, isMultiValue, formatDelimitedValues } from './formatDelimitedValues'

export function splitGenreValues(value: string | null | undefined): string[] {
  return splitDelimitedValues(value)
}

export function isMultiValueGenre(value: string | null | undefined): boolean {
  return isMultiValue(value)
}

export function formatGenre(value: string | null | undefined): string {
  return formatDelimitedValues(value)
}
