import { computed, ref } from 'vue'

export interface VolumeOverlaySignals {
  hovering: boolean
  focused: boolean
  dragging: boolean
  dismissed: boolean
}

/**
 * The narrow-window volume overlay is open while the volume group is hovered,
 * keyboard-focused (`focus-within` parity), or its slider is being dragged.
 * An explicit dismissal (Escape / outside pointerdown) latches closed until a
 * real entry from outside the group — a focus move within the group (e.g. the
 * Escape focus-return to the mute button) must not reopen it instantly.
 */
export function isVolumeOverlayOpen(input: VolumeOverlaySignals): boolean {
  if (input.dismissed) return false
  return input.hovering || input.focused || input.dragging
}

/**
 * Volume overlay state for the manuscript narrow-window layout. `getGroup`
 * returns the volume group element so focus entries can tell "arriving from
 * outside" (clears the dismissal latch) from "moving within the group" (does
 * not).
 */
export function useVolumeOverlay(getGroup: () => HTMLElement | null) {
  const hovering = ref(false)
  const focused = ref(false)
  const dragging = ref(false)
  const dismissed = ref(false)

  const open = computed(() =>
    isVolumeOverlayOpen({
      hovering: hovering.value,
      focused: focused.value,
      dragging: dragging.value,
      dismissed: dismissed.value,
    }),
  )

  function onPointerEnter(): void {
    hovering.value = true
    dismissed.value = false
  }

  function onPointerLeave(): void {
    hovering.value = false
  }

  function onFocusIn(event: FocusEvent): void {
    focused.value = true
    const related = event.relatedTarget
    const group = getGroup()
    // An explicit dismissal is latched until focus arrives from outside the
    // volume group; moving focus within the group (the Escape focus-return to
    // the mute button) must not reopen it.
    if (related === null || !group || !group.contains(related as Node)) {
      dismissed.value = false
    }
  }

  function onFocusOut(): void {
    focused.value = false
  }

  function onSliderPointerDown(): void {
    dragging.value = true
    dismissed.value = false
  }

  function onSliderPointerUp(): void {
    dragging.value = false
  }

  function dismiss(): void {
    dismissed.value = true
  }

  return {
    open,
    onPointerEnter,
    onPointerLeave,
    onFocusIn,
    onFocusOut,
    onSliderPointerDown,
    onSliderPointerUp,
    dismiss,
  }
}
