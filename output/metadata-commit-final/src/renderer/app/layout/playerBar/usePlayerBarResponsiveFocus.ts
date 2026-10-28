import { nextTick, watch, type Ref } from 'vue'
import { resolveRestorablePlayerTrigger } from '@renderer/app/utils/playerOverlayFocus'

export function usePlayerBarResponsiveFocus(options: {
  overflow: Readonly<Ref<boolean>>
  lyricsAvailable: Readonly<Ref<boolean>>
  enabled: Readonly<Ref<boolean>>
  lyricsButton: Ref<HTMLElement | null>
  overflowLyricsButton: Ref<HTMLElement | null>
  modeButton: Ref<HTMLElement | null>
  overflowButton: Ref<HTMLElement | null>
  overflowPanel: Ref<HTMLElement | null>
  queueButton: Ref<HTMLElement | null>
  closeOverflowPanels: () => void
}): void {
  watch(
    [options.overflow, options.lyricsAvailable],
    async ([overflow], [wasOverflow], onCleanup) => {
      // Capture ownership before v-if removes the focused control.
      const active = document.activeElement
      const owner =
        active &&
        (active === options.lyricsButton.value || active === options.overflowLyricsButton.value)
          ? 'lyrics'
          : active && active === options.modeButton.value
            ? 'mode'
            : active &&
                (active === options.overflowButton.value ||
                  options.overflowPanel.value?.contains(active))
              ? 'overflow'
              : null

      if (!overflow && wasOverflow) options.closeOverflowPanels()
      if (!owner) return

      let cancelled = false
      onCleanup(() => {
        cancelled = true
      })
      await nextTick()
      if (cancelled || !options.enabled.value) return
      // Keep focus if the control survived, or the user has already moved elsewhere.
      const current = document.activeElement
      if (current === active && active?.isConnected && active.getClientRects().length) return
      if (current && current !== active && current !== document.body) return

      const candidates = options.overflow.value
        ? [options.overflowButton.value, options.queueButton.value]
        : [
            owner === 'lyrics' || owner === 'overflow' ? options.lyricsButton.value : null,
            owner === 'mode' ? options.modeButton.value : null,
            options.queueButton.value,
          ]
      for (const candidate of candidates) {
        const target = resolveRestorablePlayerTrigger(candidate)
        if (target?.getClientRects().length) {
          target.focus({ preventScroll: true })
          break
        }
      }
    },
  )
}
