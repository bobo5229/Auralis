/**
 * Lyrics auto-follow motion policy for `prefers-reduced-motion`. Smooth follow
 * is a script-driven Web Animations API movement (`track.animate()`), so under
 * reduced-motion it must resolve to instant `auto` jumps that never create a
 * WAAPI animation — a CSS media query cannot stop script-created animations.
 */
export type LyricsFollowBehavior = 'smooth' | 'auto'

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export const MIN_ANIMATE_DISTANCE = 0.5

export function resolveLyricsFollowBehavior(prefersReducedMotion: boolean): LyricsFollowBehavior {
  return prefersReducedMotion ? 'auto' : 'smooth'
}

/** Whether a follow call should create a WAAPI animation at all. */
export function shouldAnimateLyricsFollow(input: {
  behavior: LyricsFollowBehavior
  distance: number
}): boolean {
  return input.behavior === 'smooth' && input.distance >= MIN_ANIMATE_DISTANCE
}
