/**
 * 曲库虚拟列表布局指标 — 单一事实源（TECHDOC Phase 6 §4.1 / REVIEW Finding 1）。
 * 纯数据模块：不得导入 Vue / DOM / 路由 / 播放状态。
 *
 * 面板与组的 padding/border 以「每侧」存储，高度公式内部 ×2 派生总量；
 * 对应 CSS 变量由 AlbumCoverGroup / Uno 直接消费，禁止再写死 10/1/28。
 */
export const LIBRARY_LAYOUT_METRICS = {
  flatRowHeight: 44,
  flatArtworkSize: 44,
  coverArtworkSize: 250,
  coverTrackRowHeight: 40,
  coverMetaGap: 12,
  coverMetaLineHeight: 20,
  /** 曲目面板单侧 padding */
  coverPanelPaddingBlockSide: 10,
  /** 曲目面板四边 border 宽度（参与盒模型与 virtualizer） */
  coverPanelBorderWidth: 1,
  /** 专辑组单侧纵向 padding（原 py-7 = 28px） */
  coverGroupPaddingBlockSide: 28,
  /** 专辑组底边 border 宽度 */
  coverGroupBorderWidth: 1,
} as const

export type LibraryLayoutMetrics = typeof LIBRARY_LAYOUT_METRICS

/**
 * 封面分组虚拟项高度。
 * 封面列 = artwork + metaGap + lineHeight × (2|3)
 * 曲目列 = rowHeight × N + panelPad×2 + panelBorder×2
 * 组高 = max(封面列, 曲目列) + groupPad×2 + groupBorder
 */
export function getAlbumGroupEstimatedHeight(trackCount: number, hasReleaseDate: boolean): number {
  const m = LIBRARY_LAYOUT_METRICS
  const metaLines = hasReleaseDate ? 3 : 2
  const coverColumnHeight = m.coverArtworkSize + m.coverMetaGap + m.coverMetaLineHeight * metaLines
  const panelPadBlock = m.coverPanelPaddingBlockSide * 2
  const panelBorderBlock = m.coverPanelBorderWidth * 2
  const tracksPanelHeight = m.coverTrackRowHeight * trackCount + panelPadBlock + panelBorderBlock
  const groupPadBlock = m.coverGroupPaddingBlockSide * 2
  return Math.max(coverColumnHeight, tracksPanelHeight) + groupPadBlock + m.coverGroupBorderWidth
}

/** 挂到 LibraryPage 根节点的 CSS 变量（带 px）；modern / manuscript / 歌单路由均绑定 */
export const LIBRARY_LAYOUT_CSS_VARS: Readonly<Record<string, string>> = {
  '--library-flat-row-height': `${LIBRARY_LAYOUT_METRICS.flatRowHeight}px`,
  '--library-flat-artwork-size': `${LIBRARY_LAYOUT_METRICS.flatArtworkSize}px`,
  '--library-cover-artwork-size': `${LIBRARY_LAYOUT_METRICS.coverArtworkSize}px`,
  '--library-cover-track-row-height': `${LIBRARY_LAYOUT_METRICS.coverTrackRowHeight}px`,
  '--library-cover-meta-gap': `${LIBRARY_LAYOUT_METRICS.coverMetaGap}px`,
  '--library-cover-meta-line-height': `${LIBRARY_LAYOUT_METRICS.coverMetaLineHeight}px`,
  '--library-cover-panel-padding-block-side': `${LIBRARY_LAYOUT_METRICS.coverPanelPaddingBlockSide}px`,
  '--library-cover-panel-border-width': `${LIBRARY_LAYOUT_METRICS.coverPanelBorderWidth}px`,
  '--library-cover-group-padding-block-side': `${LIBRARY_LAYOUT_METRICS.coverGroupPaddingBlockSide}px`,
  '--library-cover-group-border-width': `${LIBRARY_LAYOUT_METRICS.coverGroupBorderWidth}px`,
}
