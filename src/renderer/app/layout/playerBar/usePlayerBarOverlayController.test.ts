import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  usePlayerBarOverlayController,
  type PlayerBarOverlayId,
} from './usePlayerBarOverlayController'

function setup() {
  const volumeOpen = ref(false)
  const dismiss = vi.fn(() => {
    volumeOpen.value = false
  })
  const controller = usePlayerBarOverlayController({
    open: computed(() => volumeOpen.value),
    dismiss,
  })

  return { controller, dismiss, volumeOpen }
}

function inside(...overlays: PlayerBarOverlayId[]): ReadonlySet<PlayerBarOverlayId> {
  return new Set(overlays)
}

describe('usePlayerBarOverlayController', () => {
  it('opens one panel, toggles it closed, and closes all overlays', () => {
    const { controller, dismiss, volumeOpen } = setup()

    controller.toggle('queue')
    expect(controller.activePanel.value).toBe('queue')
    expect(controller.isQueueOpen.value).toBe(true)

    controller.toggle('queue')
    expect(controller.activeOverlay.value).toBeNull()

    volumeOpen.value = true
    controller.closeAll()
    expect(controller.activeOverlay.value).toBeNull()
    expect(dismiss).toHaveBeenCalledTimes(3)
  })

  it('keeps exactly the last panel across every bidirectional rapid switch', () => {
    const panels = ['queue', 'mode', 'overflow', 'desktopLyricsLock'] as const

    for (const first of panels) {
      for (const second of panels) {
        if (first === second) continue
        const { controller } = setup()
        controller.toggle(first)
        controller.toggle(second)
        expect(controller.activePanel.value).toBe(second)

        controller.toggle(first)
        expect(controller.activePanel.value).toBe(first)
      }
    }
  })

  it('supports desktopLyricsLock panel toggle and computed open state', () => {
    const { controller } = setup()
    expect(controller.isDesktopLyricsLockOpen.value).toBe(false)

    controller.toggle('desktopLyricsLock')
    expect(controller.activePanel.value).toBe('desktopLyricsLock')
    expect(controller.isDesktopLyricsLockOpen.value).toBe(true)

    controller.toggle('desktopLyricsLock')
    expect(controller.activePanel.value).toBeNull()
    expect(controller.isDesktopLyricsLockOpen.value).toBe(false)
  })

  it('lets the retreat volume overlay claim exclusivity without duplicating its open state', () => {
    const { controller, dismiss, volumeOpen } = setup()
    controller.toggle('mode')

    controller.activateVolume()
    expect(controller.activePanel.value).toBeNull()
    expect(controller.isVolumeOpen.value).toBe(false)

    volumeOpen.value = true
    expect(controller.activeOverlay.value).toBe('volume')
    controller.toggle('queue')
    expect(controller.activePanel.value).toBe('queue')
    expect(volumeOpen.value).toBe(false)
    expect(dismiss).toHaveBeenCalled()
  })

  it('keeps an inside panel open and dismisses panels on an outside pointer', () => {
    const { controller } = setup()
    controller.toggle('queue')

    controller.dismissOutside(inside('queue'))
    expect(controller.activePanel.value).toBe('queue')

    controller.dismissOutside(inside())
    expect(controller.activePanel.value).toBeNull()
  })

  it('preserves the current event-order rule when panel and volume signals coexist', () => {
    const { controller, dismiss, volumeOpen } = setup()
    controller.toggle('queue')
    volumeOpen.value = true

    controller.dismissOutside(inside('queue'))
    expect(controller.activePanel.value).toBe('queue')
    expect(volumeOpen.value).toBe(true)

    controller.dismissOutside(inside('volume'))
    expect(controller.activePanel.value).toBeNull()
    expect(volumeOpen.value).toBe(true)

    controller.dismissOutside(inside())
    expect(volumeOpen.value).toBe(false)
    expect(dismiss).toHaveBeenCalled()
  })

  it('closes only layout-invalid overlays and makes repeated closes idempotent', () => {
    const { controller, dismiss } = setup()
    controller.toggle('overflow')

    controller.closeMany(['overflow', 'mode'])
    controller.closeMany(['overflow', 'mode'])
    expect(controller.activePanel.value).toBeNull()

    controller.toggle('queue')
    controller.closeMany(['overflow', 'mode'])
    controller.close('mode')
    expect(controller.activePanel.value).toBe('queue')
    expect(dismiss).toHaveBeenCalledTimes(2)
  })
})
