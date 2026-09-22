export interface LyricsRect {
  left: number
  top: number
  width: number
  height: number
}

/** Find an unobstructed rectangle, preferring the lower central whitespace. */
export function cdLyricsPlacement(bounds: LyricsRect, obstacles: LyricsRect[]): LyricsRect | null {
  const height = 112
  const minWidth = 240
  const maxWidth = 420
  const right = bounds.left + bounds.width
  const bottom = bounds.top + bounds.height
  const xs = new Set([bounds.left, right])
  const ys = new Set([bounds.top, bottom])
  for (const rect of obstacles) {
    xs.add(Math.max(bounds.left, Math.min(right, rect.left)))
    xs.add(Math.max(bounds.left, Math.min(right, rect.left + rect.width)))
    ys.add(Math.max(bounds.top, Math.min(bottom, rect.top)))
    ys.add(Math.max(bounds.top, Math.min(bottom, rect.top + rect.height)))
  }
  const columns = [...xs].sort((a, b) => a - b)
  const rows = [...ys].sort((a, b) => a - b)
  let best: LyricsRect | null = null
  let bestScore = -Infinity
  for (let x = 0; x < columns.length - 1; x++) {
    for (let endX = x + 1; endX < columns.length; endX++) {
      const width = Math.min(maxWidth, columns[endX] - columns[x])
      if (width < minWidth) continue
      for (let y = 0; y < rows.length - 1; y++) {
        for (let endY = y + 1; endY < rows.length; endY++) {
          if (rows[endY] - rows[y] < height) continue
          const candidate = {
            left: (columns[x] + columns[endX] - width) / 2,
            top: (rows[y] + rows[endY] - height) / 2,
            width,
            height,
          }
          if (
            obstacles.some(
              (rect) =>
                candidate.left < rect.left + rect.width &&
                candidate.left + width > rect.left &&
                candidate.top < rect.top + rect.height &&
                candidate.top + candidate.height > rect.top,
            )
          )
            continue
          const score =
            width -
            Math.abs(candidate.left + width / 2 - (bounds.left + bounds.width / 2)) * 0.25 +
            (candidate.top - bounds.top) * 0.15
          if (score > bestScore) {
            best = candidate
            bestScore = score
          }
        }
      }
    }
  }
  return best
}
