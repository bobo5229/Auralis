export interface StartupAlbumEnvironment<T> {
  prepare(signal: AbortSignal): Promise<T | null>
  isReady(): boolean
  canShow(): boolean
  onReady(listener: () => void): () => void
  onInteract(listener: () => void): () => void
  onFailed(listener: () => void): () => void
  show(value: T): void
  reportError(error: unknown): void
}

/** Preparation never delays splash retirement. Late work cannot open a dismissed session. */
export function startStartupAlbum<T>(env: StartupAlbumEnvironment<T>): () => void {
  const abort = new AbortController()
  let stopped = false
  let prepared = false
  let value: T | null = null
  let waiting = false
  let deadline = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const cleanup: Array<() => void> = []
  function stop(): void {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    abort.abort()
    cleanup.splice(0).forEach((unsubscribe) => unsubscribe())
  }
  function tryShow(): void {
    if (stopped || !env.isReady()) return
    if (!waiting) {
      waiting = true
      deadline = performance.now() + 1000
      cleanup.push(env.onInteract(stop))
      timer = setTimeout(stop, 1000)
    }
    // Native visibility can change long after retirement, even before a delayed timer runs.
    if (performance.now() >= deadline) {
      stop()
      return
    }
    if (prepared && (value === null || env.canShow())) {
      const result = value
      stop()
      if (result !== null) env.show(result)
    }
  }
  cleanup.push(env.onReady(tryShow), env.onFailed(stop))
  void Promise.resolve()
    .then(() => env.prepare(abort.signal))
    .then((result) => {
      if (stopped) return
      prepared = true
      value = result
      tryShow()
    })
    .catch((error: unknown) => {
      if (stopped) return
      stop()
      env.reportError(error)
    })
  tryShow()
  return stop
}
