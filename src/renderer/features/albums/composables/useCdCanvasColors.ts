import { onBeforeUnmount, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { RgbColor } from '@renderer/features/playback/types'
import { animateProgress } from '@renderer/shared/animation/motion'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import {
  CD_DARK_BACKGROUND,
  CD_LIGHT_BACKGROUND,
  cdCanvasColorTokens,
  formatCdColor,
  mixCdColor,
  readableCdColor,
} from '../utils/cdCanvasColors'
import type { CdCanvasTheme } from './useCdCanvasTheme'

export function useCdCanvasColors(
  page: Ref<HTMLElement | null>,
  background: MaybeRefOrGetter<RgbColor | null>,
  theme: MaybeRefOrGetter<CdCanvasTheme>,
  accent: MaybeRefOrGetter<RgbColor | null>,
): void {
  const reducedMotion = createReducedMotionQuery()
  let cancel: (() => void) | undefined
  let current = CD_LIGHT_BACKGROUND
  let previousTheme = toValue(theme)
  let painted = false
  const written = new Set<string>()
  const clear = (): void => {
    for (const name of written) page.value?.style.removeProperty(name)
    written.clear()
    painted = false
  }
  const update = (animate = true): void => {
    cancel?.()
    cancel = undefined
    const element = page.value
    if (!element) return
    const nextTheme = toValue(theme)
    const changedTheme = previousTheme !== nextTheme
    const base = nextTheme === 'dark' ? CD_DARK_BACKGROUND : CD_LIGHT_BACKGROUND
    const target = nextTheme === 'dark' ? null : toValue(background)
    const sourceAccent = toValue(accent)
    const from = changedTheme ? base : current
    const to = target ?? base
    previousTheme = nextTheme
    const draw = (color: RgbColor): void => {
      for (const [name, value] of Object.entries(cdCanvasColorTokens(color, sourceAccent))) {
        element.style.setProperty(name, value)
        written.add(name)
      }
      current = color
      painted = true
    }
    const finish = (): void => {
      if (target) draw(to)
      else {
        clear()
        element.style.setProperty(
          '--cd-lyrics-color',
          formatCdColor(
            readableCdColor(
              sourceAccent ??
                (nextTheme === 'dark' ? { r: 168, g: 166, b: 159 } : { r: 98, g: 98, b: 91 }),
              base,
            ),
          ),
        )
        written.add('--cd-lyrics-color')
        current = base
      }
      cancel = undefined
    }
    if (
      !animate ||
      reducedMotion.matches ||
      changedTheme ||
      (!target && !painted) ||
      formatCdColor(from) === formatCdColor(to)
    ) {
      finish()
      return
    }
    cancel = animateProgress(
      320,
      (progress) => draw(mixCdColor(from, to, 1 - (1 - progress) ** 3)),
      finish,
    )
  }
  watch(
    [page, () => toValue(background), () => toValue(theme), () => toValue(accent)],
    () => update(),
    { immediate: true, flush: 'post' },
  )
  const motionChanged = (): void => {
    if (reducedMotion.matches) update(false)
  }
  reducedMotion.addEventListener('change', motionChanged)
  onBeforeUnmount(() => {
    cancel?.()
    reducedMotion.removeEventListener('change', motionChanged)
    clear()
  })
}
