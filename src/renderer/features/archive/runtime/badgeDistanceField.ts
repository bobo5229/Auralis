/*! BSD-2-Clause
Copyright (c) 2016-2024 Mapbox, Inc.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS” AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
// Adapted from Mapbox TinySDF's Euclidean distance transform, BSD-2-Clause.
// Copyright (c) 2016-2024 Mapbox, Inc. Full notice: badgeCase.NOTICE.md.
// Upstream: tiny-sdf@81da9d8c66bbaa55018296d00cc1f11755a0e004, index.js.
const INF = 1e20

function transformLine(
  grid: Float64Array,
  offset: number,
  stride: number,
  length: number,
  values: Float64Array,
  vertices: Uint32Array,
  boundaries: Float64Array,
) {
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

export function signedDistance(alpha: Uint8Array, width: number, height: number, scale = 1) {
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
  const distances = new Float32Array(outer.length)
  for (let i = 0; i < outer.length; i++)
    distances[i] = (Math.sqrt(outer[i]) - Math.sqrt(inner[i])) / scale
  return distances
}
