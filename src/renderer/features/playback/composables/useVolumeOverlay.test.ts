import { describe, expect, it, vi } from 'vitest'
import { isVolumeOverlayOpen, useVolumeOverlay } from './useVolumeOverlay'

describe('isVolumeOverlayOpen', () => {
  it('opens on hover, keyboard focus, or drag', () => {
    expect(
      isVolumeOverlayOpen({ hovering: true, focused: false, dragging: false, dismissed: false }),
    ).toBe(true)
    expect(
      isVolumeOverlayOpen({ hovering: false, focused: true, dragging: false, dismissed: false }),
    ).toBe(true)
    expect(
      isVolumeOverlayOpen({ hovering: false, focused: false, dragging: true, dismissed: false }),
    ).toBe(true)
  })

  it('closes when no interaction is present', () => {
    expect(
      isVolumeOverlayOpen({ hovering: false, focused: false, dragging: false, dismissed: false }),
    ).toBe(false)
  })

  it('stays closed after an explicit dismissal', () => {
    expect(
      isVolumeOverlayOpen({ hovering: true, focused: true, dragging: false, dismissed: true }),
    ).toBe(false)
  })
})

describe('useVolumeOverlay', () => {
  function setup() {
    const contains = vi.fn((_node: Node | null) => false)
    const group = { contains } as unknown as HTMLElement
    const overlay = useVolumeOverlay(() => group)
    return { overlay, contains }
  }

  it('opens on pointer enter and closes on leave', () => {
    const { overlay } = setup()
    expect(overlay.open.value).toBe(false)
    overlay.onPointerEnter()
    expect(overlay.open.value).toBe(true)
    overlay.onPointerLeave()
    expect(overlay.open.value).toBe(false)
  })

  it('opens on focus and stays open while hovering after blur', () => {
    const { overlay } = setup()
    overlay.onFocusIn({ relatedTarget: null } as unknown as FocusEvent)
    expect(overlay.open.value).toBe(true)
    overlay.onFocusOut()
    expect(overlay.open.value).toBe(false)

    overlay.onPointerEnter()
    overlay.onFocusIn({ relatedTarget: null } as unknown as FocusEvent)
    overlay.onFocusOut()
    expect(overlay.open.value).toBe(true)
  })

  it('keeps the overlay open while dragging after the pointer leaves', () => {
    const { overlay } = setup()
    overlay.onPointerEnter()
    overlay.onSliderPointerDown()
    overlay.onPointerLeave()
    expect(overlay.open.value).toBe(true)
    overlay.onSliderPointerUp()
    expect(overlay.open.value).toBe(false)
  })

  it('latches dismissal until a real entry from outside the group', () => {
    const { overlay, contains } = setup()
    overlay.onPointerEnter()
    expect(overlay.open.value).toBe(true)
    overlay.dismiss()
    expect(overlay.open.value).toBe(false)

    // Focus moving within the group (Escape focus-return to the trigger) must
    // not clear the latch.
    const slider = {} as Node
    contains.mockImplementation((node: Node | null) => node === slider)
    overlay.onFocusIn({ relatedTarget: slider } as unknown as FocusEvent)
    expect(overlay.open.value).toBe(false)

    // A fresh pointer entry reopens.
    overlay.onPointerEnter()
    expect(overlay.open.value).toBe(true)
  })

  it('reopens on focus arriving from outside the group', () => {
    const { overlay, contains } = setup()
    overlay.dismiss()
    expect(overlay.open.value).toBe(false)
    contains.mockReturnValue(false)
    overlay.onFocusIn({ relatedTarget: {} as Node } as unknown as FocusEvent)
    expect(overlay.open.value).toBe(true)
  })
})
