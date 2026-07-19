import {
  ipcMain,
  nativeImage,
  type BrowserWindow,
  type NativeImage,
  type ThumbarButton,
} from 'electron'
import { ipcChannels } from '@shared/ipc/channels'
import type { SystemMediaCommand, SystemMediaPlaybackState } from '@shared/ipc/contracts'

const ICON_SIZE = 16

type IconKind = 'previous' | 'play' | 'pause' | 'next'

function createThumbarIcon(kind: IconKind): NativeImage {
  const bitmap = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4)

  const drawPixel = (x: number, y: number): void => {
    if (x < 0 || x >= ICON_SIZE || y < 0 || y >= ICON_SIZE) return
    const offset = (y * ICON_SIZE + x) * 4
    bitmap[offset] = 255
    bitmap[offset + 1] = 255
    bitmap[offset + 2] = 255
    bitmap[offset + 3] = 255
  }

  const drawVerticalBar = (startX: number, startY: number, width: number, height: number): void => {
    for (let y = startY; y < startY + height; y += 1) {
      for (let x = startX; x < startX + width; x += 1) drawPixel(x, y)
    }
  }

  const drawTriangle = (direction: 'left' | 'right'): void => {
    for (let row = 0; row < 10; row += 1) {
      const distanceFromMiddle = Math.abs(row - 4.5)
      const width = Math.max(1, 5 - Math.floor(distanceFromMiddle))
      for (let column = 0; column < width; column += 1) {
        const x = direction === 'right' ? 5 + column : 10 - column
        drawPixel(x, row + 3)
      }
    }
  }

  switch (kind) {
    case 'previous':
      drawVerticalBar(3, 3, 2, 10)
      drawTriangle('left')
      break
    case 'play':
      drawTriangle('right')
      break
    case 'pause':
      drawVerticalBar(4, 3, 3, 10)
      drawVerticalBar(9, 3, 3, 10)
      break
    case 'next':
      drawTriangle('right')
      drawVerticalBar(11, 3, 2, 10)
      break
  }

  return nativeImage.createFromBitmap(bitmap, {
    width: ICON_SIZE,
    height: ICON_SIZE,
    scaleFactor: 1,
  })
}

export function createWindowsThumbarController(window: BrowserWindow): () => void {
  if (process.platform !== 'win32') return () => undefined

  const icons = {
    previous: createThumbarIcon('previous'),
    play: createThumbarIcon('play'),
    pause: createThumbarIcon('pause'),
    next: createThumbarIcon('next'),
  }

  const sendCommand = (command: SystemMediaCommand): void => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(ipcChannels.systemMedia.command, command)
    }
  }

  const updateButtons = (state: SystemMediaPlaybackState): void => {
    if (window.isDestroyed()) return

    if (!state.hasTrack) {
      window.setThumbarButtons([])
      return
    }

    const buttons: ThumbarButton[] = [
      {
        tooltip: '上一首',
        icon: icons.previous,
        click: () => sendCommand('previous'),
      },
      {
        tooltip: state.isPlaying ? '暂停' : '播放',
        icon: state.isPlaying ? icons.pause : icons.play,
        click: () => sendCommand('toggle-play-pause'),
      },
      {
        tooltip: '下一首',
        icon: icons.next,
        click: () => sendCommand('next'),
      },
    ]

    window.setThumbarButtons(buttons)
  }

  const handleStateUpdate = (
    event: Electron.IpcMainEvent,
    state: SystemMediaPlaybackState,
  ): void => {
    if (
      event.sender !== window.webContents ||
      typeof state?.hasTrack !== 'boolean' ||
      typeof state.isPlaying !== 'boolean'
    ) {
      return
    }

    updateButtons(state)
  }

  ipcMain.on(ipcChannels.systemMedia.updateThumbarState, handleStateUpdate)

  return () => {
    ipcMain.removeListener(ipcChannels.systemMedia.updateThumbarState, handleStateUpdate)
    if (!window.isDestroyed()) window.setThumbarButtons([])
  }
}
