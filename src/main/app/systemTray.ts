import { Menu, nativeImage, Tray } from 'electron'
import { resolveAppIconPath } from './appIcon'
import { getNativeUiMessages, onNativeUiLocaleChanged } from './uiLocale'

export function createSystemTray(options: {
  restoreWindow(): void
  quit(): void
  reportError(error: unknown): void
}) {
  let tray: Tray | undefined
  let unsubscribe = () => {}
  try {
    const path = resolveAppIconPath()
    if (!path) throw new Error('System tray icon is missing')
    const icon = nativeImage.createFromPath(path)
    if (icon.isEmpty()) throw new Error('System tray icon is empty')
    tray = new Tray(icon.resize({ width: 16, height: 16 }))
    tray.setToolTip('Auralis')
    tray.on('click', options.restoreWindow)
    const updateMenu = (): void => {
      if (!tray || tray.isDestroyed()) return
      const messages = getNativeUiMessages()
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: messages.showMainWindow, click: options.restoreWindow },
          { type: 'separator' },
          { label: messages.quitApp, click: options.quit },
        ]),
      )
    }
    updateMenu()
    unsubscribe = onNativeUiLocaleChanged(updateMenu)
  } catch (error) {
    tray?.removeAllListeners()
    if (tray && !tray.isDestroyed()) tray.destroy()
    tray = undefined
    options.reportError(error)
  }
  return {
    isAvailable: () => !!tray && !tray.isDestroyed(),
    dispose(): void {
      unsubscribe()
      tray?.removeAllListeners()
      if (tray && !tray.isDestroyed()) tray.destroy()
      tray = undefined
    },
  }
}
