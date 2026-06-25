import { app, protocol } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createWindow } from './app/createWindow'
import { closeDatabase, initializeDatabase } from './database/connection'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import { ensureArtworkCacheDir } from './features/artwork/artworkCache'
import { registerArtworkProtocol } from './features/artwork/artworkProtocol'
import { registerAudioProtocol } from './features/audio/audioProtocol'
import { logger } from './logging/logger'

if (!app.isPackaged) {
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

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'auralis-audio',
    privileges: { bypassCSP: true, stream: true, secure: true, supportFetchAPI: true },
  },
])

app.whenReady().then(() => {
  const artworkCacheDir = ensureArtworkCacheDir(app.getPath('userData'))
  registerArtworkProtocol(artworkCacheDir)
  const db = initializeDatabase()
  registerAudioProtocol(db)
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
