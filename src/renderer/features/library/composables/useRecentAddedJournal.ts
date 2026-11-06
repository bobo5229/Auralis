import { onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { RecentAddedLibraryRange } from '../utils/recentAddedLibrary'
import {
  getRecentAddedJournalIncrementally,
  RecentJournalBuildStaleError,
  type JournalBuildOptions,
  type JournalDay,
} from '../utils/recentAddedJournal'

/** Owns cancellation and atomic publication of the derived collection view. */
export function useRecentAddedJournal(
  tracks: Readonly<Ref<readonly TrackListItem[]>>,
  range: Readonly<Ref<RecentAddedLibraryRange>>,
  now: Readonly<Ref<number>>,
  active: Readonly<Ref<boolean>>,
  reportError: (cause: unknown) => void,
  scheduling: Omit<JournalBuildOptions, 'isCurrent'> = {},
) {
  const journal = shallowRef<JournalDay[]>([])
  const loaded = ref(false)
  const isBuilding = ref(false)
  const error = shallowRef<unknown>(null)
  let revision = 0
  let disposed = false
  let committedRange: RecentAddedLibraryRange | undefined

  watch(
    [tracks, range, now, active],
    async ([rows, selectedRange, asOf, enabled]) => {
      const owner = ++revision
      if (!enabled) {
        isBuilding.value = false
        return
      }
      const isCurrent = () => !disposed && active.value && owner === revision
      if (selectedRange !== committedRange) loaded.value = false
      isBuilding.value = true
      error.value = null
      try {
        const result = await getRecentAddedJournalIncrementally(rows, selectedRange, asOf, {
          ...scheduling,
          isCurrent,
        })
        if (!isCurrent()) return
        journal.value = result
        committedRange = selectedRange
        loaded.value = true
      } catch (cause) {
        if (isCurrent() && !(cause instanceof RecentJournalBuildStaleError)) {
          error.value = cause
          reportError(cause)
        }
      } finally {
        if (isCurrent()) isBuilding.value = false
      }
    },
    { immediate: true, flush: 'sync' },
  )

  onScopeDispose(() => {
    disposed = true
    revision++
    isBuilding.value = false
  })
  return { journal, loaded, isBuilding, error }
}
