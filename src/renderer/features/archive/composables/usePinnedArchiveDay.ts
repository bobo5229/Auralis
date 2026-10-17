import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { DailyPlayCount } from '@shared/types/listeningArchive'
import { latestActiveDay } from '../utils/latestActiveDay'

/**
 * Keeps the archive's pinned day in sync with the loaded year.
 * Without an explicit pin, the newest active day is shown. A year change always
 * drops the pin so the next year starts from its own latest active day.
 */
export function usePinnedArchiveDay(
  days: MaybeRefOrGetter<readonly DailyPlayCount[]>,
  year: MaybeRefOrGetter<number>,
) {
  const date = ref<string | null>(null)
  let explicit = false

  watch(
    () => toValue(year),
    () => {
      explicit = false
      date.value = null
    },
    { flush: 'sync' },
  )
  watch(
    () => toValue(days),
    (value) => {
      if (explicit) return
      date.value = latestActiveDay(value)
    },
    { immediate: true },
  )

  function pin(next: string) {
    explicit = true
    date.value = next
  }

  return { date, pin }
}
