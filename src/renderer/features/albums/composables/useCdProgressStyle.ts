import { readonly, ref } from 'vue'

export type CdProgressStyle = 'wave' | 'comet'
const STORAGE_KEY = 'auralis-cd-progress-style'

function readPersisted(): CdProgressStyle {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'comet' ? 'comet' : 'wave'
  } catch {
    return 'wave'
  }
}

const cdProgressStyle = ref<CdProgressStyle>(readPersisted())

export function useCdProgressStyle() {
  function toggleCdProgressStyle(): void {
    cdProgressStyle.value = cdProgressStyle.value === 'wave' ? 'comet' : 'wave'
    try {
      localStorage.setItem(STORAGE_KEY, cdProgressStyle.value)
    } catch {
      // Keep switching usable for this session.
    }
  }
  return { cdProgressStyle: readonly(cdProgressStyle), toggleCdProgressStyle }
}
