import { effectScope, nextTick } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { useBadgeAchievements } from './useBadgeAchievements'

const api = vi.hoisted(() => ({
  getBadgeAchievements: vi.fn(),
  onBadgeAchievementsChanged: vi.fn(),
  onLibraryChanged: vi.fn(),
}))
vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: {
    archive: {
      getBadgeAchievements: api.getBadgeAchievements,
      onBadgeAchievementsChanged: api.onBadgeAchievementsChanged,
    },
    library: { onChanged: api.onLibraryChanged },
  },
}))

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('refreshes on badge events and library changes, and unsubscribes on disposal', async () => {
  vi.useFakeTimers()
  let badgeChanged!: () => void
  let libraryChanged!: (event: { reason: string }) => void
  const unsubscribeBadge = vi.fn()
  const unsubscribeLibrary = vi.fn()
  api.getBadgeAchievements.mockResolvedValue({ epoch: 0 })
  api.onBadgeAchievementsChanged.mockImplementation((callback) => {
    badgeChanged = callback
    return unsubscribeBadge
  })
  api.onLibraryChanged.mockImplementation((callback) => {
    libraryChanged = callback
    return unsubscribeLibrary
  })
  const scope = effectScope()
  const state = scope.run(useBadgeAchievements)!
  await nextTick()
  expect(api.getBadgeAchievements).toHaveBeenCalledTimes(1)
  badgeChanged()
  badgeChanged()
  await vi.advanceTimersByTimeAsync(250)
  expect(api.getBadgeAchievements).toHaveBeenCalledTimes(2)
  libraryChanged({ reason: 'track-added' })
  await vi.advanceTimersByTimeAsync(250)
  expect(api.getBadgeAchievements).toHaveBeenCalledTimes(3)
  api.getBadgeAchievements.mockResolvedValue({ epoch: 1 })
  libraryChanged({ reason: 'play-stats-reset' })
  expect(state.achievements.value).toBeNull()
  await nextTick()
  expect(state.achievements.value?.epoch).toBe(1)
  expect(api.getBadgeAchievements).toHaveBeenCalledTimes(4)
  badgeChanged()
  scope.stop()
  await vi.advanceTimersByTimeAsync(250)
  expect(api.getBadgeAchievements).toHaveBeenCalledTimes(4)
  expect(unsubscribeBadge).toHaveBeenCalledOnce()
  expect(unsubscribeLibrary).toHaveBeenCalledOnce()
})
