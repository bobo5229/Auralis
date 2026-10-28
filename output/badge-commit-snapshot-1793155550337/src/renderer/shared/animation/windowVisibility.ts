import type { AuralisApi } from '@shared/ipc/api'

/** Subscribe before requesting the snapshot; a newer event must win over a late reply. */
export function observeWindowVisibility(
  update: (visible: boolean) => void,
  api: Pick<AuralisApi['window'], 'getVisibility' | 'onVisibilityChanged'> | undefined = window
    .auralis?.window,
): () => void {
  if (!api) return () => {}
  let disposed = false
  let receivedEvent = false
  update(false)
  const unsubscribe = api.onVisibilityChanged(({ isVisible }) => {
    if (disposed) return
    receivedEvent = true
    update(isVisible)
  })
  void api.getVisibility().then(
    ({ isVisible }) => {
      if (!disposed && !receivedEvent) update(isVisible)
    },
    () => {
      // Keep the view usable if the initial query fails; later events still apply.
      if (!disposed && !receivedEvent) update(true)
    },
  )
  return () => {
    disposed = true
    unsubscribe()
  }
}
