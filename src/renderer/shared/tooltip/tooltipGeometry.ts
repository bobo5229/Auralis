export function isTooltipTextClipped(element: {
  clientWidth: number
  clientHeight: number
  scrollWidth: number
  scrollHeight: number
}): boolean {
  return (
    element.clientWidth > 0 &&
    element.clientHeight > 0 &&
    (element.scrollWidth > element.clientWidth + 1 ||
      element.scrollHeight > element.clientHeight + 1)
  )
}
