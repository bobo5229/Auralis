import { onScopeDispose } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import { observeWindowVisibility } from '@renderer/shared/animation/windowVisibility'
import type { LibraryChangedReason } from '@shared/ipc/contracts'

const RELEVANT_REASONS = new Set<LibraryChangedReason>([
  'play-stats-updated',
  'play-stats-reset',
  'metadata-refresh',
  'track-added',
  'track-missing',
  'track-restored',
  'track-relocated',
  'file-change',
])

/** Coalesce library changes while hidden and refresh once the page becomes visible. */
export function useArchiveLibraryRefresh(refresh: () => Promise<void>): void {
  let windowVisible = true
  let dirty = false
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function isVisible(): boolean {
    return windowVisible && !document.hidden
  }

  function scheduleRefresh(): void {
    if (disposed || !dirty || !isVisible()) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      if (disposed || !isVisible()) return
      dirty = false
      void refresh()
    }, 150)
  }

  function syncVisibility(): void {
    if (isVisible()) scheduleRefresh()
    else {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const stopVisibility = observeWindowVisibility((visible) => {
    windowVisible = visible
    syncVisibility()
  }, auralis.window)
  document.addEventListener('visibilitychange', syncVisibility)
  const stopLibrary = auralis.library.onChanged((event) => {
    if (disposed || !RELEVANT_REASONS.has(event.reason)) return
    dirty = true
    scheduleRefresh()
  })

  onScopeDispose(() => {
    disposed = true
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', syncVisibility)
    stopLibrary()
    stopVisibility()
  })
}
