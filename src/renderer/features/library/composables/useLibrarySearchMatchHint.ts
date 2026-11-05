import { nextTick, type Ref } from 'vue'

const HINT_DURATION_MS = 750
const HINT_SHADOW =
  'inset 0 0 0 9999px color-mix(in srgb, var(--auralis-theme-accent) 10%, transparent)'
const CLEAR_SHADOW = 'inset 0 0 0 9999px transparent'

/** Owns the transient search cue without changing selection, playback or focus. */
export function useLibrarySearchMatchHint(scrollRef: Ref<HTMLElement | null>) {
  let revision = 0
  let animation: Animation | null = null
  let pendingFrame: { id: number; resolve: () => void } | null = null

  function clear(): void {
    revision++
    animation?.cancel()
    animation = null
    if (pendingFrame) {
      window.cancelAnimationFrame(pendingFrame.id)
      pendingFrame.resolve()
      pendingFrame = null
    }
  }

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      const id = window.requestAnimationFrame(() => {
        pendingFrame = null
        resolve()
      })
      pendingFrame = { id, resolve }
    })
  }

  async function revealAfterPosition(
    trackId: number,
    position: () => Promise<void>,
    isCurrent: () => boolean,
  ): Promise<void> {
    clear()
    const requestRevision = revision
    await position()

    // Scrolling can mount both an album group and its nested virtual track list.
    for (let attempt = 0; attempt < 4; attempt++) {
      if (requestRevision !== revision || !isCurrent()) return
      await nextFrame()
      await nextTick()
      if (requestRevision !== revision || !isCurrent()) return

      const container = scrollRef.value
      const row = container?.querySelector<HTMLElement>(`[data-track-id="${trackId}"]`)
      if (!container || !row) continue
      const viewportRect = container.getBoundingClientRect()
      const rowRect = row.getBoundingClientRect()
      if (
        rowRect.height <= 0 ||
        rowRect.bottom <= viewportRect.top ||
        rowRect.top >= viewportRect.bottom
      ) {
        continue
      }

      const reducedMotion =
        row.closest('[data-reduced-motion="true"]') !== null ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const frames: Keyframe[] = reducedMotion
        ? [{ boxShadow: HINT_SHADOW }, { boxShadow: HINT_SHADOW }]
        : [
            { boxShadow: CLEAR_SHADOW, offset: 0, easing: 'ease-out' },
            { boxShadow: HINT_SHADOW, offset: 100 / HINT_DURATION_MS },
            { boxShadow: HINT_SHADOW, offset: 250 / HINT_DURATION_MS, easing: 'ease-out' },
            { boxShadow: CLEAR_SHADOW, offset: 1 },
          ]
      // Add to the row's background and menu outline rather than replacing them.
      const cue = row.animate(frames, { duration: HINT_DURATION_MS, composite: 'add' })
      animation = cue
      cue.onfinish = () => {
        if (animation === cue) animation = null
      }
      return
    }
  }

  return { clear, revealAfterPosition }
}
