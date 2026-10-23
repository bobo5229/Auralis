import type { BrowserWindow } from 'electron'
import type { WindowCloseBehavior, WindowBehaviorState } from '@shared/types/windowBehavior'

type ManagedWindow = Pick<
  BrowserWindow,
  | 'isDestroyed'
  | 'isMinimized'
  | 'restore'
  | 'show'
  | 'focus'
  | 'hide'
  | 'on'
  | 'removeListener'
>

export function createWindowBehaviorController(options: {
  preference: { get(): WindowCloseBehavior; set(value: WindowCloseBehavior): void }
  trayAvailable(): boolean
  quit(): void
}) {
  let quitting = false
  let closeAllowed = false
  let currentWindow: ManagedWindow | undefined
  const windows = new Map<ManagedWindow, () => void>()

  function beginQuit(): void {
    quitting = true
  }

  function allowWindowClose(): void {
    quitting = true
    closeAllowed = true
  }

  function requestQuit(): void {
    if (quitting) return
    beginQuit()
    options.quit()
  }

  function restoreWindow(): boolean {
    if (!currentWindow || currentWindow.isDestroyed()) return false
    if (currentWindow.isMinimized()) currentWindow.restore()
    currentWindow.show()
    currentWindow.focus()
    return true
  }

  return {
    beginQuit,
    allowWindowClose,
    requestQuit,
    restoreWindow,
    shutdownFailed(): void {
      quitting = false
      closeAllowed = false
      restoreWindow()
    },
    getState(): WindowBehaviorState {
      return { behavior: options.preference.get(), trayAvailable: options.trayAvailable() }
    },
    setBehavior(value: WindowCloseBehavior): WindowBehaviorState {
      if (quitting) throw new Error('Application is shutting down')
      if (value === 'tray' && !options.trayAvailable())
        throw new Error('System tray is unavailable')
      options.preference.set(value)
      return this.getState()
    },
    attachWindow(window: ManagedWindow): void {
      if (windows.has(window) || window.isDestroyed()) return
      currentWindow = window
      const onClose = (event: { preventDefault(): void }): void => {
        if (closeAllowed) return
        event.preventDefault()
        // Keep the renderer available if asynchronous service shutdown needs a retry.
        if (quitting) return
        switch (options.preference.get()) {
          case 'quit':
            requestQuit()
            break
          case 'tray':
            if (options.trayAvailable()) window.hide()
            else restoreWindow()
            break
        }
      }
      const onClosed = (): void => {
        if (currentWindow === window) currentWindow = undefined
        windows.get(window)?.()
        windows.delete(window)
      }
      window.on('close', onClose)
      window.on('closed', onClosed)
      window.on('query-session-end', allowWindowClose)
      windows.set(window, () => {
        window.removeListener('close', onClose)
        window.removeListener('closed', onClosed)
        window.removeListener('query-session-end', allowWindowClose)
      })
    },
    dispose(): void {
      for (const dispose of windows.values()) dispose()
      windows.clear()
      currentWindow = undefined
    },
  }
}

export type WindowBehaviorController = ReturnType<typeof createWindowBehaviorController>
