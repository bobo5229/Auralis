export class DatabaseWriteAdmissionError extends Error {
  constructor(readonly reason: 'full' | 'timeout' | 'closed' | 'reentrant') {
    super(`Database write admission ${reason}`)
    this.name = 'DatabaseWriteAdmissionError'
  }
}

type Waiter = {
  kind: 'write' | 'exclusive'
  run: () => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/** Coordinates synchronous main-process mutations with a future exclusive writer. */
export class DatabaseWriteAdmission {
  private readonly queue: Waiter[] = []
  private exclusive = false
  private executing = false
  private stopped = false
  private exclusivesStopped = false
  private readonly idleWaiters = new Set<() => void>()
  private readonly availableCallbacks = new Set<() => void>()

  constructor(
    private readonly maxPending = 1024,
    private readonly timeoutMs = 30_000,
  ) {}

  runWrite<T>(operation: () => T): Promise<T> {
    return this.enqueue('write', (resolve, reject) => {
      this.executing = true
      try {
        resolve(operation())
      } catch (error) {
        reject(error)
      } finally {
        this.executing = false
      }
    })
  }

  /** Preserve synchronous event ordering when no exclusive writer is pending. */
  runWriteMaybe<T>(operation: () => T): T | Promise<T> {
    if (this.stopped) throw new DatabaseWriteAdmissionError('closed')
    if (this.executing) throw new DatabaseWriteAdmissionError('reentrant')
    if (this.exclusive || this.queue.length) return this.runWrite(operation)
    this.executing = true
    try {
      return operation()
    } finally {
      this.executing = false
      this.pump()
    }
  }

  acquireExclusive(): Promise<{ release(): void }> {
    if (this.exclusivesStopped) return Promise.reject(new DatabaseWriteAdmissionError('closed'))
    return this.enqueue('exclusive', (resolve) => {
      this.exclusive = true
      let released = false
      resolve({
        release: () => {
          if (released) return
          released = true
          this.exclusive = false
          this.pump()
        },
      })
    })
  }

  stopExclusive(): Promise<void> {
    this.exclusivesStopped = true
    for (const waiter of [...this.queue]) {
      if (waiter.kind !== 'exclusive') continue
      this.remove(waiter)
      waiter.reject(new DatabaseWriteAdmissionError('closed'))
    }
    return this.waitForIdle()
  }

  stopAccepting(): void {
    this.stopped = true
    this.exclusivesStopped = true
  }

  drain(): Promise<void> {
    return this.waitForIdle()
  }

  onAvailable(callback: () => void): void {
    this.availableCallbacks.add(callback)
    if (!this.exclusive && !this.executing && !this.queue.length) this.notifyAvailable()
  }

  private notifyAvailable(): void {
    for (const callback of this.availableCallbacks) {
      this.availableCallbacks.delete(callback)
      queueMicrotask(callback)
    }
  }

  private waitForIdle(): Promise<void> {
    if (!this.exclusive && !this.executing && this.queue.length === 0) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        this.idleWaiters.delete(done)
        reject(new DatabaseWriteAdmissionError('timeout'))
      }, this.timeoutMs)
      this.idleWaiters.add(done)
    })
  }

  private enqueue<T>(
    kind: Waiter['kind'],
    execute: (resolve: (value: T) => void, reject: (error: unknown) => void) => void,
  ): Promise<T> {
    if (this.stopped) return Promise.reject(new DatabaseWriteAdmissionError('closed'))
    if (this.executing) return Promise.reject(new DatabaseWriteAdmissionError('reentrant'))
    if (this.queue.length >= this.maxPending)
      return Promise.reject(new DatabaseWriteAdmissionError('full'))
    return new Promise<T>((resolve, reject) => {
      const waiter: Waiter = {
        kind,
        run: () => execute(resolve, reject),
        reject,
        timer: setTimeout(() => {
          this.remove(waiter)
          reject(new DatabaseWriteAdmissionError('timeout'))
          this.pump()
        }, this.timeoutMs),
      }
      this.queue.push(waiter)
      this.pump()
    })
  }

  private remove(waiter: Waiter): void {
    const index = this.queue.indexOf(waiter)
    if (index >= 0) this.queue.splice(index, 1)
    clearTimeout(waiter.timer)
  }

  private pump(): void {
    if (this.exclusive || this.executing) return
    while (!this.exclusive && this.queue.length) {
      const waiter = this.queue.shift()!
      clearTimeout(waiter.timer)
      waiter.run()
    }
    if (!this.exclusive && !this.executing && !this.queue.length) {
      for (const resolve of this.idleWaiters) resolve()
      this.idleWaiters.clear()
      this.notifyAvailable()
    }
  }
}
