import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useRecentAlbumCarousel } from './useRecentAlbumCarousel'

afterEach(() => vi.useRealTimers())
function fixture(initial = ['a', 'b', 'c']) {
  vi.useFakeTimers()
  const scope = effectScope()
  const keys = ref(initial)
  const enabled = ref(true)
  const carousel = scope.run(() => useRecentAlbumCarousel(keys, enabled))!
  return { scope, keys, enabled, ...carousel }
}
describe('recent album carousel', () => {
  it('wraps both directions and restarts the delay after manual navigation', async () => {
    const f = fixture()
    try {
      await vi.advanceTimersByTimeAsync(5000)
      f.move(-1)
      expect(f.index.value).toBe(2)
      await vi.advanceTimersByTimeAsync(5000)
      expect(f.index.value).toBe(2)
      await vi.advanceTimersByTimeAsync(1000)
      expect(f.index.value).toBe(0)
    } finally {
      f.scope.stop()
    }
  })
  it('stops while unavailable or paused and disposes its timer', async () => {
    const f = fixture()
    f.enabled.value = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(12000)
    expect(f.index.value).toBe(0)
    f.enabled.value = true
    f.paused.value = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(12000)
    expect(f.index.value).toBe(0)
    f.paused.value = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(6000)
    expect(f.index.value).toBe(1)
    f.scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('preserves the selected album on refresh and resets when the range removes it', async () => {
    const f = fixture()
    try {
      f.move(1)
      f.keys.value = ['new', 'a', 'b', 'c']
      await nextTick()
      expect(f.index.value).toBe(2)
      f.keys.value = ['only']
      await nextTick()
      expect(f.index.value).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
      f.keys.value = []
      await nextTick()
      f.move(1)
      expect(f.index.value).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      f.scope.stop()
    }
  })
})
