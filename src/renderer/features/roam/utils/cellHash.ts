/** Reinterpret a JS number as signed int32, then as unsigned for stable mixing. */
function toU32(n: number): number {
  return (n | 0) >>> 0
}

/** 32-bit avalanche mix (well-distributed, deterministic). */
function mix32(h: number): number {
  let x = h >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0
  x ^= x >>> 16
  return x >>> 0
}

/**
 * Deterministic album index for infinite cell `(cx, cy)`.
 *
 * Negative coordinates are stable: each axis is bit-reinterpreted as u32 before mixing.
 * Returns `0` when `albumCount <= 0`.
 */
export function cellAlbumIndex(seed: number, cx: number, cy: number, albumCount: number): number {
  if (albumCount <= 0) return 0

  let h = seed >>> 0
  h = mix32(h ^ toU32(cx))
  h = mix32(h ^ toU32(cy))
  // Extra diffusion so nearby cells do not cluster similar indices.
  h = mix32(h ^ toU32(Math.imul(cx | 0, 0x9e3779b9) + (cy | 0)))

  return h % albumCount
}
