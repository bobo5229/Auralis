export function splitDelimitedValues(value: string | null | undefined): string[] {
  if (!value) return []

  return value
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function normalizeDelimitedValue(value: string): string {
  return value.trim().toLocaleLowerCase()
}
