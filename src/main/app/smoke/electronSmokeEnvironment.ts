import type { App } from 'electron'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

const SMOKE_FLAG = 'AURALIS_SMOKE_TEST'
const SMOKE_USER_DATA = 'AURALIS_SMOKE_USER_DATA'

/**
 * Configure an isolated Electron profile before app.ready.
 *
 * This path is active only for the explicit smoke-test process. The regular
 * application never reads the smoke profile and no renderer capability is
 * added by this hook.
 */
export function configureElectronSmokeEnvironment(app: App): boolean {
  if (process.env[SMOKE_FLAG] !== '1') {
    return false
  }

  const userDataPath = process.env[SMOKE_USER_DATA]
  if (!userDataPath || !isAbsolute(userDataPath)) {
    throw new Error(`${SMOKE_USER_DATA} must be an absolute path in smoke mode`)
  }

  const cachePath = join(userDataPath, 'cache')
  const dataPath = join(userDataPath, 'data')
  mkdirSync(userDataPath, { recursive: true })
  mkdirSync(cachePath, { recursive: true })
  mkdirSync(dataPath, { recursive: true })

  // An existing empty file bypasses the development-only legacy database copy.
  // SQLite will initialize it normally, so no real roots or watchers leak into
  // the isolated smoke process.
  closeSync(openSync(join(dataPath, 'auralis.sqlite'), 'wx'))

  app.setPath('userData', userDataPath)
  app.setPath('cache', cachePath)
  app.commandLine.appendSwitch('disk-cache-dir', cachePath)

  // A software renderer keeps the smoke run deterministic on Windows CI while
  // still exercising a real Chromium renderer and BrowserWindow.
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')

  return true
}
