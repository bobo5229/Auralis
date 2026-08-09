/**
 * 曲库虚拟列表布局指标 — 单一事实源（TECHDOC Phase 6 §4.1）。
 * 纯数据模块：不得导入 Vue / DOM / 路由 / 播放状态。
 */
export const LIBRARY_LAYOUT_METRICS = {
  flatRowHeight: 44,
  flatArtworkSize: 44,
  coverArtworkSize: 250,
  coverTrackRowHeight: 40,
  coverMetaGap: 12,
  coverMetaLineHeight: 20,
  /** 曲目面板上下 padding 合计（DOM 各 10px） */
  coverPanelPaddingBlock: 20,
  /** 曲目面板上下 border 合计（各 1px）；纳入估算见 getAlbumGroupEstimatedHeight */
  coverPanelBorderBlock: 2,
  /** 专辑组上下 padding 合计（Uno py-7 × 2） */
  coverGroupPaddingBlock: 56,
  /** 专辑组 border-b */
  coverGroupBorderBlock: 1,
} as const

export type LibraryLayoutMetrics = typeof LIBRARY_LAYOUT_METRICS

/**
 * 封面分组虚拟项高度。
 * 封面列 = artwork + metaGap + lineHeight × (2|3)
 * 曲目列 = rowHeight × N + panelPad + panelBorder
 * 组高 = max(封面列, 曲目列) + groupPad + groupBorder
 */
export function getAlbumGroupEstimatedHeight(trackCount: number, hasReleaseDate: boolean): number {
  const m = LIBRARY_LAYOUT_METRICS
  const metaLines = hasReleaseDate ? 3 : 2
  const coverColumnHeight = m.coverArtworkSize + m.coverMetaGap + m.coverMetaLineHeight * metaLines
  const tracksPanelHeight =
    m.coverTrackRowHeight * trackCount + m.coverPanelPaddingBlock + m.coverPanelBorderBlock
  return (
    Math.max(coverColumnHeight, tracksPanelHeight) +
    m.coverGroupPaddingBlock +
    m.coverGroupBorderBlock
  )
}

/** 挂到 LibraryPage 根节点的 CSS 变量（带 px）；modern / manuscript / 歌单路由均绑定 */
export const LIBRARY_LAYOUT_CSS_VARS: Readonly<Record<string, string>> = {
  '--library-flat-row-height': `${LIBRARY_LAYOUT_METRICS.flatRowHeight}px`,
  '--library-flat-artwork-size': `${LIBRARY_LAYOUT_METRICS.flatArtworkSize}px`,
  '--library-cover-artwork-size': `${LIBRARY_LAYOUT_METRICS.coverArtworkSize}px`,
  '--library-cover-track-row-height': `${LIBRARY_LAYOUT_METRICS.coverTrackRowHeight}px`,
  '--library-cover-meta-gap': `${LIBRARY_LAYOUT_METRICS.coverMetaGap}px`,
  '--library-cover-meta-line-height': `${LIBRARY_LAYOUT_METRICS.coverMetaLineHeight}px`,
  '--library-cover-panel-padding-block': `${LIBRARY_LAYOUT_METRICS.coverPanelPaddingBlock}px`,
  '--library-cover-group-padding-block': `${LIBRARY_LAYOUT_METRICS.coverGroupPaddingBlock}px`,
}
