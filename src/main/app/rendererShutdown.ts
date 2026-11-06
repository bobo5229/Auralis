interface Target {
  id: number
  isDestroyed(): boolean
  send(): void
}

/** Keep IPC and storage open while renderers drain their listening evidence. */
export function createRendererShutdownBarrier(warn: (message: string) => void, timeoutMs = 3000) {
  const waiting = new Map<number, (ok: boolean) => void>()
  const prepared = new Set<number>()
  return {
    acknowledge(id: number, ok: boolean) {
      waiting.get(id)?.(ok)
    },
    async prepare(targets: Target[]) {
      const results = await Promise.all(
        targets
          .filter((target) => !target.isDestroyed() && !prepared.has(target.id))
          .map(
            (target) =>
              new Promise<boolean>((resolve) => {
                const finish = (ok: boolean) => {
                  clearTimeout(timer)
                  waiting.delete(target.id)
                  // A successful drain is final for this renderer. Later shutdown
                  // phases can fail after IPC has stopped; retry those phases
                  // without requiring another acknowledgement over closed IPC.
                  if (ok) prepared.add(target.id)
                  if (!ok) warn('Renderer did not finish saving listening progress before shutdown')
                  resolve(ok)
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
      if (results.some((ok) => !ok)) throw new Error('Renderer did not finish shutdown')
    },
  }
}
