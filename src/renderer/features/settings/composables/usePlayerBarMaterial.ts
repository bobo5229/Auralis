import { ref } from 'vue'

export type PlayerBarMaterial = 'cover-tint' | 'liquid-glass'

const PLAYER_BAR_MATERIAL_KEY = 'auralis-player-bar-material'
const DEFAULT_PLAYER_BAR_MATERIAL: PlayerBarMaterial = 'cover-tint'

function readPersistedPlayerBarMaterial(): PlayerBarMaterial {
  try {
    const persistedValue = localStorage.getItem(PLAYER_BAR_MATERIAL_KEY)

    return persistedValue === 'liquid-glass' ? persistedValue : DEFAULT_PLAYER_BAR_MATERIAL
  } catch {
    return DEFAULT_PLAYER_BAR_MATERIAL
  }
}

export const playerBarMaterial = ref<PlayerBarMaterial>(readPersistedPlayerBarMaterial())

export function setPlayerBarMaterial(value: PlayerBarMaterial): void {
  if (playerBarMaterial.value === value) return

  playerBarMaterial.value = value

  try {
    localStorage.setItem(PLAYER_BAR_MATERIAL_KEY, value)
  } catch {
    // Keep the current in-memory preference when storage is unavailable.
  }
}

export function usePlayerBarMaterial() {
  return {
    playerBarMaterial,
    setPlayerBarMaterial,
  }
}
