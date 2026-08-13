export function resolveRovingIndex(
  currentIndex: number,
  length: number,
  key: string,
): number | null {
  if (length <= 0 || currentIndex < 0 || currentIndex >= length) return null

  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      return (currentIndex - 1 + length) % length
    case 'ArrowRight':
    case 'ArrowDown':
      return (currentIndex + 1) % length
    case 'Home':
      return 0
    case 'End':
      return length - 1
    default:
      return null
  }
}
