import { app, BrowserWindow } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createWindow } from './app/createWindow'
import { closeDatabase, initializeDatabase } from './database/connection'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import { ensureArtworkCacheDir } from './features/artwork/artworkCache'
import { registerArtworkProtocol } from './features/artwork/artworkProtocol'
import {
  registerAudioProtocol,
  registerPrivilegedMediaSchemes,
} from './features/audio/audioProtocol'
import { LibraryRootRepository } from './repositories/libraryRootRepository'
import { TrackRepository } from './repositories/trackRepository'
import { initializeLogger, logger, shutdownLogger } from './logging/logger'
import { installMainProcessDiagnostics } from './logging/mainProcessDiagnostics'
import { ipcChannels } from '@shared/ipc/channels'
import { configureElectronSmokeEnvironment } from './app/smoke/electronSmokeEnvironment'
import { runElectronSmokeTest } from './app/smoke/runElectronSmokeTest'
import { createAppShutdownHandler } from './app/appShutdown'
import { createRendererEventSender } from './ipc/rendererEvents'

// Custom media scheme privileges must be registered before app.ready (single call).
registerPrivilegedMediaSchemes()

app.setName('Auralis')
const isElectronSmokeTest = configureElectronSmokeEnvironment(app)
// Keep Windows taskbar / jump-list identity stable so shell uses the app icon, not Electron's.
app.setAppUserModelId('com.bobo.auralis')

const useSoftwareRendering = !app.isPackaged && process.env.AURALIS_SOFTWARE_RENDERING === '1'

if (process.platform === 'win32' && !useSoftwareRendering && !isElectronSmokeTest) {
  app.commandLine.appendSwitch('force_high_performance_gpu')
}

if (!app.isPackaged && !isElectronSmokeTest) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1'
  const devUserDataPath = join(app.getAppPath(), 'data', 'user-data')
  const devCachePath = join(devUserDataPath, 'cache')
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
  app.once('gpu-info-update', () => {
    void app
      .getGPUInfo('basic')
      .then((gpuInfo) => {
        logger.info(
          {
            hardwareAcceleration: app.isHardwareAccelerationEnabled(),
            featureStatus: app.getGPUFeatureStatus(),
            gpuInfo,
          },
          'GPU diagnostics',
        )
      })
      .catch((error: unknown) => {
        logger.warn({ error }, 'Failed to collect GPU diagnostics')
      })
  })
}

initializeLogger({
  development: !app.isPackaged,
  logsDirectory: join(app.getPath('userData'), 'logs'),
  persistToFile: app.isPackaged,
})
const mainProcessDiagnostics = installMainProcessDiagnostics({ app, process, logger })
let runtime: ReturnType<typeof registerIpcHandlers> | undefined
let shuttingDown = false

void app
  .whenReady()
  .then(() => {
    if (shuttingDown) return
    const artworkCacheDir = ensureArtworkCacheDir(app.getPath('userData'))
    registerArtworkProtocol(artworkCacheDir)
    const db = initializeDatabase()
    const trackRepository = new TrackRepository(db)
    const libraryRootRepository = new LibraryRootRepository(db)
    const sendToRenderer = createRendererEventSender(() => BrowserWindow.getAllWindows())

    registerAudioProtocol({
      getFilePathByTrackId: (trackId) =>
        shuttingDown ? null : trackRepository.getFilePathById(trackId),
      getLibraryRootPaths: () =>
        shuttingDown ? [] : libraryRootRepository.list().map((root) => root.path),
      onFileMissing: (_trackId, filePath) => {
        if (shuttingDown) return
        const trackIds = trackRepository.markMissingByFilePaths([filePath])
        if (trackIds.length === 0) return
        sendToRenderer(ipcChannels.library.changed, {
          reason: 'track-missing',
          trackIds,
          filePaths: [filePath],
        })
      },
    })

    runtime = registerIpcHandlers(db, artworkCacheDir)
    const mainWindow = createWindow()

    if (isElectronSmokeTest) {
      void runElectronSmokeTest(mainWindow)
    } else {
      app.on('activate', () => {
        if (!shuttingDown) createWindow()
      })
    }
  })
  .catch(mainProcessDiagnostics.reportStartupFailure)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on(
  'before-quit',
  createAppShutdownHandler({
    shutdownServices: async () => {
      shuttingDown = true
      await runtime?.shutdown()
    },
    closeResources: () => {
      closeDatabase()
      logger.info('Auralis shutdown complete')
      mainProcessDiagnostics.dispose()
      shutdownLogger()
    },
    quit: () => app.quit(),
    reportError: (error) =>
      logger.error({ error }, 'Unable to finish shutdown; resources remain open'),
  }),
)
