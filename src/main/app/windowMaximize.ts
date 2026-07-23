import { BrowserWindow, screen } from 'electron'
import { getMiniPlayerWindowController } from './miniPlayerWindowController'

/**
 * Transparent + frameless windows on Windows often report isMaximized() === false
 * even after maximize(), so a naive toggle only ever calls maximize again.
 * Track a pseudo-maximized work-area fill and restore previous bounds on the
 * second click.
 */
interface MaximizeSession {
  /** Filled work area via setBounds because native maximize did not stick. */
  isPseudoMaximized: boolean
  normalBounds: Electron.Rectangle | null
}

const sessions = new WeakMap<BrowserWindow, MaximizeSession>()

function getSession(win: BrowserWindow): MaximizeSession {
  let session = sessions.get(win)
  if (!session) {
    session = { isPseudoMaximized: false, normalBounds: null }
    sessions.set(win, session)
    win.on('unmaximize', () => {
      session!.isPseudoMaximized = false
    })
    win.on('maximize', () => {
      // Native maximize won; drop pseudo state so unmaximize works next.
      session!.isPseudoMaximized = false
    })
    win.on('closed', () => {
      sessions.delete(win)
    })
  }
  return session
}

function isMiniMode(win: BrowserWindow): boolean {
  return getMiniPlayerWindowController(win)?.getState().mode === 'mini'
}

/** True when the window is natively maximized or our work-area pseudo-max. */
export function isWindowMaximizedLike(win: BrowserWindow): boolean {
  if (win.isMaximized()) return true
  return sessions.get(win)?.isPseudoMaximized === true
}

/**
 * Snapshot restore bounds before mini-player shrink. Handles both native and
 * pseudo-maximized (transparent work-area fill) states.
 */
export function captureWindowRestoreSnapshot(win: BrowserWindow): {
  wasMaximized: boolean
  bounds: Electron.Rectangle
} {
  const session = getSession(win)
  if (win.isMaximized()) {
    return { wasMaximized: true, bounds: win.getNormalBounds() }
  }
  if (session.isPseudoMaximized && session.normalBounds) {
    return { wasMaximized: true, bounds: { ...session.normalBounds } }
  }
  return { wasMaximized: false, bounds: win.getBounds() }
}

/** Exit maximized / pseudo-maximized so the window can be resized freely. */
export function leaveMaximizedState(win: BrowserWindow): void {
  const session = getSession(win)
  if (win.isMaximized()) {
    win.unmaximize()
  } else if (session.isPseudoMaximized && session.normalBounds) {
    win.setBounds(session.normalBounds)
  }
  session.isPseudoMaximized = false
  session.normalBounds = null
}

export function clearMaximizeSession(win: BrowserWindow): void {
  const session = sessions.get(win)
  if (!session) return
  session.isPseudoMaximized = false
  session.normalBounds = null
}

/** After filling work area without native maximize (e.g. mini-player restore). */
export function markPseudoMaximized(win: BrowserWindow, normalBounds: Electron.Rectangle): void {
  const session = getSession(win)
  session.isPseudoMaximized = true
  session.normalBounds = { ...normalBounds }
}

/**
 * Toggle maximize ↔ windowed. Safe for transparent frameless main window.
 * No-op while the main window is in mini-player mode.
 */
export function toggleWindowMaximize(win: BrowserWindow): { ok: boolean } {
  if (win.isDestroyed() || isMiniMode(win)) {
    return { ok: false }
  }

  const session = getSession(win)

  if (win.isMaximized()) {
    win.unmaximize()
    session.isPseudoMaximized = false
    return { ok: true }
  }

  if (session.isPseudoMaximized) {
    if (session.normalBounds) {
      win.setBounds(session.normalBounds)
    }
    session.isPseudoMaximized = false
    session.normalBounds = null
    return { ok: true }
  }

  // Mini-player may leave maximizable=false or a tiny max size; clear for main UI.
  if (!win.isMaximizable()) {
    win.setMaximizable(true)
  }
  const [maxW, maxH] = win.getMaximumSize()
  const display = screen.getDisplayMatching(win.getBounds())
  const work = display.workArea
  if ((maxW > 0 && maxW < work.width) || (maxH > 0 && maxH < work.height)) {
    // 0,0 = no artificial ceiling on Windows/Electron for restore-to-maximize.
    win.setMaximumSize(0, 0)
  }

  session.normalBounds = win.getBounds()
  win.maximize()

  if (win.isMaximized()) {
    session.isPseudoMaximized = false
    return { ok: true }
  }

  // Native maximize did not take (common with transparent: true on Windows).
  win.setBounds({
    x: work.x,
    y: work.y,
    width: work.width,
    height: work.height,
  })
  session.isPseudoMaximized = true
  return { ok: true }
}
