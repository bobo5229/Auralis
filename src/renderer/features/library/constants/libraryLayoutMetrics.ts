/**
 * 曲库虚拟列表布局指标 — 单一事实源（TECHDOC Phase 6 §4.1 / REVIEW Finding 1）。
 * 纯数据模块：不得导入 Vue / DOM / 路由 / 播放状态。
 *
 * 曲目区与组的 padding/border 以「每侧」存储，高度公式内部 ×2 派生总量；
 * 对应 CSS 变量由 AlbumCoverGroup / Uno 直接消费，禁止重复写死尺寸。
 */
export const LIBRARY_LAYOUT_METRICS = {
  flatRowHeight: 44,
  flatArtworkSize: 44,
  coverArtworkSize: 280,
  coverTrackRowHeight: 48,
  coverDiscHeadingHeight: 24,
  coverMetaGap: 12,
  coverMetaLineHeight: 20,
  /** 封面信息吸顶后的顶部间距，不参与分组高度与滚动偏移 */
  coverStickyTopInset: 16,
  /** 曲目区单侧纵向 padding；首曲与封面顶对齐 */
  coverPanelPaddingBlockSide: 0,
  /** 曲目区单侧横向 padding，不参与高度与纵向定位 */
  coverPanelPaddingInlineSide: 10,
  /** 透明曲目区无外边框；CSS、虚拟高度和滚动定位共用此值 */
  coverPanelBorderWidth: 0,
  /** 专辑组单侧纵向 padding（原 py-7 = 28px） */
  coverGroupPaddingBlockSide: 28,
  /** 专辑组底边 border 宽度 */
  coverGroupBorderWidth: 1,
} as const

export type LibraryLayoutMetrics = typeof LIBRARY_LAYOUT_METRICS

export function getAlbumCoverColumnHeight(hasReleaseDate: boolean): number {
  const m = LIBRARY_LAYOUT_METRICS
  return m.coverArtworkSize + m.coverMetaGap + m.coverMetaLineHeight * (hasReleaseDate ? 3 : 2)
}

/**
 * 封面分组虚拟项高度。
 * 封面列 = artwork + metaGap + lineHeight × (2|3)
 * 首个 Disc 标题位于组顶部留白，不占正常布局高度。
 * 曲目列 = rowHeight × N + discHeadingHeight × max(标题数 - 1, 0) + panelPad×2 + panelBorder×2
 * 组高 = max(封面列, 曲目列) + groupPad×2 + groupBorder
 */
export function getAlbumGroupEstimatedHeight(
  trackCount: number,
  hasReleaseDate: boolean,
  discHeadingCount = 0,
): number {
  const m = LIBRARY_LAYOUT_METRICS
  const coverColumnHeight = getAlbumCoverColumnHeight(hasReleaseDate)
  const panelPadBlock = m.coverPanelPaddingBlockSide * 2
  const panelBorderBlock = m.coverPanelBorderWidth * 2
  const tracksPanelHeight =
    m.coverTrackRowHeight * trackCount +
    m.coverDiscHeadingHeight * Math.max(discHeadingCount - 1, 0) +
    panelPadBlock +
    panelBorderBlock
  const groupPadBlock = m.coverGroupPaddingBlockSide * 2
  return Math.max(coverColumnHeight, tracksPanelHeight) + groupPadBlock + m.coverGroupBorderWidth
}

/** 挂到 LibraryPage 根节点的 CSS 变量（带 px）；全部曲库与歌单路由均绑定。 */
export const LIBRARY_LAYOUT_CSS_VARS: Readonly<Record<string, string>> = {
  '--library-flat-row-height': `${LIBRARY_LAYOUT_METRICS.flatRowHeight}px`,
  '--library-flat-artwork-size': `${LIBRARY_LAYOUT_METRICS.flatArtworkSize}px`,
  '--library-cover-artwork-size': `${LIBRARY_LAYOUT_METRICS.coverArtworkSize}px`,
  '--library-cover-track-row-height': `${LIBRARY_LAYOUT_METRICS.coverTrackRowHeight}px`,
  '--library-cover-disc-heading-height': `${LIBRARY_LAYOUT_METRICS.coverDiscHeadingHeight}px`,
  '--library-cover-meta-gap': `${LIBRARY_LAYOUT_METRICS.coverMetaGap}px`,
  '--library-cover-meta-line-height': `${LIBRARY_LAYOUT_METRICS.coverMetaLineHeight}px`,
  '--library-cover-sticky-top-inset': `${LIBRARY_LAYOUT_METRICS.coverStickyTopInset}px`,
  '--library-cover-panel-padding-block-side': `${LIBRARY_LAYOUT_METRICS.coverPanelPaddingBlockSide}px`,
  '--library-cover-panel-padding-inline-side': `${LIBRARY_LAYOUT_METRICS.coverPanelPaddingInlineSide}px`,
  '--library-cover-panel-border-width': `${LIBRARY_LAYOUT_METRICS.coverPanelBorderWidth}px`,
  '--library-cover-group-padding-block-side': `${LIBRARY_LAYOUT_METRICS.coverGroupPaddingBlockSide}px`,
  '--library-cover-group-border-width': `${LIBRARY_LAYOUT_METRICS.coverGroupBorderWidth}px`,
}
