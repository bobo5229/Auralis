const LYRICS_SLIDE_DURATION_MS = 220
const LYRICS_SLIDE_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'

export function getLyricsSlideDuration(from: number, to: number): number {
  return Math.max(60, LYRICS_SLIDE_DURATION_MS * Math.abs(to - from))
}

/** Shared panel motion; the caller owns layout, interruption and final state. */
export function animateLyricsPanelSlide(
  panel: HTMLElement,
  from: number,
  to: number,
  fromOpacity: number,
  width: number,
  duration: number,
) {
  const movement = panel.animate(
    [
      { transform: `translate3d(${width * (1 - from)}px, 0, 0)` },
      { transform: `translate3d(${width * (1 - to)}px, 0, 0)` },
    ],
    { duration, easing: LYRICS_SLIDE_EASING, fill: 'forwards' },
  )
  const fade = panel.animate(
    to === 1
      ? [{ opacity: fromOpacity }, { opacity: 1, offset: 1 / 3 }, { opacity: 1 }]
      : [{ opacity: fromOpacity }, { opacity: fromOpacity, offset: 2 / 3 }, { opacity: 0 }],
    { duration, fill: 'forwards' },
  )
  return {
    movement,
    cancel: () => {
      movement.cancel()
      fade.cancel()
    },
  }
}

export function animateLyricsPlayerTranslation(
  island: HTMLElement,
  offset: { x: number; y: number },
  duration: number,
): Animation {
  return island.animate(
    [
      { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` },
      { transform: 'translate3d(0, 0, 0)' },
    ],
    { duration, easing: LYRICS_SLIDE_EASING },
  )
}
