import { readonly, ref } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import type { MiniPlayerWindowState } from '@shared/ipc/contracts'

export type PlayerDisplayMode = 'normal' | 'fullscreen' | 'mini'

const displayMode = ref<PlayerDisplayMode>('normal')

/**
 * Shared renderer display state for the mutually-exclusive player presentations.
 * Native mini-window ownership is synchronised by the app shell; this composable
 * deliberately only describes which renderer presentation is currently visible.
 */
export function usePlayerDisplayMode() {
  function applyMiniPlayerWindowState(state: MiniPlayerWindowState): void {
    displayMode.value = state.mode
  }

  function showNormalPlayer(): void {
    displayMode.value = 'normal'
  }

  function showFullscreenPlayer(): void {
    displayMode.value = 'fullscreen'
  }

  function showMiniPlayer(): void {
    displayMode.value = 'mini'
  }

  async function enterMiniPlayer(): Promise<void> {
    applyMiniPlayerWindowState(await auralis.window.enterMiniPlayer())
  }

  async function restoreFromMiniPlayer(): Promise<void> {
    applyMiniPlayerWindowState(await auralis.window.restoreFromMiniPlayer())
  }

  async function syncMiniPlayerWindowState(): Promise<void> {
    applyMiniPlayerWindowState(await auralis.window.getMiniPlayerState())
  }

  function onMiniPlayerWindowStateChanged(
    callback?: (state: MiniPlayerWindowState) => void,
  ): () => void {
    return auralis.window.onMiniPlayerStateChanged((state) => {
      applyMiniPlayerWindowState(state)
      callback?.(state)
    })
  }

  return {
    displayMode: readonly(displayMode),
    showNormalPlayer,
    showFullscreenPlayer,
    showMiniPlayer,
    enterMiniPlayer,
    restoreFromMiniPlayer,
    syncMiniPlayerWindowState,
    onMiniPlayerWindowStateChanged,
  }
}
