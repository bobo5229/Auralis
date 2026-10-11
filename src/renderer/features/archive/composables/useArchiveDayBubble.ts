import { onScopeDispose, ref, shallowRef } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { DailyTopTrack } from '@shared/types/listeningArchive'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

export function useArchiveDayBubble(archive: Pick<AuralisApi['archive'], 'getDayTopTracks'>) {
  const date = ref<string | null>(null)
  const anchor = shallowRef<HTMLElement | null>(null)
  const expanded = ref(false)
  const tracks = shallowRef<DailyTopTrack[]>([])
  const loading = ref(false)
  const failed = ref(false)
  let showTimer: ReturnType<typeof setTimeout> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let revision = 0
  let disposed = false

  function keepOpen() {
    clearTimeout(hideTimer)
  }
  function close() {
    clearTimeout(showTimer)
    keepOpen()
    revision++
    date.value = null
    anchor.value = null
    expanded.value = false
    tracks.value = []
    loading.value = false
    failed.value = false
  }
  async function refresh() {
    if (disposed || !expanded.value || !date.value) return
    const currentDate = date.value
    const request = ++revision
    tracks.value = []
    loading.value = true
    failed.value = false
    try {
      const result = await archive.getDayTopTracks(currentDate)
      if (!disposed && request === revision) tracks.value = result
    } catch (cause) {
      if (!disposed && request === revision) {
        failed.value = true
        rendererDiagnostics.warn({
          scope: 'archive.day',
          message: 'Could not load daily top tracks',
          cause,
        })
      }
    } finally {
      if (!disposed && request === revision) loading.value = false
    }
  }
  function preview(nextDate: string, element: HTMLElement, immediate = false) {
    if (disposed || expanded.value) return
    keepOpen()
    clearTimeout(showTimer)
    const show = () => {
      if (disposed) return
      date.value = nextDate
      anchor.value = element
    }
    if (immediate) show()
    else showTimer = setTimeout(show, 150)
  }
  function leave() {
    clearTimeout(showTimer)
    if (!expanded.value) {
      keepOpen()
      hideTimer = setTimeout(close, 150)
    }
  }
  function select(nextDate: string, element: HTMLElement) {
    if (disposed) return
    if (date.value === nextDate && expanded.value) {
      close()
      return
    }
    clearTimeout(showTimer)
    keepOpen()
    date.value = nextDate
    anchor.value = element
    expanded.value = true
    void refresh()
  }
  onScopeDispose(() => {
    disposed = true
    close()
  })
  return {
    date,
    anchor,
    expanded,
    tracks,
    loading,
    failed,
    preview,
    leave,
    keepOpen,
    select,
    close,
    refresh,
  }
}
