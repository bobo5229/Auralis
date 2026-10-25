// Adapted from Mapbox TinySDF's Euclidean distance transform, BSD-2-Clause.
// Copyright (c) 2016-2024 Mapbox, Inc. Full notice: THIRD-PARTY-NOTICES.md.
// Upstream: tiny-sdf@81da9d8c66bbaa55018296d00cc1f11755a0e004, index.js.
const INF = 1e20

function transformLine(grid, offset, stride, length, values, vertices, boundaries) {
  vertices[0] = 0
  boundaries[0] = -INF
  boundaries[1] = INF
  values[0] = grid[offset]
  for (let q = 1, k = 0; q < length; q++) {
    const value = (values[q] = grid[offset + q * stride])
    let intersection
    do {
      const r = vertices[k]
      intersection = (value - values[r] + q * q - r * r) / (2 * (q - r))
    } while (intersection <= boundaries[k] && --k > -1)
    k++
    vertices[k] = q
    boundaries[k] = intersection
    boundaries[k + 1] = INF
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (boundaries[k + 1] < q) k++
    const r = vertices[k]
    grid[offset + q * stride] = values[r] + (q - r) ** 2
  }
}

export function signedDistance(alpha, width, height, scale = 1) {
  const outer = new Float64Array(width * height)
  const inner = new Float64Array(width * height)
  for (let i = 0; i < alpha.length; i++) {
    const coverage = alpha[i] / 255
    outer[i] = coverage === 1 ? 0 : coverage === 0 ? INF : Math.max(0, 0.5 - coverage) ** 2
    inner[i] = coverage === 0 ? 0 : coverage === 1 ? INF : Math.max(0, coverage - 0.5) ** 2
  }
  const length = Math.max(width, height)
  const values = new Float64Array(length)
  const vertices = new Uint32Array(length)
  const boundaries = new Float64Array(length + 1)
  for (const grid of [outer, inner]) {
    for (let x = 0; x < width; x++)
      transformLine(grid, x, width, height, values, vertices, boundaries)
    for (let y = 0; y < height; y++)
      transformLine(grid, y * width, 1, width, values, vertices, boundaries)
  }
  return Float32Array.from(
    outer,
    (distance, i) => (Math.sqrt(distance) - Math.sqrt(inner[i])) / scale,
  )
}
