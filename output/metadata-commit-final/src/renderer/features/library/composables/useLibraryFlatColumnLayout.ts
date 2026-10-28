import { computed, ref, readonly, watch, type Ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import {
  LIBRARY_FLAT_COLUMN_IDS,
  LIBRARY_FLAT_COLUMN_PREFERENCE_STORAGE_KEY,
  LIBRARY_FLAT_COLUMN_PREFERENCE_VERSION,
  parseLibraryFlatColumnPreferences,
  resolveLibraryFlatColumnLayout,
  type LibraryFlatColumnId,
  type LibraryFlatColumnLayout,
  type LibraryFlatColumnWidthPreferences,
  type LibraryFlatColumnWidths,
} from '../utils/libraryFlatColumnLayout'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function createLibraryFlatColumnPreferenceStore(
  storage: StorageLike,
  onError: (cause: unknown, operation: 'read' | 'write') => void = () => undefined,
) {
  const widths = ref<LibraryFlatColumnWidthPreferences>({})
  try {
    widths.value = parseLibraryFlatColumnPreferences(
      storage.getItem(LIBRARY_FLAT_COLUMN_PREFERENCE_STORAGE_KEY),
    )
  } catch (cause) {
    onError(cause, 'read')
  }

  function commit(
    nextWidths: LibraryFlatColumnWidths,
    changedColumnIds: readonly LibraryFlatColumnId[],
  ) {
    const merged = { ...widths.value }
    for (const column of changedColumnIds) merged[column] = nextWidths[column]
    widths.value = merged
    try {
      storage.setItem(
        LIBRARY_FLAT_COLUMN_PREFERENCE_STORAGE_KEY,
        JSON.stringify({ version: LIBRARY_FLAT_COLUMN_PREFERENCE_VERSION, widths: merged }),
      )
    } catch (cause) {
      onError(cause, 'write')
    }
  }

  function reset(): void {
    widths.value = {}
    try {
      storage.setItem(
        LIBRARY_FLAT_COLUMN_PREFERENCE_STORAGE_KEY,
        JSON.stringify({ version: LIBRARY_FLAT_COLUMN_PREFERENCE_VERSION, widths: {} }),
      )
    } catch (cause) {
      onError(cause, 'write')
    }
  }

  return { widths, commit, reset }
}

function createSessionPreferenceStore() {
  const storage: StorageLike = {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  }
  return createLibraryFlatColumnPreferenceStore(storage, (cause, operation) => {
    rendererDiagnostics.warn({
      scope: 'library.flat-column-layout',
      message:
        operation === 'read'
          ? 'Could not read flat column widths; using defaults for this session'
          : 'Could not save flat column widths; keeping them for this session',
      cause,
    })
  })
}

let preferenceStore: ReturnType<typeof createSessionPreferenceStore> | null = null

function getPreferenceStore() {
  if (!preferenceStore) preferenceStore = createSessionPreferenceStore()
  return preferenceStore
}

export function createLibraryFlatColumnLayoutController(options: {
  containerWidth: Ref<number>
  showPlayCount: Ref<boolean>
  preferenceStore: ReturnType<typeof createLibraryFlatColumnPreferenceStore>
}) {
  const store = options.preferenceStore
  const previewWidths = ref<LibraryFlatColumnWidthPreferences | null>(null)
  const settledWidths = ref<LibraryFlatColumnWidthPreferences | null>(null)
  const layout = computed<LibraryFlatColumnLayout>(() =>
    resolveLibraryFlatColumnLayout({
      containerWidth: options.containerWidth.value,
      showPlayCount: options.showPlayCount.value,
      preferredWidths: {
        ...store.widths.value,
        ...settledWidths.value,
        ...previewWidths.value,
      },
    }),
  )

  watch(
    [options.containerWidth, options.showPlayCount],
    () => {
      settledWidths.value = null
      previewWidths.value = null
    },
    { flush: 'sync' },
  )

  function preview(nextWidths: LibraryFlatColumnWidths): void {
    const values: LibraryFlatColumnWidthPreferences = { ...previewWidths.value }
    for (const column of layout.value.visibleColumnIds) values[column] = nextWidths[column]
    previewWidths.value = values
  }

  function commit(
    nextWidths: LibraryFlatColumnWidths,
    changedColumnIds: readonly LibraryFlatColumnId[] = layout.value.visibleColumnIds,
  ): void {
    store.commit(nextWidths, changedColumnIds)
    const displayedWidths: LibraryFlatColumnWidthPreferences = {}
    for (const column of layout.value.visibleColumnIds) displayedWidths[column] = nextWidths[column]
    settledWidths.value = displayedWidths
    previewWidths.value = null
  }

  function cancelPreview(): void {
    previewWidths.value = null
  }

  function reset(): void {
    previewWidths.value = null
    settledWidths.value = null
    store.reset()
  }

  return {
    layout,
    preferences: readonly(store.widths),
    preview,
    commit,
    cancelPreview,
    reset,
    columnIds: LIBRARY_FLAT_COLUMN_IDS,
  }
}

export function useLibraryFlatColumnLayout(options: {
  containerWidth: Ref<number>
  showPlayCount: Ref<boolean>
}) {
  return createLibraryFlatColumnLayoutController({
    ...options,
    preferenceStore: getPreferenceStore(),
  })
}
