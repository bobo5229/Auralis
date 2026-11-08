/** Complete album navigation without delaying or animating either page. */
export function createAlbumDetailEntryTransition(
  _onPrepared?: () => void,
  onStarted?: () => Record<string, string> | void,
  onFinished?: () => void,
  _waitForColors?: (signal: AbortSignal) => Promise<void>,
  _onTimeout?: () => void,
) {
  return {
    configure: (_isReverse: boolean) => {},
    beforeEnter: (_element: Element) => {},
    enter: (_element: Element, done: () => void) => {
      onStarted?.()
      onFinished?.()
      done()
    },
    leave: (_element: Element, done: () => void) => done(),
    cancel: () => {},
  }
}
