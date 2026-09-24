import { readonly, ref } from 'vue'

/**
 * Starts a library scan from the first configured root.
 * Shared by shell chrome so any page with the sidebar can refresh.
 */
export function useLibraryScanStart(options: {
  getLibraryRoots: () => Promise<ReadonlyArray<{ id: number }>>
  startLibraryScan: (rootId: number) => Promise<unknown>
}) {
  const isStartingLibraryRefresh = ref(false)

  async function refreshLibrary(): Promise<void> {
    if (isStartingLibraryRefresh.value) return

    isStartingLibraryRefresh.value = true
    try {
      const roots = await options.getLibraryRoots()
      const activeRoot = roots[0]
      if (!activeRoot) return
      await options.startLibraryScan(activeRoot.id)
    } finally {
      isStartingLibraryRefresh.value = false
    }
  }

  return {
    isStartingLibraryRefresh: readonly(isStartingLibraryRefresh),
    refreshLibrary,
  }
}
