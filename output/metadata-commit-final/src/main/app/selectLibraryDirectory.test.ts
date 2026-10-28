import { beforeEach, expect, it, vi } from 'vitest'
import { BrowserWindow, dialog } from 'electron'
import { selectLibraryDirectory } from './selectLibraryDirectory'

vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: vi.fn(), getAllWindows: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
}))
vi.mock('./uiLocale', () => ({ getNativeUiMessages: () => ({ selectFolder: '选择目录' }) }))

beforeEach(() => vi.resetAllMocks())

it.each([true, false])('uses the focused window or first window: focused=%s', async (focused) => {
  const first = { id: 1 } as BrowserWindow
  const second = { id: 2 } as BrowserWindow
  vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(focused ? second : null)
  vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([first])
  vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['C:\\Music'] })
  await expect(selectLibraryDirectory()).resolves.toBe('C:\\Music')
  expect(dialog.showOpenDialog).toHaveBeenCalledWith(focused ? second : first, {
    properties: ['openDirectory'],
    title: '选择目录',
  })
})

it.each([
  { canceled: true, filePaths: ['C:\\Music'] },
  { canceled: false, filePaths: [] },
])('treats cancellation or an absent path as no selection: %j', async (result) => {
  vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])
  vi.mocked(dialog.showOpenDialog).mockResolvedValue(result)
  await expect(selectLibraryDirectory()).resolves.toBeNull()
})
