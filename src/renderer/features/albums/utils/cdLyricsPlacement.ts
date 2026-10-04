export interface LyricsRect {
  left: number
  top: number
  width: number
  height: number
}

export interface LyricsArcPoint {
  x: number
  y: number
  /** Font size multiplier after compensating for perspective. */
  scale: number
}

/** Bounds of the centered text, rather than the entire supporting 120-degree path. */
export function cdLyricsOccupiedArcBounds(
  points: LyricsArcPoint[],
  measuredWidth: number,
  glyphCount: number,
  fontSize: number,
): LyricsRect {
  const distances = [0]
  for (let index = 1; index < points.length; index++) {
    distances.push(
      distances[index - 1] +
        Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y),
    )
  }
  const length = distances.at(-1) ?? 0
  const maximumScale = Math.max(1, ...points.map((point) => point.scale))
  const required = measuredWidth * maximumScale * 1.08
  const available = Math.max(0, length - fontSize)
  const fit =
    required > 0
      ? ([1, 0.85, 0.7, 0.55].find((scale) => required * scale <= available) ??
        available / required)
      : 1
  const span = Math.min(
    length,
    (measuredWidth + (glyphCount * fontSize) / 30) * maximumScale * fit * 1.08,
  )
  const start = (length - span) / 2
  const end = (length + span) / 2
  const at = (distance: number): LyricsArcPoint => {
    const index = distances.findIndex((value) => value >= distance)
    if (index <= 0) return points[0] ?? { x: 0, y: 0, scale: 1 }
    const left = points[index - 1]
    const right = points[index]
    const progress =
      (distance - distances[index - 1]) / (distances[index] - distances[index - 1] || 1)
    return {
      x: left.x + (right.x - left.x) * progress,
      y: left.y + (right.y - left.y) * progress,
      scale: 1,
    }
  }
  const occupied = [
    at(start),
    ...points.filter((_, index) => distances[index] > start && distances[index] < end),
    at(end),
  ]
  const padding = fontSize * maximumScale * fit + 2
  const left = Math.min(...occupied.map((point) => point.x)) - padding
  const top = Math.min(...occupied.map((point) => point.y)) - padding
  return {
    left,
    top,
    width: Math.max(...occupied.map((point) => point.x)) + padding - left,
    height: Math.max(...occupied.map((point) => point.y)) + padding - top,
  }
}

/** Retain a safe arc; otherwise find the nearest safe angle without wrapping jumps. */
export function cdLyricsArcPlacement(
  preferred: number,
  rectangleAt: (angle: number) => LyricsRect,
  bounds: LyricsRect,
  obstacles: LyricsRect[],
): number | null {
  const fits = (rect: LyricsRect): boolean =>
    rect.left >= bounds.left &&
    rect.top >= bounds.top &&
    rect.left + rect.width <= bounds.left + bounds.width &&
    rect.top + rect.height <= bounds.top + bounds.height &&
    !obstacles.some(
      (obstacle) =>
        rect.left < obstacle.left + obstacle.width &&
        rect.left + rect.width > obstacle.left &&
        rect.top < obstacle.top + obstacle.height &&
        rect.top + rect.height > obstacle.top,
    )
  if (fits(rectangleAt(preferred))) return preferred
  for (let distance = 15; distance <= 180; distance += 15) {
    for (const direction of [1, -1]) {
      const angle = preferred + distance * direction
      if (fits(rectangleAt(angle))) return angle
    }
  }
  return null
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
