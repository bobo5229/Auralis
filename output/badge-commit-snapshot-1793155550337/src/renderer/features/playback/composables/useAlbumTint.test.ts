import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlbumTint } from './useAlbumTint'

async function flushWatch(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useAlbumTint', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not apply a tint while disabled', async () => {
    const albumTint = ref<string | null>('rgb(1 2 3)')
    const enabled = ref(false)
    const { activeAlbumTint, previousAlbumTint, hasActiveAlbumTint } = useAlbumTint(
      albumTint,
      enabled,
    )

    await flushWatch()

    expect(hasActiveAlbumTint.value).toBe(false)
    expect(activeAlbumTint.value).toBeNull()
    expect(previousAlbumTint.value).toBeNull()
  })

  it('clears an existing tint and timer when disabled mid-play', async () => {
    const albumTint = ref<string | null>('rgb(1 2 3)')
    const enabled = ref(true)
    const { activeAlbumTint, previousAlbumTint, hasActiveAlbumTint, stop } = useAlbumTint(
      albumTint,
      enabled,
    )
    await flushWatch()
    expect(activeAlbumTint.value).toBe('rgb(1 2 3)')

    enabled.value = false
    await flushWatch()

    expect(hasActiveAlbumTint.value).toBe(false)
    expect(activeAlbumTint.value).toBeNull()
    expect(previousAlbumTint.value).toBeNull()

    // The pending crossfade timer must be gone too — no late previous-tint flash.
    vi.advanceTimersByTime(500)
    expect(previousAlbumTint.value).toBeNull()
    stop()
  })

  it('crossfades: new tint becomes previous, then clears after 420ms', async () => {
    const albumTint = ref<string | null>('rgb(1 2 3)')
    const { activeAlbumTint, previousAlbumTint, stop } = useAlbumTint(albumTint, ref(true))
    await flushWatch()

    albumTint.value = 'rgb(4 5 6)'
    await flushWatch()
    expect(previousAlbumTint.value).toBe('rgb(1 2 3)')
    expect(activeAlbumTint.value).toBe('rgb(4 5 6)')

    vi.advanceTimersByTime(420)
    expect(previousAlbumTint.value).toBeNull()
    expect(activeAlbumTint.value).toBe('rgb(4 5 6)')
    stop()
  })

  it('re-enabling restores the current tint only, without a stale previous layer', async () => {
    const albumTint = ref<string | null>('rgb(7 8 9)')
    const enabled = ref(false)
    const { activeAlbumTint, previousAlbumTint, stop } = useAlbumTint(albumTint, enabled)
    await flushWatch()

    enabled.value = true
    await flushWatch()

    expect(activeAlbumTint.value).toBe('rgb(7 8 9)')
    expect(previousAlbumTint.value).toBeNull()
    stop()
  })

  it('repeated track switches never leak a stale previous tint', async () => {
    const albumTint = ref<string | null>('rgb(1 1 1)')
    const { activeAlbumTint, previousAlbumTint, stop } = useAlbumTint(albumTint, ref(true))
    await flushWatch()

    for (const color of ['rgb(2 2 2)', 'rgb(3 3 3)', 'rgb(4 4 4)']) {
      albumTint.value = color
      await flushWatch()
      vi.advanceTimersByTime(500)
      await flushWatch()
    }

    expect(activeAlbumTint.value).toBe('rgb(4 4 4)')
    expect(previousAlbumTint.value).toBeNull()
    stop()
  })
})
