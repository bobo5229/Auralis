import { computed, readonly, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

/** Album-tint crossfade duration (previous layer fades out over 420ms). */
const TINT_CROSSFADE_MS = 420

/**
 * Drives the PlayerBar album-tint crossfade layers. The tint only exists in the
 * modern player presentation: while `enabled` is false the timer is cleared and
 * both layers reset to null so the manuscript surface never renders (or keeps)
 * a cover-derived color (Phase 18 TECHDOC §6.2). Re-enabling restores the
 * current tint once — never a stale cover.
 */
export function useAlbumTint(albumTint: Ref<string | null>, enabled: MaybeRefOrGetter<boolean>) {
  const activeAlbumTint = ref<string | null>(null)
  const previousAlbumTint = ref<string | null>(null)
  let tintTimer: ReturnType<typeof setTimeout> | null = null

  function clearTintTimer(): void {
    if (tintTimer) {
      clearTimeout(tintTimer)
      tintTimer = null
    }
  }

  function resetTint(): void {
    clearTintTimer()
    previousAlbumTint.value = null
    activeAlbumTint.value = null
  }

  const stopWatch = watch(
    [albumTint, () => toValue(enabled) ?? true],
    ([nextTint, isEnabled]) => {
      if (!isEnabled) {
        resetTint()
        return
      }

      if (nextTint === activeAlbumTint.value) {
        return
      }

      clearTintTimer()
      previousAlbumTint.value = activeAlbumTint.value
      activeAlbumTint.value = nextTint

      tintTimer = setTimeout(() => {
        previousAlbumTint.value = null
        tintTimer = null
      }, TINT_CROSSFADE_MS)
    },
    { immediate: true },
  )

  return {
    activeAlbumTint: readonly(activeAlbumTint),
    previousAlbumTint: readonly(previousAlbumTint),
    hasActiveAlbumTint: computed(() => activeAlbumTint.value !== null),
    stop() {
      clearTintTimer()
      stopWatch()
    },
  }
}
