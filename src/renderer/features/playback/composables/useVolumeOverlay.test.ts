import { describe, expect, it } from 'vitest'
import { useVolumeOverlay } from './useVolumeOverlay'

describe('useVolumeOverlay', () => {
  it('opens only when explicitly requested', () => {
    const overlay = useVolumeOverlay()
    expect(overlay.open.value).toBe(false)
    overlay.show()
    expect(overlay.open.value).toBe(true)
  })

  it('dismisses an open overlay idempotently', () => {
    const overlay = useVolumeOverlay()
    overlay.show()
    overlay.dismiss()
    expect(overlay.open.value).toBe(false)
    overlay.dismiss()
    expect(overlay.open.value).toBe(false)
  })
})
