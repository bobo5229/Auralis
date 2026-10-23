import { onScopeDispose, ref, shallowRef } from 'vue'

export function useArchiveDayBubble() {
  const date = ref<string | null>(null)
  const anchor = shallowRef<HTMLElement | null>(null)
  let showTimer: ReturnType<typeof setTimeout> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  function keepOpen() {
    clearTimeout(hideTimer)
  }
  function close() {
    clearTimeout(showTimer)
    keepOpen()
    date.value = null
    anchor.value = null
  }
  function preview(nextDate: string, element: HTMLElement, immediate = false) {
    if (disposed) return
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
    keepOpen()
    hideTimer = setTimeout(close, 150)
  }
  onScopeDispose(() => {
    disposed = true
    close()
  })
  return {
    date,
    anchor,
    preview,
    leave,
    keepOpen,
    close,
  }
}
