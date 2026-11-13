/** Size horizontal cards from the actual content pane, including a visible lyrics panel. */
export function searchSongGrid(width: number, height: number) {
  const gap = 20
  const columns = Math.max(1, Math.min(6, Math.floor((width + gap) / (300 + gap))))
  // 80px artwork + 24px padding, followed by the 16px row gap.
  const rows = Math.max(1, Math.min(4, Math.floor((height - 58) / 120)))
  return { columns, previewLimit: columns * Math.min(2, rows), pageSize: columns * (rows + 1) }
}
