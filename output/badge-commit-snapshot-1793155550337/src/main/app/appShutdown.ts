interface AppShutdownOptions {
  shutdownServices(): Promise<void>
  closeResources(): void
  quit(): void
  reportError(error: unknown): void
}

/** Keep the database and logger alive until all service work has settled. */
export function createAppShutdownHandler(options: AppShutdownOptions) {
  let pending: Promise<void> | null = null
  let complete = false

  return (event: { preventDefault(): void }): void => {
    if (complete) return
    event.preventDefault()
    if (pending) return

    pending = Promise.resolve()
      .then(() => options.shutdownServices())
      .then(() => {
        options.closeResources()
        complete = true
        options.quit()
      })
      .catch((error: unknown) => {
        // Leave resources open on failure; a later quit request can retry safely.
        pending = null
        options.reportError(error)
      })
  }
}
