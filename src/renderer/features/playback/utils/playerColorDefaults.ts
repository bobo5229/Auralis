export interface PlayerColorRgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

/**
 * 播放器深色主题默认强调色回退值 (#8FA7BB)
 * 供算法 (resolvePlaybarAccent, extractArtworkPalette) 与 CSS Preflight (:root) 同源消费
 */
export const PLAYER_DEFAULT_ACCENT_DARK: PlayerColorRgb = Object.freeze({
  r: 143,
  g: 167,
  b: 187,
})

/**
 * 播放器浅色主题默认强调色回退值 (#788779)
 * 供算法 (resolvePlaybarAccent) 与 CSS Preflight (:root) 同源消费
 */
export const PLAYER_DEFAULT_ACCENT_LIGHT: PlayerColorRgb = Object.freeze({
  r: 120,
  g: 135,
  b: 121,
})
