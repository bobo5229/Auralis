import { onBeforeUnmount, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { RgbColor } from '@renderer/features/playback/types'
import {
  CD_DARK_BACKGROUND,
  CD_LIGHT_BACKGROUND,
  formatCdColor,
  readableCdColor,
} from '../utils/cdCanvasColors'
import type { CdCanvasTheme } from './useCdCanvasTheme'

export function useCdCanvasColors(
  page: Ref<HTMLElement | null>,
  theme: MaybeRefOrGetter<CdCanvasTheme>,
  accent: MaybeRefOrGetter<RgbColor | null>,
): void {
  const update = (): void => {
    const element = page.value
    if (!element) return
    const nextTheme = toValue(theme)
    const base = nextTheme === 'dark' ? CD_DARK_BACKGROUND : CD_LIGHT_BACKGROUND
    const sourceAccent = toValue(accent)
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
  }
  watch([page, () => toValue(theme), () => toValue(accent)], update, {
    immediate: true,
    flush: 'post',
  })
  onBeforeUnmount(() => {
    page.value?.style.removeProperty('--cd-lyrics-color')
  })
}
