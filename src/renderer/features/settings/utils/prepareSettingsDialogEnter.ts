/** Prepare first-use fonts and give the static blur layer time to paint before the panel fades. */
export function prepareSettingsDialogEnter(
  contentReady: Promise<void>,
  onReady: () => void,
): () => void {
  let cancelled = false
  let preparing = true
  let frame: number | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined

  function warmLayer(remaining: number): void {
    frame = requestAnimationFrame(() => {
      frame = undefined
      if (cancelled) return
      if (remaining > 1) warmLayer(remaining - 1)
      else onReady()
    })
  }

  function prepared(): void {
    if (cancelled || !preparing) return
    preparing = false
    clearTimeout(timeout)
    timeout = undefined
    warmLayer(3)
  }

  // A slow/missing chunk must still reveal a closable loading/error shell.
  timeout = setTimeout(prepared, 100)
  void contentReady
    .then(() => (cancelled ? undefined : document.fonts?.ready))
    .then(prepared, prepared)

  return () => {
    cancelled = true
    clearTimeout(timeout)
    if (frame !== undefined) cancelAnimationFrame(frame)
  }
}
