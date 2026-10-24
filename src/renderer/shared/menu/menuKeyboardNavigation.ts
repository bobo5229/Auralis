/** 在可用菜单项之间移动；返回原始项目索引，跳过禁用项。 */
export function resolveMenuNavigationIndex(
  key: string,
  currentIndex: number,
  enabledIndices: readonly number[],
): number | null {
  if (enabledIndices.length === 0) return null
  if (key === 'Home') return enabledIndices[0]
  if (key === 'End') return enabledIndices[enabledIndices.length - 1]
  const position = enabledIndices.indexOf(currentIndex)
  if (key === 'ArrowDown') return enabledIndices[(position + 1) % enabledIndices.length]
  if (key === 'ArrowUp') {
    return enabledIndices[(position <= 0 ? enabledIndices.length : position) - 1]
  }
  return null
}
