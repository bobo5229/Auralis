import { BrowserWindow, dialog } from 'electron'
import { getNativeUiMessages } from './uiLocale'

export async function selectLibraryDirectory(): Promise<string | null> {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const result = await dialog.showOpenDialog(window, {
    properties: ['openDirectory'],
    title: getNativeUiMessages().selectFolder,
  })
  return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
}
