/**
 * Mini-player layout is cover-first: the square sleeve size is chosen first,
 * then the native window is sized so the cover is never a small inset.
 *
 * Vertical chrome budget must stay in sync with MiniPlayer.vue stack
 * (padding + window chrome + meta + progress + transport + actions + gaps).
 */
export const MINI_COVER_MIN = 248
export const MINI_COVER_MAX = 320
export const MINI_COVER_IDEAL = 288

/** Horizontal padding each side (matches .mini-body padding-x). */
export const MINI_PAD_X = 16

/**
 * Everything below/above the square cover in the body column (px).
 * Tuned to MiniPlayer.vue vertical stack — adjust if that layout changes.
 */
export const MINI_CHROME_HEIGHT = 268

export interface MiniPlayerBodySize {
  /** Square album sleeve edge length. */
  coverSize: number
  width: number
  height: number
}

/** Default / fallback when display metrics are unavailable. */
export function getDefaultMiniPlayerBodySize(): MiniPlayerBodySize {
  return sizeFromCover(MINI_COVER_IDEAL)
}

function sizeFromCover(coverSize: number): MiniPlayerBodySize {
  const cover = Math.round(coverSize)
  return {
    coverSize: cover,
    width: cover + MINI_PAD_X * 2,
    height: cover + MINI_CHROME_HEIGHT,
  }
}

/**
 * Pick cover + window size for a display work area so the sleeve stays large
 * (ideal when possible) while the plaque still fits on screen.
 */
export function computeMiniPlayerBodySize(
  workAreaWidth: number,
  workAreaHeight: number,
): MiniPlayerBodySize {
  const maxWindowHeight = Math.max(1, Math.floor(workAreaHeight * 0.9))
  const maxWindowWidth = Math.max(1, Math.floor(workAreaWidth * 0.55))

  const maxCoverByHeight = maxWindowHeight - MINI_CHROME_HEIGHT
  const maxCoverByWidth = maxWindowWidth - MINI_PAD_X * 2
  const maxCover = Math.min(MINI_COVER_MAX, maxCoverByHeight, maxCoverByWidth)

  // Prefer ideal; never exceed what the display allows; keep a usable floor when possible.
  let cover = Math.min(MINI_COVER_IDEAL, maxCover)
  if (maxCover >= MINI_COVER_MIN) {
    cover = Math.max(MINI_COVER_MIN, cover)
  } else {
    // Very short displays: still keep a square, even if below the comfort floor.
    cover = Math.max(180, maxCover)
  }

  return sizeFromCover(cover)
}
