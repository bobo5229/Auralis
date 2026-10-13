import { app, BrowserWindow, type WebContents } from 'electron'
import { createWindow } from '../createWindow'

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
  backgroundInert: boolean
  focusOnClose: boolean
}

interface StartupPresentationProbe {
  shellMounted: boolean
}

const CHECK_TIMEOUT_MS = 10_000
const SUITE_TIMEOUT_MS = 35_000
const POLL_INTERVAL_MS = 25
const SMOKE_RESULT_PREFIX = 'AURALIS_SMOKE_RESULT '

function describeError(error: unknown): string {
  return error instanceof Error ? error.stack || error.message : String(error)
}

function assertPlayerBarBottomGap(probe: {
  bottomDistance: number | null
  bottomGap: number
}): void {
  if (!Number.isFinite(probe.bottomGap) || probe.bottomGap <= 0) {
    throw new Error('PlayerBar bottom-gap token must be a positive pixel value')
  }
  if (
    probe.bottomDistance === null ||
    !Number.isFinite(probe.bottomDistance) ||
    Math.abs(probe.bottomDistance - probe.bottomGap) > 2
  ) {
    throw new Error(
      `PlayerBar bottom distance expected ~${probe.bottomGap}px, received: ${String(probe.bottomDistance)}`,
    )
  }
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

async function waitForStartupPresentation(
  mainWindow: BrowserWindow,
): Promise<StartupPresentationProbe> {
  return (await mainWindow.webContents.executeJavaScript(
    `(async () => {
      const deadline = Date.now() + ${CHECK_TIMEOUT_MS}
      while (Date.now() < deadline) {
        const shellMounted = Boolean(document.querySelector('[data-app-shell-root]'))
        if (shellMounted) return { shellMounted }
        await new Promise((resolve) => setTimeout(resolve, ${POLL_INTERVAL_MS}))
      }

      return {
        shellMounted: Boolean(document.querySelector('[data-app-shell-root]')),
      }
    })()`,
    true,
  )) as StartupPresentationProbe
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

    await record('native playback preload and IPC reject invalid capabilities', async () => {
      const result = await mainWindow.webContents.executeJavaScript(`(async () => {
        const playback = window.auralis.playback
        const availability = await playback.nativeAvailability()
        const unsubscribe = playback.onNativeEvent(() => {})
        unsubscribe()
        let rejected = false
        try { await playback.nativeCommand({ action: 'run', session: 1, command: ['quit'] }) }
        catch { rejected = true }
        return typeof availability.available === 'boolean' && rejected
      })()`)
      if (!result) throw new Error('Native playback capability check failed')
    })

    await record('legacy visual-style preference does not affect startup', async () => {
      await mainWindow.webContents.executeJavaScript(
        `localStorage.setItem('auralis-visual-style', 'manuscript')`,
        true,
      )
      finishedLoads.delete(mainWindow.webContents)
      mainWindow.webContents.reload()
      await waitFor('main window reload with legacy preference', () =>
        finishedLoads.has(mainWindow.webContents),
      )
      const presentation = await waitForStartupPresentation(mainWindow)
      if (!presentation.shellMounted || loadFailures.length > 0) {
        throw new Error(
          `Legacy visual-style preference prevented the modern shell from mounting: ${JSON.stringify(presentation)}`,
        )
      }
    })

    await record('custom window controls toggle maximized state', async () => {
      const controlsMounted = await mainWindow.webContents.executeJavaScript(`(() => {
        return ['close', 'minimize', 'maximize'].every((action) =>
          document.querySelector('.window-traffic-light--' + action)
        )
      })()`)
      if (!controlsMounted) throw new Error('Main window traffic lights are missing')

      const originalMaximized = mainWindow.isMaximized()
      const originalHeight = (await mainWindow.webContents.executeJavaScript(
        `window.innerHeight`,
      )) as number
      await mainWindow.webContents.executeJavaScript(
        `document.querySelector('.window-traffic-light--maximize').click()`,
      )
      await waitFor('custom maximize button', () => mainWindow.isMaximized() !== originalMaximized)
      await mainWindow.webContents.executeJavaScript(
        `document.querySelector('.window-traffic-light--maximize').click()`,
      )
      await waitFor('custom restore button', () => mainWindow.isMaximized() === originalMaximized)
      await waitFor('restored renderer viewport', async () => {
        const height = (await mainWindow.webContents.executeJavaScript(
          `window.innerHeight`,
        )) as number
        return height === originalHeight
      })
    })

    await record('playerbar layout contract holds at idle startup', async () => {
      const probe = (await mainWindow.webContents.executeJavaScript(
        `(async () => {
          const el = document.querySelector('.player-bar')
          const style = el ? getComputedStyle(el) : null
          const rect = el?.getBoundingClientRect()
          const island = document.querySelector('.player-bar-island')
          const islandStyle = island ? getComputedStyle(island) : null
          const primaryBtn = document.querySelector('.transport-control-primary')
          const queueButtons = document.querySelectorAll('[data-testid="player-queue-button"]')
          const queueBtn = queueButtons.length === 1 ? queueButtons[0] : null

          const inViewport = Boolean(rect) &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.right > 0 &&
            rect.left < window.innerWidth &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight

          let clickVerification = false
          if (queueBtn instanceof HTMLElement) {
            const initialExpanded = queueBtn.getAttribute('aria-expanded')
            queueBtn.click()
            await new Promise((resolve) => setTimeout(resolve, 50))
            const expandedAfterFirstClick = queueBtn.getAttribute('aria-expanded')
            queueBtn.click()
            await new Promise((resolve) => setTimeout(resolve, 50))
            const closedAfterSecondClick = queueBtn.getAttribute('aria-expanded')
            clickVerification =
              initialExpanded === 'false' &&
              expandedAfterFirstClick === 'true' &&
              closedAfterSecondClick === 'false'
          }

          return {
            mounted: Boolean(el),
            className: el?.className ?? '',
            position: style?.position ?? null,
            zIndex: style?.zIndex ?? null,
            display: style?.display ?? null,
            visibility: style?.visibility ?? null,
            opacity: style?.opacity ?? null,
            pointerEvents: style?.pointerEvents ?? null,
            islandMounted: Boolean(island),
            islandPointerEvents: islandStyle?.pointerEvents ?? null,
            primaryButtonMounted: Boolean(primaryBtn),
            primaryButtonDisabled: Boolean(primaryBtn && 'disabled' in primaryBtn && primaryBtn.disabled),
            queueButtonMatchCount: queueButtons.length,
            clickVerification,
            rect: rect ? {
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
              width: rect.width,
              height: rect.height,
            } : null,
            inViewport,
            bottomDistance: rect ? window.innerHeight - rect.bottom : null,
            bottomGap: Number.parseFloat(style?.getPropertyValue('--auralis-player-bottom-gap') ?? ''),
            horizontalIntersection: Boolean(rect) && rect.right > 0 && rect.left < window.innerWidth,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          }
        })()`,
        true,
      )) as {
        mounted: boolean
        className: string
        position: string | null
        zIndex: string | null
        display: string | null
        visibility: string | null
        opacity: string | null
        pointerEvents: string | null
        islandMounted: boolean
        islandPointerEvents: string | null
        primaryButtonMounted: boolean
        primaryButtonDisabled: boolean
        queueButtonMatchCount: number
        clickVerification: boolean
        rect: {
          top: number
          bottom: number
          left: number
          right: number
          width: number
          height: number
        } | null
        inViewport: boolean
        bottomDistance: number | null
        bottomGap: number
        horizontalIntersection: boolean
        viewportWidth: number
        viewportHeight: number
      }

      if (!probe.mounted) throw new Error('PlayerBar is not mounted')
      if (probe.className.includes('relative')) {
        throw new Error(`PlayerBar unexpectedly retained relative class: ${probe.className}`)
      }
      if (probe.position !== 'fixed') {
        throw new Error(`Expected PlayerBar position fixed, received: ${String(probe.position)}`)
      }
      if (probe.zIndex !== '50') {
        throw new Error(`Expected PlayerBar z-index 50, received: ${String(probe.zIndex)}`)
      }
      if (probe.pointerEvents !== 'none') {
        throw new Error(
          `Expected PlayerBar host pointer-events none, received: ${String(probe.pointerEvents)}`,
        )
      }
      if (!probe.islandMounted) throw new Error('PlayerBar island is not mounted')
      if (probe.islandPointerEvents !== 'auto') {
        throw new Error(
          `Expected PlayerBar island pointer-events auto, received: ${String(probe.islandPointerEvents)}`,
        )
      }
      if (!probe.inViewport) {
        throw new Error(`PlayerBar is outside viewport: ${JSON.stringify(probe.rect)}`)
      }
      assertPlayerBarBottomGap(probe)
      if (!probe.primaryButtonMounted || !probe.primaryButtonDisabled) {
        throw new Error('Expected idle transport primary button to be present and disabled')
      }
      if (probe.queueButtonMatchCount !== 1) {
        throw new Error(
          `Expected one PlayerBar queue button test target, received: ${probe.queueButtonMatchCount}`,
        )
      }
      if (!probe.clickVerification) {
        throw new Error(
          'PlayerBar island click interaction failed to trigger expected state change',
        )
      }
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

    await record(
      'settings opens as a modal without navigating or replacing the library',
      async () => {
        const probe = (await mainWindow.webContents.executeJavaScript(
          `(async () => {
          const beforeHash = window.location.hash
          const page = document.querySelector('.library-page')
          const trigger = document.querySelector('[data-settings-trigger]')
          if (!page || !trigger) throw new Error('Settings entry or library page is missing')
          trigger.focus()
          trigger.click()
          const deadline = Date.now() + 5000
          while (!document.querySelector('.settings-surface') && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
          if (window.location.hash !== beforeHash || document.querySelector('.library-page') !== page) {
            throw new Error('Opening settings replaced the current page')
          }
          return {
            hash: window.location.hash,
            settingsMounted: Boolean(document.querySelector('[data-settings-dialog] .settings-surface')),
            backgroundInert: document.querySelector('[data-app-shell-root]').inert,
            focusOnClose: document.activeElement === document.querySelector('.settings-dialog-close'),
          }
        })()`,
          true,
        )) as RouteProbe

        if (
          probe.hash !== '#/songs' ||
          !probe.settingsMounted ||
          !probe.backgroundInert ||
          !probe.focusOnClose
        ) {
          throw new Error(`Settings modal did not mount correctly: ${JSON.stringify(probe)}`)
        }

        const playerBarOnRoute = (await mainWindow.webContents.executeJavaScript(
          `(() => {
          const el = document.querySelector('.player-bar')
          const style = el ? getComputedStyle(el) : null
          const rect = el?.getBoundingClientRect()
          const inViewport = Boolean(rect) &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.right > 0 &&
            rect.left < window.innerWidth &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight
          return {
            mounted: Boolean(el),
            position: style?.position,
            inViewport,
            bottomDistance: rect ? window.innerHeight - rect.bottom : null,
          }
        })()`,
          true,
        )) as {
          mounted: boolean
          position?: string
          inViewport: boolean
          bottomDistance: number | null
        }
        if (
          !playerBarOnRoute.mounted ||
          playerBarOnRoute.position !== 'fixed' ||
          !playerBarOnRoute.inViewport
        ) {
          throw new Error(
            `PlayerBar layout degraded on route navigation: ${JSON.stringify(playerBarOnRoute)}`,
          )
        }
      },
    )

    await record(
      'settings preserves child Escape, section selection and return focus',
      async () => {
        await mainWindow.webContents.executeJavaScript(
          `(async () => {
        const wait = () => new Promise((resolve) => setTimeout(resolve, 180))
        const waitForClosed = async () => {
          const deadline = Date.now() + 2000
          while (document.querySelector('[data-settings-dialog]') && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
        }
        const escape = (target) => target.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape', bubbles: true, cancelable: true,
        }))
        const page = document.querySelector('.library-page')
        const trigger = document.querySelector('[data-settings-trigger]')
        const close = document.querySelector('.settings-dialog-close')
        close.focus()
        close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
        if (!document.querySelector('[data-settings-dialog]').contains(document.activeElement) || document.activeElement === close) {
          throw new Error('Shift+Tab escaped the settings dialog')
        }
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
        if (document.activeElement !== close) throw new Error('Tab did not wrap to the close button')

        const picker = document.querySelector('.dark-accent-toggle')
        picker.click()
        await wait()
        const pickerInput = document.querySelector('.dark-accent-picker-host input')
        pickerInput.focus()
        escape(pickerInput)
        await wait()
        if (!document.querySelector('[data-settings-dialog]') || picker.getAttribute('aria-expanded') !== 'false') {
          throw new Error('Color picker Escape closed the parent dialog')
        }

        document.querySelector('[data-settings-section="about"]').click()
        await wait()
        document.querySelector('.settings-dialog-backdrop').click()
        await waitForClosed()
        if (document.querySelector('[data-settings-dialog]') || document.querySelector('[data-app-shell-root]').inert || document.activeElement !== trigger) {
          throw new Error('Closing settings did not restore background interaction and focus: ' + JSON.stringify({
            dialogPresent: Boolean(document.querySelector('[data-settings-dialog]')),
            inert: document.querySelector('[data-app-shell-root]').inert,
            focused: document.activeElement?.outerHTML?.slice(0, 300),
            triggerConnected: trigger.isConnected,
          }))
        }
        trigger.click()
        await wait()
        if (!document.querySelector('[data-settings-section="about"][aria-current="true"]') || document.querySelector('.settings-dialog-content').scrollTop !== 0) {
          throw new Error('Settings did not reopen on the remembered section from the top')
        }
        escape(document.activeElement)
        await waitForClosed()
        if (document.querySelector('[data-settings-dialog]') || document.querySelector('.library-page') !== page) {
          throw new Error('Escape did not return to the original library page')
        }
      })()`,
          true,
        )
      },
    )

    await record(
      'page parameters preserve font menu Escape, selection and return focus',
      async () => {
        await mainWindow.webContents.executeJavaScript(
          `(async () => {
        const waitFor = async (description, predicate) => {
          const deadline = Date.now() + 2000
          while (Date.now() < deadline) {
            if (predicate()) return
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
          throw new Error('Timed out waiting for ' + description)
        }
        const keydown = (target, key) => target.dispatchEvent(new KeyboardEvent('keydown', {
          key, bubbles: true, cancelable: true,
        }))
        const page = document.querySelector('.library-page')
        const trigger = document.querySelector('[data-page-parameters-trigger]')
        const panel = document.getElementById('page-parameter-panel')
        if (!page || !trigger || !panel || trigger.getAttribute('aria-disabled') === 'true') {
          throw new Error('Song page parameters entry is unavailable')
        }
        const beforeHash = window.location.hash
        const panelIsOpen = () => trigger.getAttribute('aria-expanded') === 'true' &&
          getComputedStyle(panel).display !== 'none' && !panel.inert
        const assertClosed = async () => {
          await waitFor('page parameters close and return focus', () =>
            trigger.getAttribute('aria-expanded') === 'false' &&
            getComputedStyle(panel).display === 'none' && document.activeElement === trigger)
          if (document.querySelector('[role="listbox"]') || document.querySelector('[data-app-shell-root]').inert) {
            throw new Error('Closing page parameters left a menu or inert background')
          }
        }
        trigger.focus()
        trigger.click()
        await waitFor('song page parameters open', () => panelIsOpen() &&
          document.activeElement === panel.querySelector('.parameter-panel-close'))
        if (panel.getAttribute('role') !== 'dialog' || panel.getAttribute('aria-modal') !== 'false' ||
            document.querySelector('[data-app-shell-root]').inert ||
            window.location.hash !== beforeHash || document.querySelector('.library-page') !== page) {
          throw new Error('Page parameters did not preserve the interactive library')
        }

        let weight = panel.querySelector('#song-font-weight-list-title[role="combobox"]')
        if (!weight || weight.disabled) throw new Error('Song title font weight control is unavailable')
        const menu = () => document.getElementById(weight.getAttribute('aria-controls'))
        const openMenu = async () => {
          weight.focus()
          weight.click()
          await waitFor('font weight listbox', () => weight.getAttribute('aria-expanded') === 'true' &&
            menu()?.getAttribute('role') === 'listbox')
        }
        await openMenu()
        keydown(weight, 'Escape')
        await waitFor('font menu Escape', () => weight.getAttribute('aria-expanded') === 'false' &&
          !document.querySelector('[role="listbox"]'))
        if (!panelIsOpen() || document.activeElement !== weight) {
          throw new Error('Font menu Escape closed the page parameters or lost focus')
        }

        await openMenu()
        keydown(weight, 'Home')
        keydown(weight, 'ArrowDown')
        await waitFor('font menu keyboard navigation', () => {
          const active = document.getElementById(weight.getAttribute('aria-activedescendant'))
          return active?.getAttribute('role') === 'option' && active.textContent.includes('400')
        })
        const option = document.getElementById(weight.getAttribute('aria-activedescendant'))
        if (option.getAttribute('aria-selected') !== 'false') {
          throw new Error('Expected a different font weight option to select')
        }
        const selectedLabel = option.textContent.trim()
        option.click()
        await waitFor('font weight selection applies and persists', () =>
          weight.getAttribute('aria-expanded') === 'false' &&
          document.getElementById(weight.id + '-value').textContent.trim() === selectedLabel &&
          JSON.parse(localStorage.getItem('auralis-song-font-weights') ?? 'null')?.list?.title === 400 &&
          getComputedStyle(page).getPropertyValue('--auralis-song-list-title-weight').trim() === '400')
        if (!panelIsOpen() || document.querySelector('[role="listbox"]') || document.activeElement !== weight) {
          throw new Error('Teleported font option did not close its menu and return focus inside page parameters')
        }

        keydown(weight, 'Escape')
        await assertClosed()
        trigger.click()
        await waitFor('page parameters reopen', () => panelIsOpen() &&
          document.activeElement === panel.querySelector('.parameter-panel-close'))
        weight = panel.querySelector('#song-font-weight-list-title[role="combobox"]')
        if (!weight || weight.disabled) throw new Error('Font weight control did not remount')
        await openMenu()
        if (menu().querySelector('[role="option"][aria-selected="true"]')?.textContent.trim() !== selectedLabel ||
            document.getElementById(weight.getAttribute('aria-activedescendant'))?.textContent.trim() !== selectedLabel) {
          throw new Error('Page parameters did not retain the selected font weight')
        }
        keydown(weight, 'Escape')
        await waitFor('reopened font menu close', () => weight.getAttribute('aria-expanded') === 'false')
        panel.querySelector('.parameter-panel-close').click()
        await assertClosed()
        if (window.location.hash !== beforeHash || document.querySelector('.library-page') !== page) {
          throw new Error('Page parameters changed the current library page')
        }
      })()`,
          true,
        )
      },
    )

    await record('retired settings URL redirects to the library', async () => {
      await mainWindow.webContents.executeJavaScript(`window.location.hash = '#/settings'`, true)
      await waitFor('settings compatibility redirect', async () =>
        mainWindow.webContents.executeJavaScript(
          `window.location.hash === '#/songs' && !document.querySelector('[data-settings-dialog]')`,
        ),
      )
    })

    await record('playerbar geometry anchors correctly across window resize', async () => {
      const originalBounds = mainWindow.getBounds()
      try {
        mainWindow.setSize(900, 600)
        await delay(100)
        const probe = (await mainWindow.webContents.executeJavaScript(
          `(() => {
            const el = document.querySelector('.player-bar')
            const style = el ? getComputedStyle(el) : null
            const rect = el?.getBoundingClientRect()
            const inViewport = Boolean(rect) &&
              rect.width > 0 &&
              rect.height > 0 &&
              rect.right > 0 &&
              rect.left < window.innerWidth &&
              rect.bottom > 0 &&
              rect.top < window.innerHeight
            return {
              mounted: Boolean(el),
              position: style?.position,
              inViewport,
              bottomDistance: rect ? window.innerHeight - rect.bottom : null,
              bottomGap: Number.parseFloat(style?.getPropertyValue('--auralis-player-bottom-gap') ?? ''),
            }
          })()`,
          true,
        )) as {
          mounted: boolean
          position?: string
          inViewport: boolean
          bottomDistance: number | null
          bottomGap: number
        }
        if (!probe.mounted || probe.position !== 'fixed' || !probe.inViewport) {
          throw new Error(`PlayerBar layout degraded after window resize: ${JSON.stringify(probe)}`)
        }
        assertPlayerBarBottomGap(probe)
      } finally {
        mainWindow.setBounds(originalBounds)
        await delay(100)
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

    await record('removed presentation APIs are absent from the real preload', async () => {
      const absent = await mainWindow.webContents.executeJavaScript(`(() => {
        const retired = ['enterMiniPlayer', 'restoreFromMiniPlayer', 'getMiniPlayerState',
          'setMiniPlayerPopover', 'onMiniPlayerStateChanged']
        return retired.every((key) => !(key in window.auralis.window))
      })()`)
      if (!absent) throw new Error('Retired presentation APIs remain exposed')
    })

    await record('registered main window retains library IPC and four sidebar tools', async () => {
      const probe = await mainWindow.webContents.executeJavaScript(`(async () => {
        const roots = await window.auralis.library.getRoots()
        const tracks = await window.auralis.library.getTracks()
        const rail = document.querySelector('.app-sidebar')?.classList.contains('app-sidebar--collapsed') === true
        const toolbar = document.querySelector('.sidebar-tools-grid')
        const tools = [...document.querySelectorAll('.sidebar-footer button')]
        const settings = document.querySelector('.sidebar-footer [data-settings-trigger]')
        const parameters = toolbar?.querySelector('[data-page-parameters-trigger]')
        const groupedTools = toolbar ? [...toolbar.querySelectorAll('button.sidebar-tool-button')] : []
        const refresh = tools.find((el) => el.hasAttribute('aria-busy') &&
          ['刷新曲库', '正在刷新曲库', 'Refresh library', 'Refreshing library'].includes(el.getAttribute('aria-label')))
        const filters = groupedTools.find((el) =>
          ['筛选面板', 'Filter panel'].includes(el.getAttribute('aria-label')))
        const valid = Array.isArray(roots) && Array.isArray(tracks) && tools.length === 4 &&
          groupedTools.length === (rail ? 3 : 2) && Boolean(refresh) && Boolean(filters) &&
          toolbar.contains(refresh) === rail &&
          Boolean(settings) && !toolbar.contains(settings) && Boolean(parameters) &&
          tools.every((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0 && rect.left >= 0 &&
              rect.right <= window.innerWidth
          })
        return { valid, rail, toolCount: tools.length, groupedCount: groupedTools.length,
          refresh: Boolean(refresh), filters: Boolean(filters), settings: Boolean(settings),
          parameters: Boolean(parameters) }
      })()`)
      if (!probe.valid)
        throw new Error(`Library IPC or sidebar tools are unavailable: ${JSON.stringify(probe)}`)
    })

    await record('playerbar layout contract holds after window operations', async () => {
      const probe = (await mainWindow.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector('.player-bar')
          const style = el ? getComputedStyle(el) : null
          const rect = el?.getBoundingClientRect()
          const island = document.querySelector('.player-bar-island')
          const islandStyle = island ? getComputedStyle(island) : null
          const inViewport = Boolean(rect) &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.right > 0 &&
            rect.left < window.innerWidth &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight
          return {
            mounted: Boolean(el),
            position: style?.position,
            zIndex: style?.zIndex,
            inViewport,
            bottomDistance: rect ? window.innerHeight - rect.bottom : null,
            islandMounted: Boolean(island),
            bottomGap: Number.parseFloat(style?.getPropertyValue('--auralis-player-bottom-gap') ?? ''),
            islandPointerEvents: islandStyle?.pointerEvents,
          }
        })()`,
        true,
      )) as {
        mounted: boolean
        position?: string
        zIndex?: string
        inViewport: boolean
        bottomDistance: number | null
        islandMounted: boolean
        bottomGap: number
        islandPointerEvents?: string
      }
      if (!probe.mounted || probe.position !== 'fixed' || !probe.inViewport) {
        throw new Error(
          `PlayerBar layout degraded after window operations: ${JSON.stringify(probe)}`,
        )
      }
      if (probe.islandPointerEvents !== 'auto') {
        throw new Error(
          `PlayerBar island pointer-events degraded after window operations: ${String(probe.islandPointerEvents)}`,
        )
      }
      assertPlayerBarBottomGap(probe)
    })

    await record('later windows skip splash and retain the saved light theme', async () => {
      await mainWindow.webContents.executeJavaScript(
        `localStorage.setItem('auralis-theme', 'light')`,
      )
      const laterWindow = createWindow({ showSplash: false })
      try {
        await waitFor('later window did-finish-load', () =>
          finishedLoads.has(laterWindow.webContents),
        )
        await waitFor('later window renderer ready', () =>
          laterWindow.webContents.executeJavaScript(`window.__auralisAppReady === true`),
        )
        const probe = (await laterWindow.webContents.executeJavaScript(`(() => ({
          search: window.location.search,
          theme: document.documentElement.dataset.theme,
          splashPresent: Boolean(document.getElementById('splash')),
          appInert: document.getElementById('app')?.hasAttribute('inert'),
        }))()`)) as {
          search: string
          theme: string | undefined
          splashPresent: boolean
          appInert: boolean | undefined
        }
        if (
          probe.search !== '?splash=0' ||
          probe.theme !== 'light' ||
          probe.splashPresent ||
          probe.appInert ||
          laterWindow.getBackgroundColor().toLowerCase() !== '#f0f1f2'
        ) {
          throw new Error(`Later window startup did not skip splash: ${JSON.stringify(probe)}`)
        }
      } finally {
        laterWindow.destroy()
      }
    })

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
  // Exercise service shutdown on both outcomes while preserving a failing exit code.
  if (!result.ok) app.once('will-quit', () => app.exit(1))
  app.quit()
  return new Promise<never>(() => undefined)
}
