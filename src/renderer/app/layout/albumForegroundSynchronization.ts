import {
  parseSurfaceColor,
  planAlbumForeground,
  type ForegroundChoice,
} from './albumForegroundPlan'
import { getRelativeLuminance } from '@renderer/shared/color/colorMath'
import type { ForegroundReadiness } from '@renderer/shared/color/foregroundReadiness'

interface SurfaceSpec {
  selector: string
  reference: () => HTMLElement | null
  tokens: Record<string, string>
}
interface ActiveForeground {
  reference: Animation
  backdropReference?: Animation
  isFloatingLyrics: boolean
  restore: () => void
}

/** Switch foreground tokens only at precomputed contrast thresholds. */
export function createAlbumForegroundSynchronization(
  shell: HTMLElement,
  main: HTMLElement,
  moreClock: HTMLElement,
  lyricsClock: HTMLElement,
  onMainReadiness?: (readiness: ForegroundReadiness | null) => void,
): { sync: () => void; dispose: () => void } {
  const specs: SurfaceSpec[] = [
    {
      selector: '.app-main',
      reference: () => main,
      tokens: {
        '--auralis-text': '--auralis-text',
        '--auralis-text-muted': '--auralis-text-muted',
        '--auralis-text-faint': '--auralis-text-faint',
        '--auralis-text-subtle': '--auralis-text-faint',
        '--album-detail-divider': '--auralis-text',
      },
    },
    {
      selector: '.app-sidebar',
      reference: () => shell.querySelector<HTMLElement>('.app-sidebar'),
      tokens: {
        '--auralis-text': '--auralis-text',
        '--auralis-text-muted': '--auralis-text-muted',
        '--auralis-text-faint': '--auralis-text-faint',
        '--auralis-text-subtle': '--auralis-text-faint',
        '--auralis-sidebar-active-text': '--auralis-text',
        '--auralis-sidebar-brand-text': '--auralis-text',
      },
    },
    {
      selector: '.now-playing-panel',
      reference: () => lyricsClock,
      tokens: {
        '--auralis-lyrics-active': '--auralis-lyrics-active',
        '--auralis-lyrics-inactive': '--auralis-lyrics-inactive',
        '--auralis-text': '--auralis-text',
        '--auralis-text-muted': '--auralis-text-muted',
        '--auralis-text-faint': '--auralis-text-faint',
      },
    },
    {
      selector: '.album-more-gallery',
      reference: () => moreClock,
      tokens: {
        '--album-detail-more-text': '--auralis-text',
        '--album-detail-more-faint': '--auralis-text-faint',
      },
    },
  ]
  const active = new Map<HTMLElement, ActiveForeground>()
  let disposed = false

  function referenceFor(element: HTMLElement): Animation | undefined {
    return element
      .getAnimations()
      .find(
        (animation) =>
          'transitionProperty' in animation &&
          animation.transitionProperty === '--album-surface-color' &&
          animation.playState === 'running',
      )
  }

  function syncTarget(target: HTMLElement, spec: SurfaceSpec): void {
    const referenceNode = spec.reference()
    const reference = referenceNode ? referenceFor(referenceNode) : undefined
    const isFloatingLyrics =
      target.matches('.now-playing-panel') && shell.classList.contains('is-lyrics-floating')
    const mainReference = isFloatingLyrics ? referenceFor(main) : undefined
    const previous = active.get(target)
    if (
      previous &&
      previous.reference === reference &&
      previous.backdropReference === mainReference &&
      previous.isFloatingLyrics === isFloatingLyrics
    )
      return
    previous?.restore()
    active.delete(target)
    if (target === main && previous) onMainReadiness?.(null)
    if (
      !reference ||
      reference.startTime === null ||
      (mainReference && mainReference.startTime === null) ||
      disposed
    )
      return
    const effect = reference.effect as KeyframeEffect | null
    const frames = effect?.getKeyframes()
    const from = parseSurfaceColor(String(frames?.[0]?.['--album-surface-color'] ?? ''))
    const to = parseSurfaceColor(
      String(frames?.[frames.length - 1]?.['--album-surface-color'] ?? ''),
    )
    const duration = effect?.getTiming().duration
    if (!from || !to || typeof duration !== 'number' || duration <= 0) return
    const targetStyle = getComputedStyle(target)
    const shellStyle = getComputedStyle(shell)
    const backdrop = parseSurfaceColor(shellStyle.getPropertyValue('--auralis-main-bg')) ?? {
      r: 26,
      g: 26,
      b: 26,
      a: 1,
    }
    const choices: Record<string, ForegroundChoice> = {}
    for (const [token, fallback] of Object.entries(spec.tokens)) {
      const desired =
        parseSurfaceColor(targetStyle.getPropertyValue(token)) ??
        parseSurfaceColor(shellStyle.getPropertyValue(fallback))
      const preferred = parseSurfaceColor(shellStyle.getPropertyValue(fallback)) ?? desired
      if (desired && preferred) choices[token] = { target: desired, preferred }
    }
    if (!Object.keys(choices).length) return
    // A floating lyrics surface reveals the main panel as it fades. Follow its
    // color transition as the backdrop instead of assuming a static shell color.
    const mainEffect = mainReference?.effect as KeyframeEffect | null | undefined
    const mainFrames = mainEffect?.getKeyframes()
    const backdropFrom = parseSurfaceColor(String(mainFrames?.[0]?.['--album-surface-color'] ?? ''))
    const backdropTo = parseSurfaceColor(
      String(mainFrames?.[mainFrames.length - 1]?.['--album-surface-color'] ?? ''),
    )
    const currentMain = isFloatingLyrics
      ? (parseSurfaceColor(getComputedStyle(main).backgroundColor) ?? backdrop)
      : backdrop
    const mainDuration = mainEffect?.getTiming().duration
    const backdropTransition =
      backdropFrom &&
      backdropTo &&
      typeof mainDuration === 'number' &&
      mainDuration > 0 &&
      typeof reference.startTime === 'number' &&
      typeof mainReference?.startTime === 'number'
        ? {
            from: backdropFrom,
            to: backdropTo,
            offset: (reference.startTime - mainReference.startTime) / mainDuration,
            scale: duration / mainDuration,
          }
        : undefined
    const steps = planAlbumForeground(from, to, currentMain, choices, backdropTransition)
    if (!shell.classList.contains('has-album-detail-color') && !isFloatingLyrics) {
      // Unregistered, inherited tokens in a WAAPI effect invalidate descendants on
      // every frame, even with steps easing. Theme colors change at only a few
      // contrast thresholds; apply them once at each threshold instead.
      const saved = Object.keys(choices).map((token) => ({
        token,
        value: target.style.getPropertyValue(token),
        priority: target.style.getPropertyPriority(token),
      }))
      const timers: ReturnType<typeof setTimeout>[] = []
      const elapsed = typeof reference.currentTime === 'number' ? reference.currentTime : 0
      const apply = (colors: Record<string, string>) => {
        for (const [token, value] of Object.entries(colors)) target.style.setProperty(token, value)
      }
      let current = steps[0]
      for (const step of steps) {
        const delay = step.offset * duration - elapsed
        if (delay <= 0) current = step
        else timers.push(setTimeout(() => apply(step.colors), delay))
      }
      apply(current.colors)
      const restore = () => {
        for (const timer of timers) clearTimeout(timer)
        for (const { token, value, priority } of saved) {
          if (value) target.style.setProperty(token, value, priority)
          else target.style.removeProperty(token)
        }
      }
      active.set(target, { reference, backdropReference: mainReference, isFloatingLyrics, restore })
      const finish = () => {
        if (active.get(target)?.reference !== reference) return
        active.delete(target)
        restore()
        if (target === main) onMainReadiness?.(null)
      }
      void reference.finished.then(finish, finish)
      return
    }
    const foregroundAnimation = target.animate(
      steps.map((step) => ({ ...step.colors, offset: step.offset, easing: 'steps(1, end)' })),
      { duration, easing: 'linear', fill: 'both' },
    )
    foregroundAnimation.startTime = reference.startTime
    if (target === main && onMainReadiness) {
      const desired = choices['--auralis-text']?.target
      const targetIsDark = desired && getRelativeLuminance(desired) < 0.18
      const matching =
        desired &&
        steps.find((step) => {
          const color = parseSurfaceColor(step.colors['--auralis-text'] ?? '')
          return color && getRelativeLuminance(color) < 0.18 === targetIsDark
        })
      onMainReadiness(
        desired && matching && typeof reference.currentTime === 'number'
          ? {
              target: desired,
              readyAt:
                performance.now() +
                Math.max(0, matching.offset * duration - reference.currentTime) +
                17,
            }
          : null,
      )
    }
    const restore = () => foregroundAnimation.cancel()
    active.set(target, { reference, backdropReference: mainReference, isFloatingLyrics, restore })
    void foregroundAnimation.finished.then(
      () => {
        if (active.get(target)?.reference !== reference) return
        active.delete(target)
        restore()
        if (target === main) onMainReadiness?.(null)
      },
      () => {},
    )
  }

  function sync(): void {
    if (disposed) return
    const seen = new Set<HTMLElement>()
    for (const spec of specs)
      for (const target of shell.querySelectorAll<HTMLElement>(spec.selector)) {
        seen.add(target)
        syncTarget(target, spec)
      }
    for (const [target, state] of active)
      if (!seen.has(target)) {
        state.restore()
        active.delete(target)
      }
  }
  function dispose(): void {
    disposed = true
    for (const state of active.values()) state.restore()
    active.clear()
    onMainReadiness?.(null)
  }
  return { sync, dispose }
}
