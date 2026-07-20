import { app, BrowserWindow } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createWindow } from './app/createWindow'
import { registerDesktopLyricsIpcHandlers } from './app/desktopLyricsWindow'
import { closeDatabase, initializeDatabase } from './database/connection'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import { ensureArtworkCacheDir } from './features/artwork/artworkCache'
import { registerArtworkProtocol } from './features/artwork/artworkProtocol'
import {
  registerAudioProtocol,
  registerAudioSchemeAsPrivileged,
} from './features/audio/audioProtocol'
import { LibraryRootRepository } from './repositories/libraryRootRepository'
import { TrackRepository } from './repositories/trackRepository'
import { logger } from './logging/logger'
import { ipcChannels } from '@shared/ipc/channels'

// Custom media scheme privileges must be registered before app.ready.
registerAudioSchemeAsPrivileged()

app.setName('Auralis')
// Keep Windows taskbar / jump-list identity stable so shell uses the app icon, not Electron's.
app.setAppUserModelId('com.bobo.auralis')
registerDesktopLyricsIpcHandlers()

if (!app.isPackaged) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1'
  const devUserDataPath = join(app.getAppPath(), 'data', 'user-data')
  const devCachePath = join(devUserDataPath, 'cache')
  const useSoftwareRendering = process.env.AURALIS_SOFTWARE_RENDERING === '1'
  const useHardwareVideoProcessing = process.env.AURALIS_HARDWARE_VIDEO_PROCESSING === '1'
  const disableDirectComposition = process.env.AURALIS_DISABLE_DIRECT_COMPOSITION === '1'
  const quietGpuLogs = process.env.AURALIS_QUIET_GPU_LOGS === '1'
  const disabledFeatures: string[] = []
  mkdirSync(devUserDataPath, { recursive: true })
  mkdirSync(devCachePath, { recursive: true })
  app.setPath('userData', devUserDataPath)
  app.setPath('cache', devCachePath)

  if (!useHardwareVideoProcessing) {
    app.commandLine.appendSwitch('disable-accelerated-video-decode')
    disabledFeatures.push('DirectCompositionVideoOverlays')
  }

  if (disableDirectComposition) {
    app.commandLine.appendSwitch('disable-direct-composition')
  }

  if (quietGpuLogs) {
    app.commandLine.appendSwitch('log-level', '3')
  }

  if (useSoftwareRendering) {
    app.disableHardwareAcceleration()
    app.commandLine.appendSwitch('disable-gpu')
    app.commandLine.appendSwitch('disable-gpu-sandbox')
    app.commandLine.appendSwitch('disable-gpu-compositing')
    app.commandLine.appendSwitch('disable-accelerated-2d-canvas')
    disabledFeatures.push('UseSkiaRenderer', 'Vulkan', 'CanvasOopRasterization')
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
  }

  if (disabledFeatures.length > 0) {
    app.commandLine.appendSwitch('disable-features', disabledFeatures.join(','))
  }

  app.commandLine.appendSwitch('disk-cache-dir', devCachePath)
  app.commandLine.appendSwitch('no-sandbox')
}

app.whenReady().then(() => {
  const artworkCacheDir = ensureArtworkCacheDir(app.getPath('userData'))
  registerArtworkProtocol(artworkCacheDir)
  const db = initializeDatabase()
  const trackRepository = new TrackRepository(db)
  const libraryRootRepository = new LibraryRootRepository(db)

  registerAudioProtocol({
    getFilePathByTrackId: (trackId) => trackRepository.getFilePathById(trackId),
    getLibraryRootPaths: () => libraryRootRepository.list().map((root) => root.path),
    onFileMissing: (_trackId, filePath) => {
      const trackIds = trackRepository.markMissingByFilePaths([filePath])
      if (trackIds.length === 0) return
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.webContents.isDestroyed()) {
          window.webContents.send(ipcChannels.library.changed, {
            reason: 'track-missing',
            trackIds,
            filePaths: [filePath],
          })
        }
      }
    },
  })

  registerIpcHandlers(db, artworkCacheDir)
  createWindow()

  app.on('activate', () => {
    createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
  logger.info('Auralis shutdown complete')
})
