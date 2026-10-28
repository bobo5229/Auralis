import { onScopeDispose, readonly, ref, shallowRef } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import type { BadgeAchievements } from '@shared/types/badgeAchievements'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
export function useBadgeAchievements() {
  const achievements = shallowRef<BadgeAchievements | null>(null),
    hasError = ref(false)
  let revision = 0,
    disposed = false,
    timer: ReturnType<typeof setTimeout> | undefined
  async function refresh() {
    const owner = ++revision
    try {
      const result = await auralis.archive.getBadgeAchievements()
      if (!disposed && revision === owner) {
        achievements.value = result
        hasError.value = false
      }
    } catch (cause) {
      if (!disposed && revision === owner) {
        hasError.value = true
        rendererDiagnostics.warn({
          scope: 'archive.achievements',
          message: 'Could not load achievements',
          cause,
        })
      }
    }
  }
  const unsubscribe = auralis.library.onChanged((event) => {
    if (timer) clearTimeout(timer)
    if (event.reason === 'play-stats-reset') {
      revision++
      achievements.value = null
      void refresh()
    } else timer = setTimeout(() => void refresh(), 250)
  })
  void refresh()
  onScopeDispose(() => {
    disposed = true
    revision++
    if (timer) clearTimeout(timer)
    unsubscribe()
  })
  return { achievements: readonly(achievements), hasError: readonly(hasError), refresh }
}
