import { app, BrowserWindow, type WebContents } from 'electron'
import { disposeDesktopLyricsWindow } from '../desktopLyricsWindow'

interface SmokeCheck {
  name: string
  ok: boolean
  detail?: string
}

interface SmokeResult {
  ok: boolean
  checks: SmokeCheck[]
  loadFailures: string[]
  fatalError?: string
}

interface AppInfoProbe {
  apiExists: boolean
  name: unknown
  version: unknown
  databasePath: unknown
}

interface RouteProbe {
  hash: string
  settingsMounted: boolean
}

interface MiniPlayerProbe {
  entered: string
  observed: string
  restored: string
}

interface DesktopLyricsBridgeProbe {
  apiExists: boolean
  onlyDesktopLyrics: boolean
  canSubscribe: boolean
  canToggleLock: boolean
  canSubscribeLock: boolean
  exposesFullAppApi: boolean
}

const CHECK_TIMEOUT_MS = 10_000
const SUITE_TIMEOUT_MS = 35_000
const POLL_INTERVAL_MS = 25
const SMOKE_RESULT_PREFIX = 'AURALIS_SMOKE_RESULT '

function describeError(error: unknown): string {
  return error instanceof Error ? error.stack || error.message : String(error)
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitFor(
  description: string,
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await delay(POLL_INTERVAL_MS)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

async function withTimeout<T>(
  description: string,
  work: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${description} timed out`)), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function runChecks(mainWindow: BrowserWindow): Promise<SmokeResult> {
  const checks: SmokeCheck[] = []
  const loadFailures: string[] = []
  const finishedLoads = new WeakSet<WebContents>()
  const trackedContents = new WeakSet<WebContents>()

  const trackWebContents = (webContents: WebContents): void => {
    if (trackedContents.has(webContents)) return
    trackedContents.add(webContents)
    webContents.on('did-finish-load', () => finishedLoads.add(webContents))
    webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        if (isMainFrame) {
          loadFailures.push(`${errorCode} ${errorDescription} ${validatedUrl}`)
        }
      },
    )
    webContents.on('render-process-gone', (_event, details) => {
      loadFailures.push(`renderer gone: ${details.reason} (${details.exitCode})`)
    })
  }

  const record = async (name: string, assertion: () => void | Promise<void>): Promise<void> => {
    try {
      await assertion()
      checks.push({ name, ok: true })
    } catch (error) {
      checks.push({ name, ok: false, detail: describeError(error) })
      throw error
    }
  }

  trackWebContents(mainWindow.webContents)
  const handleWebContentsCreated = (_event: Electron.Event, webContents: WebContents): void => {
    trackWebContents(webContents)
  }
  app.on('web-contents-created', handleWebContentsCreated)

  try {
    await record('runs under Electron 38', () => {
      const majorVersion = Number.parseInt(process.versions.electron?.split('.')[0] ?? '', 10)
      if (majorVersion !== 38) {
        throw new Error(`Expected Electron 38, received ${process.versions.electron ?? 'unknown'}`)
      }
    })

    await record('main window finishes loading without failure', async () => {
      await waitFor('main window did-finish-load', () => finishedLoads.has(mainWindow.webContents))
      if (loadFailures.length > 0) throw new Error(loadFailures.join('\n'))
    })

    await record('sandboxed main preload exposes working app.getInfo', async () => {
      const probe = (await mainWindow.webContents.executeJavaScript(
        `(async () => {
          const api = window.auralis
          const info = await api?.app?.getInfo?.()
          return {
            apiExists: typeof api === 'object',
            name: info?.name,
            version: info?.version,
            databasePath: info?.databasePath
          }
        })()`,
        true,
      )) as AppInfoProbe

      if (!probe.apiExists) throw new Error('window.auralis is missing')
      if (probe.name !== 'Auralis') throw new Error(`Unexpected app name: ${String(probe.name)}`)
      if (typeof probe.version !== 'string' || probe.version.length === 0) {
        throw new Error('app.getInfo returned no version')
      }
      if (typeof probe.databasePath !== 'string' || probe.databasePath.length === 0) {
        throw new Error('app.getInfo returned no database path')
      }
      const configuredUserData = process.env.AURALIS_SMOKE_USER_DATA
      if (!configuredUserData || !probe.databasePath.startsWith(configuredUserData)) {
        throw new Error('Smoke database escaped the isolated userData directory')
      }
    })

    await record('hash router navigates to settings', async () => {
      const probe = (await mainWindow.webContents.executeJavaScript(
        `(async () => {
          window.location.hash = '#/settings'
          const deadline = Date.now() + 5000
          while (!document.querySelector('.settings-page') && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
          return {
            hash: window.location.hash,
            settingsMounted: Boolean(document.querySelector('.settings-page'))
          }
        })()`,
        true,
      )) as RouteProbe

      if (probe.hash !== '#/settings' || !probe.settingsMounted) {
        throw new Error(`Settings route did not mount: ${JSON.stringify(probe)}`)
      }
    })

    await record('window.open is denied', async () => {
      const windowCount = BrowserWindow.getAllWindows().length
      const returnedNull = (await mainWindow.webContents.executeJavaScript(
        `window.open('https://example.invalid/auralis-smoke') === null`,
        true,
      )) as boolean
      await delay(100)
      if (!returnedNull) throw new Error('window.open returned a Window proxy')
      if (BrowserWindow.getAllWindows().length !== windowCount) {
        throw new Error('window.open created another BrowserWindow')
      }
    })

    await record('untrusted renderer navigation is blocked', async () => {
      const trustedUrl = mainWindow.webContents.getURL()
      let sawBlockedNavigation = false
      const observeNavigation = (event: Electron.Event, url: string): void => {
        if (url.startsWith('https://example.invalid/')) {
          sawBlockedNavigation = event.defaultPrevented
        }
      }
      mainWindow.webContents.on('will-navigate', observeNavigation)
      try {
        await mainWindow.webContents.executeJavaScript(
          `window.location.assign('https://example.invalid/auralis-smoke-navigation')`,
          true,
        )
        await waitFor('blocked will-navigate event', () => sawBlockedNavigation)
        await delay(100)
      } finally {
        mainWindow.webContents.removeListener('will-navigate', observeNavigation)
      }

      if (mainWindow.webContents.getURL() !== trustedUrl) {
        throw new Error(`Renderer escaped trusted entry: ${mainWindow.webContents.getURL()}`)
      }
    })

    await record('miniplayer enters and restores through the real preload', async () => {
      const probe = (await mainWindow.webContents.executeJavaScript(
        `(async () => {
          const entered = await window.auralis.window.enterMiniPlayer()
          const observed = await window.auralis.window.getMiniPlayerState()
          const restored = await window.auralis.window.restoreFromMiniPlayer()
          return {
            entered: entered.mode,
            observed: observed.mode,
            restored: restored.mode
          }
        })()`,
        true,
      )) as MiniPlayerProbe

      if (probe.entered !== 'mini' || probe.observed !== 'mini' || probe.restored !== 'normal') {
        throw new Error(`Unexpected miniplayer transition: ${JSON.stringify(probe)}`)
      }
    })

    let desktopLyricsWindow: BrowserWindow | undefined
    await record('desktop lyrics window loads its restricted preload', async () => {
      const toggleResult = (await mainWindow.webContents.executeJavaScript(
        `window.auralis.desktopLyrics.toggle()`,
        true,
      )) as { visible?: boolean }
      if (!toggleResult.visible) throw new Error('Desktop lyrics did not become visible')

      await waitFor('desktop lyrics BrowserWindow', () => {
        desktopLyricsWindow = BrowserWindow.getAllWindows().find(
          (window) =>
            window !== mainWindow && window.webContents.getURL().includes('desktopLyrics=1'),
        )
        return Boolean(desktopLyricsWindow)
      })
      await waitFor('desktop lyrics did-finish-load', () =>
        Boolean(desktopLyricsWindow && finishedLoads.has(desktopLyricsWindow.webContents)),
      )

      const bridgeProbe = (await desktopLyricsWindow!.webContents.executeJavaScript(
        `(() => {
          const api = window.auralis
          return {
            apiExists: typeof api === 'object',
            onlyDesktopLyrics: JSON.stringify(Object.keys(api || {})) === '["desktopLyrics"]',
            canSubscribe: typeof api?.desktopLyrics?.onUpdate === 'function',
            canToggleLock: typeof api?.desktopLyrics?.toggleMousePassthrough === 'function',
            canSubscribeLock: typeof api?.desktopLyrics?.onMousePassthroughChanged === 'function',
            exposesFullAppApi: typeof api?.app === 'object'
          }
        })()`,
        true,
      )) as DesktopLyricsBridgeProbe

      if (
        !bridgeProbe.apiExists ||
        !bridgeProbe.onlyDesktopLyrics ||
        !bridgeProbe.canSubscribe ||
        !bridgeProbe.canToggleLock ||
        !bridgeProbe.canSubscribeLock ||
        bridgeProbe.exposesFullAppApi
      ) {
        throw new Error(`Desktop lyrics bridge is not restricted: ${JSON.stringify(bridgeProbe)}`)
      }
    })

    await record('desktop lyrics bridge receives an update', async () => {
      if (!desktopLyricsWindow) throw new Error('Desktop lyrics window is missing')
      await desktopLyricsWindow.webContents.executeJavaScript(
        `(() => {
          globalThis.__auralisSmokeLyrics = null
          globalThis.__auralisSmokeUnsubscribe = window.auralis.desktopLyrics.onUpdate((payload) => {
            globalThis.__auralisSmokeLyrics = payload.currentLine
            globalThis.__auralisSmokeUnsubscribe?.()
          })
          return true
        })()`,
        true,
      )

      const updated = (await mainWindow.webContents.executeJavaScript(
        `window.auralis.desktopLyrics.update({
          trackId: 1,
          title: 'Smoke title',
          artist: 'Smoke artist',
          currentLine: 'Smoke current line',
          nextLine: 'Smoke next line',
          status: 'plain',
          isPlaying: true
        })`,
        true,
      )) as { ok?: boolean }
      if (!updated.ok) throw new Error('Desktop lyrics update IPC failed')

      await waitFor('desktop lyrics preload update', async () => {
        const line = (await desktopLyricsWindow!.webContents.executeJavaScript(
          `globalThis.__auralisSmokeLyrics`,
          true,
        )) as string | null
        return line === 'Smoke current line'
      })
    })

    await record(
      'desktop lyrics window is destroyed on dispose without lingering windows',
      async () => {
        disposeDesktopLyricsWindow()
        await waitFor(
          'desktop lyrics window destruction',
          () =>
            !BrowserWindow.getAllWindows().some((window) =>
              window.webContents.getURL().includes('desktopLyrics=1'),
            ),
        )
      },
    )

    await record('no main-frame load or renderer failure occurred', () => {
      if (loadFailures.length > 0) throw new Error(loadFailures.join('\n'))
    })

    return { ok: true, checks, loadFailures }
  } catch (error) {
    return { ok: false, checks, loadFailures, fatalError: describeError(error) }
  } finally {
    app.removeListener('web-contents-created', handleWebContentsCreated)
  }
}

/** Run the opt-in real-window smoke suite and terminate the isolated Electron process. */
export async function runElectronSmokeTest(mainWindow: BrowserWindow): Promise<never> {
  let result: SmokeResult
  try {
    result = await withTimeout('Electron smoke suite', runChecks(mainWindow), SUITE_TIMEOUT_MS)
  } catch (error) {
    result = { ok: false, checks: [], loadFailures: [], fatalError: describeError(error) }
  }

  process.stdout.write(`${SMOKE_RESULT_PREFIX}${JSON.stringify(result)}\n`)
  app.exit(result.ok ? 0 : 1)
  return new Promise<never>(() => undefined)
}
