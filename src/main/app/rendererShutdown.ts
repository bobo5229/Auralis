interface Target {
  id: number
  isDestroyed(): boolean
  send(): void
}

/** Keep IPC and storage open while renderers drain their listening evidence. */
export function createRendererShutdownBarrier(warn: (message: string) => void, timeoutMs = 3000) {
  const waiting = new Map<number, (ok: boolean) => void>()
  return {
    acknowledge(id: number, ok: boolean) {
      waiting.get(id)?.(ok)
    },
    async prepare(targets: Target[]) {
      await Promise.all(
        targets
          .filter((target) => !target.isDestroyed())
          .map(
            (target) =>
              new Promise<void>((resolve) => {
                const finish = (ok: boolean) => {
                  clearTimeout(timer)
                  waiting.delete(target.id)
                  if (!ok) warn('Renderer did not finish saving listening progress before shutdown')
                  resolve()
                }
                const timer = setTimeout(() => finish(false), timeoutMs)
                waiting.set(target.id, finish)
                try {
                  target.send()
                } catch {
                  finish(false)
                }
              }),
          ),
      )
    },
  }
}
