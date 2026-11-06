import { isMainThread } from 'node:worker_threads'

/** Credits cover messages sent but not yet consumed, including progress and failures. */
export function createWorkerMessageCredits(limit: number): SharedArrayBuffer {
  const buffer = new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT)
  Atomics.store(new Int32Array(buffer), 0, limit)
  return buffer
}

export function takeWorkerMessageCredit(buffer: SharedArrayBuffer): void {
  // Only the producer worker may wait. The main process always releases without waiting.
  if (isMainThread) throw new Error('Worker message credits cannot block the main thread')
  const credits = new Int32Array(buffer)
  for (;;) {
    if (Atomics.load(credits, 1)) throw new Error('Worker message channel is closed')
    const available = Atomics.load(credits, 0)
    if (
      available > 0 &&
      Atomics.compareExchange(credits, 0, available, available - 1) === available
    ) {
      if (Atomics.load(credits, 1)) throw new Error('Worker message channel is closed')
      return
    }
    if (available === 0) Atomics.wait(credits, 0, 0)
  }
}

export function isWorkerMessageChannelOpen(buffer: SharedArrayBuffer | undefined): boolean {
  return !buffer || Atomics.load(new Int32Array(buffer), 1) === 0
}

export function closeWorkerMessageCredits(buffer: SharedArrayBuffer): void {
  const credits = new Int32Array(buffer)
  Atomics.store(credits, 1, 1)
  // Change the waited-on value as well: a notification immediately before wait()
  // must make that wait return "not-equal" instead of sleeping forever.
  Atomics.store(credits, 0, 1)
  Atomics.notify(credits, 0)
}

export function releaseWorkerMessageCredit(buffer: SharedArrayBuffer): void {
  Atomics.add(new Int32Array(buffer), 0, 1)
  Atomics.notify(new Int32Array(buffer), 0, 1)
}
