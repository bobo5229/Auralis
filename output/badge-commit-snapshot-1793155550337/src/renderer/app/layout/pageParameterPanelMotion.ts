const DURATION_MS = 220
const EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** The panel owns interruption, layout and the final visible state. */
export function animatePageParameterPanel(
  panel: HTMLElement,
  fromY: number,
  toY: number,
  fromOpacity: number,
  opening: boolean,
  height: number,
) {
  const duration = Math.max(
    60,
    DURATION_MS * Math.min(1, Math.abs(toY - fromY) / Math.max(1, height)),
  )
  const movement = panel.animate(
    [{ transform: `translate3d(0, ${fromY}px, 0)` }, { transform: `translate3d(0, ${toY}px, 0)` }],
    { duration, easing: EASING, fill: 'forwards' },
  )
  const fade = panel.animate(
    opening
      ? [{ opacity: fromOpacity }, { opacity: 1, offset: 1 / 3 }, { opacity: 1 }]
      : [{ opacity: fromOpacity }, { opacity: fromOpacity, offset: 2 / 3 }, { opacity: 0 }],
    { duration, fill: 'forwards' },
  )
  return {
    movement,
    cancel() {
      movement.cancel()
      fade.cancel()
    },
  }
}
