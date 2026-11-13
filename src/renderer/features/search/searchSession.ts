import { reactive } from 'vue'

// In-memory state preserves the return path without storing search history on disk.
export const searchSession = reactive({
  query: '', category: 'all' as 'all' | 'songs' | 'albums',
  scrollTop: 0, songLimit: 0, albumLimit: 36, selectedId: null as number | null,
})
