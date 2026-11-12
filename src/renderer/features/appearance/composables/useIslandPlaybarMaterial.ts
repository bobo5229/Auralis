import { readonly, ref } from 'vue'

export const ISLAND_PLAYBAR_MATERIAL_KEY = 'auralis-island-playbar-material'
export const ISLAND_PLAYBAR_MATERIALS = ['frosted', 'liquid'] as const
export type IslandPlaybarMaterial = (typeof ISLAND_PLAYBAR_MATERIALS)[number]

function readMaterial(): IslandPlaybarMaterial {
  try {
    const stored = localStorage.getItem(ISLAND_PLAYBAR_MATERIAL_KEY)
    return ISLAND_PLAYBAR_MATERIALS.find((value) => value === stored) ?? 'frosted'
  } catch {
    return 'frosted'
  }
}

const material = ref<IslandPlaybarMaterial>(readMaterial())
const persistFailed = ref(false)

function setMaterial(value: IslandPlaybarMaterial): void {
  if (!ISLAND_PLAYBAR_MATERIALS.some((candidate) => candidate === value)) return
  if (material.value === value && !persistFailed.value) return

  material.value = value
  try {
    localStorage.setItem(ISLAND_PLAYBAR_MATERIAL_KEY, value)
    persistFailed.value = false
  } catch {
    persistFailed.value = true
  }
}

export function useIslandPlaybarMaterial() {
  return {
    material: readonly(material),
    persistFailed: readonly(persistFailed),
    setMaterial,
  }
}
