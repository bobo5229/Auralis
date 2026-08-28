import type { BrowserWindow, Session } from 'electron'
import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

const securedSessions = new WeakSet<Session>()

function toUrl(value: string): URL | null {
  try {
    if (isAbsolute(value)) {
      return pathToFileURL(value)
    }
    return new URL(value)
  } catch {
    try {
      return pathToFileURL(value)
    } catch {
      return null
    }
  }
}

function normalizePathname(url: URL): string | null {
  try {
    const pathname = decodeURIComponent(url.pathname).replaceAll('\\', '/')
    return process.platform === 'win32' ? pathname.toLowerCase() : pathname
  } catch {
    return null
  }
}

/**
 * Renderer routes use hashes and the desktop-lyrics surface uses a query flag.
 * Both are same-document changes, so only the scheme, authority and entry path
 * need to match the configured renderer entry.
 */
export function isTrustedRendererUrl(candidate: string, rendererEntry: string): boolean {
  const candidateUrl = toUrl(candidate)
  const entryUrl = toUrl(rendererEntry)
  if (!candidateUrl || !entryUrl) return false
  const candidatePathname = normalizePathname(candidateUrl)
  const entryPathname = normalizePathname(entryUrl)
  if (!candidatePathname || !entryPathname) return false

  return (
    candidateUrl.protocol === entryUrl.protocol &&
    candidateUrl.username === entryUrl.username &&
    candidateUrl.password === entryUrl.password &&
    candidateUrl.hostname === entryUrl.hostname &&
    candidateUrl.port === entryUrl.port &&
    candidatePathname === entryPathname
  )
}

function denyRendererPermissions(session: Session): void {
  if (securedSessions.has(session)) return
  securedSessions.add(session)

  session.setPermissionCheckHandler(() => false)
  session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
}

/** Apply the navigation and capability policy shared by every Auralis renderer. */
export function secureRendererWindow(window: BrowserWindow, rendererEntry: string): void {
  const { webContents } = window
  denyRendererPermissions(webContents.session)

  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  const preventUntrustedNavigation = (event: Electron.Event, url: string): void => {
    if (!isTrustedRendererUrl(url, rendererEntry)) {
      event.preventDefault()
    }
  }

  webContents.on('will-navigate', preventUntrustedNavigation)
  webContents.on('will-redirect', preventUntrustedNavigation)
}
