import { computed, ref, type Ref } from 'vue'

export type PlayerBarOverlayId = 'queue' | 'mode' | 'overflow' | 'volume' | 'desktopLyricsLock'
export type PlayerBarToggleOverlayId = Exclude<PlayerBarOverlayId, 'volume'>

export interface PlayerBarVolumeOverlayPort {
  open: Readonly<Ref<boolean>>
  dismiss: () => void
}

export function usePlayerBarOverlayController(volume: PlayerBarVolumeOverlayPort) {
  const activePanelState = ref<PlayerBarToggleOverlayId | null>(null)

  const activePanel = computed(() => activePanelState.value)
  const activeOverlay = computed<PlayerBarOverlayId | null>(
    () => activePanelState.value ?? (volume.open.value ? 'volume' : null),
  )
  const isQueueOpen = computed(() => activePanelState.value === 'queue')
  const isModeMenuOpen = computed(() => activePanelState.value === 'mode')
  const isOverflowOpen = computed(() => activePanelState.value === 'overflow')
  const isDesktopLyricsLockOpen = computed(() => activePanelState.value === 'desktopLyricsLock')
  const isVolumeOpen = computed(() => volume.open.value)

  function toggle(target: PlayerBarToggleOverlayId): void {
    if (activePanelState.value === target) {
      closeAll()
      return
    }

    volume.dismiss()
    activePanelState.value = target
  }

  function activateVolume(): void {
    activePanelState.value = null
  }

  function close(target: PlayerBarOverlayId): void {
    if (target === 'volume') {
      volume.dismiss()
      return
    }

    if (activePanelState.value === target) {
      activePanelState.value = null
    }
  }

  function closeAll(): void {
    activePanelState.value = null
    volume.dismiss()
  }

  function closeMany(targets: readonly PlayerBarOverlayId[]): void {
    const targetSet = new Set(targets)
    const activePanel = activePanelState.value
    if (activePanel && targetSet.has(activePanel)) {
      activePanelState.value = null
    }
    if (targetSet.has('volume')) {
      volume.dismiss()
    }
  }

  function dismissOutside(inside: ReadonlySet<PlayerBarOverlayId>): void {
    const activePanel = activePanelState.value
    if (activePanel) {
      if (inside.has(activePanel)) return
      activePanelState.value = null
    }

    if (!volume.open.value || inside.has('volume')) return
    volume.dismiss()
  }

  return {
    activePanel,
    activeOverlay,
    isQueueOpen,
    isModeMenuOpen,
    isOverflowOpen,
    isDesktopLyricsLockOpen,
    isVolumeOpen,
    toggle,
    activateVolume,
    close,
    closeAll,
    closeMany,
    dismissOutside,
  }
}
