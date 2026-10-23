import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, shallowRef, type EffectScope } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { useAlbumGridLayout } from './useAlbumGridLayout'
import { useAlbumLayoutTransition } from './useAlbumLayoutTransition'
import type {
  AlbumTransitionRect,
  AlbumTransitionVisual,
} from '../utils/albumGridTransitionController'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { error: vi.fn() },
}))

class Rect {
  constructor(
    public left = 0,
    public top = 0,
    public width = 0,
    public height = 0,
  ) {}
  get right() {
    return this.left + this.width
  }
  get bottom() {
    return this.top + this.height
  }
  static fromRect({ x = 0, y = 0, width = 0, height = 0 }: DOMRectInit) {
    return new Rect(x, y, width, height)
  }
}
// Normalize capture removal to the options-object form required by Node EventTarget.
class Events extends EventTarget {
  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    super.removeEventListener(
      type,
      callback,
      typeof options === 'boolean' ? { capture: options } : options,
    )
  }
}
class ElementHost extends Events {
  dataset: Record<string, string> = {}
  classes = new Set<string>()
  classList = { contains: (value: string) => this.classes.has(value) }
  children: ElementHost[] = []
  parent: ElementHost | null = null
  isConnected = true
  clientLeft = 2
  clientTop = 3
  clientWidth = 985
  clientHeight = 650
  scrollTop = 0
  opacity = '0.6'
  rect = new Rect(100, 50, 985, 650)
  focus = vi.fn(() => {
    doc.activeElement = this
  })
  getBoundingClientRect() {
    return this.rect
  }
  append(child: ElementHost) {
    this.children.push(child)
    child.parent = this
    return child
  }
  matches(selector: string): boolean {
    if (selector === '.album-card[data-album-key]')
      return this.classes.has('album-card') && Boolean(this.dataset.albumKey)
    if (selector === '[data-lyrics-toggle], [data-sidebar-toggle]')
      return 'lyricsToggle' in this.dataset || 'sidebarToggle' in this.dataset
    return selector.startsWith('.') && this.classes.has(selector.slice(1))
  }
  closest(selector: string): ElementHost | null {
    return this.matches(selector) ? this : (this.parent?.closest(selector) ?? null)
  }
  querySelectorAll(selector: string): ElementHost[] {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ])
  }
  querySelector(selector: string): ElementHost | null {
    return this.querySelectorAll(selector)[0] ?? null
  }
}
const doc = Object.assign(new Events(), { activeElement: null as ElementHost | null })
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
const scopes: EffectScope[] = []
const sessions: ReturnType<typeof useAlbumLayoutTransition>[] = []
beforeEach(() => {
  vi.clearAllMocks()
  doc.activeElement = null
  vi.stubGlobal('document', doc)
  vi.stubGlobal('HTMLElement', ElementHost)
  vi.stubGlobal('Element', ElementHost)
  vi.stubGlobal('DOMRect', Rect)
  vi.stubGlobal('getComputedStyle', (element: ElementHost) => ({
    opacity: element.opacity,
    paddingTop: '24px',
    paddingBottom: '32px',
  }))
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
})
afterEach(() => {
  sessions.splice(0).forEach((session) => session.cancelCurrentTransition())
  scopes.splice(0).forEach((scope) => scope.stop())
  frames.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function settle() {
  for (let i = 0; i < 3; i++) await nextTick()
}
async function frame() {
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach((callback) => callback(0))
  await settle()
}
function card(key: string, top = 100) {
  const element = new ElementHost()
  element.classes.add('album-card')
  element.dataset.albumKey = key
  element.rect = new Rect(122, top, 173, 250)
  for (const name of ['cover-stage', 'album-card-play', 'other-control']) {
    const control = element.append(new ElementHost())
    control.classes.add(name)
  }
  return element
}
function setup() {
  const host = new ElementHost()
  const row = host.append(new ElementHost())
  row.classes.add('albums-grid-row')
  row.dataset.rowIndex = '0'
  const first = row.append(card('album-0'))
  const second = row.append(card('album-1'))
  const container = shallowRef<HTMLElement | null>(host as unknown as HTMLElement)
  const isPageActive = ref(true)
  const layer = {
    prepareSources:
      vi.fn<(viewport: AlbumTransitionRect, sources: readonly AlbumTransitionVisual[]) => void>(),
    commitTargets: vi.fn(),
    captureVisuals: vi.fn<() => AlbumTransitionVisual[]>(() => []),
    captureViewport: vi.fn(() => ({ left: 110, top: 55, width: 750, height: 650 })),
    animate: vi.fn<(duration: number) => Promise<void>>(async () => undefined),
    clear: vi.fn(),
  }
  const layerRef =
    shallowRef<Parameters<typeof useAlbumLayoutTransition>[0]['layer']['value']>(layer)
  const scope = effectScope()
  scopes.push(scope)
  const measure = vi.fn()
  const grid = scope.run(() =>
    useAlbumGridLayout({
      container,
      isActive: isPageActive,
      isResizing: ref(false),
      albumKeys: ref(Array.from({ length: 120 }, (_, index) => `album-${index}`)),
      measure,
    }),
  )!
  grid.update(false)
  const begin = vi.spyOn(grid, 'beginTransition')
  const commit = vi.spyOn(grid, 'commitTransitionTarget')
  const end = vi.spyOn(grid, 'endTransition')
  const cancelDrop = vi.fn()
  const requestCancel = vi.fn()
  const session = useAlbumLayoutTransition({
    container,
    layer: layerRef,
    isPageActive,
    grid,
    getVirtualRows: () => [{ index: 0, start: 0, size: grid.rowHeight.value }],
    cancelDrop,
    requestCancel,
  })
  sessions.push(session)
  return {
    host,
    row,
    first,
    second,
    container,
    isPageActive,
    layer,
    layerRef,
    grid,
    begin,
    commit,
    end,
    measure,
    cancelDrop,
    requestCancel,
    session,
    p: session.participant,
  }
}
function key(target: ElementHost, value: string) {
  const event = Object.assign(new Event('keydown', { cancelable: true }), { key: value })
  Object.defineProperty(event, 'target', { value: target })
  doc.dispatchEvent(event)
  return event
}

describe('album layout transition session', () => {
  it('captures intersecting source cards, viewport borders and opacity before locking the grid', () => {
    const f = setup()
    f.row.append(card('outside', 1000))
    const zero = f.row.append(card('zero'))
    zero.rect.width = 0
    f.second.opacity = 'invalid'
    expect(f.p.prepareLyricsLayoutTransition(1)).toBe(true)
    expect(f.cancelDrop).toHaveBeenCalledOnce()
    expect(f.begin).toHaveBeenCalledOnce()
    expect(f.layer.prepareSources).toHaveBeenCalledWith(
      { left: 102, top: 53, width: 985, height: 650 },
      [
        expect.objectContaining({ key: 'album-0', opacity: 0.6 }),
        expect.objectContaining({ key: 'album-1', opacity: 1 }),
      ],
    )
    f.host.clientWidth = 685
    expect(f.grid.update()).toBe(false)
    expect(f.grid.columnCount.value).toBe(5)
  })

  it.each(['inactive', 'detached', 'no-container', 'no-layer'] as const)(
    'refuses prepare on %s after cancelling drop',
    (cause) => {
      const f = setup()
      if (cause === 'inactive') f.isPageActive.value = false
      if (cause === 'detached') f.host.isConnected = false
      if (cause === 'no-container') f.container.value = null
      if (cause === 'no-layer') f.layerRef.value = null
      expect(f.p.prepareLyricsLayoutTransition(1)).toBe(false)
      expect(f.cancelDrop).toHaveBeenCalledOnce()
      expect(f.begin).not.toHaveBeenCalled()
      expect(f.layer.prepareSources).not.toHaveBeenCalled()
    },
  )

  it('commits geometry and remapped scroll before collecting targets after the frame boundary', async () => {
    const f = setup()
    f.host.scrollTop = 10
    expect(f.p.prepareLyricsLayoutTransition(1)).toBe(true)
    f.host.clientWidth = 685
    const result = f.p.commitLyricsLayoutTransition(1)
    expect(f.commit).toHaveBeenCalledOnce()
    expect(f.grid.columnCount.value).toBe(3)
    expect(f.layer.commitTargets).not.toHaveBeenCalled()
    await settle()
    expect(frames.size).toBe(1)
    expect(f.layer.commitTargets).not.toHaveBeenCalled()
    await frame()
    expect(await result).toBe(true)
    expect(f.layer.commitTargets).toHaveBeenCalledWith(
      { left: 102, top: 53, width: 685, height: 650 },
      [
        expect.objectContaining({
          key: 'album-0',
          rect: { left: 122, top: 67, width: 605 / 3, height: f.grid.rowHeight.value },
        }),
        expect.objectContaining({ key: 'album-1' }),
      ],
    )
    await f.p.animateLyricsLayoutTransition(1, 200)
    expect(f.layer.animate).toHaveBeenCalledWith(200)
    await f.p.finishLyricsLayoutTransition(1)
    expect(f.session.isLayoutTransitionActive.value).toBe(false)
    f.host.clientWidth = 985
    expect(f.grid.update()).toBe(true)
  })

  it('reverses from captured visuals without relocking or replacing the original keyed focus', async () => {
    const f = setup()
    f.first.querySelector('.album-card-play')!.focus()
    expect(f.p.prepareLyricsLayoutTransition(1)).toBe(true)
    const snapshot = {
      key: 'album-0',
      node: f.first as unknown as HTMLElement,
      rect: { left: 120, top: 70, width: 173, height: 250 },
      opacity: 0.3,
      snapshotOwned: true,
    }
    f.layer.captureVisuals.mockReturnValue([snapshot])
    doc.activeElement = null
    expect(f.p.prepareLyricsLayoutTransition(2)).toBe(true)
    expect(f.begin).toHaveBeenCalledOnce()
    expect(f.layer.prepareSources).toHaveBeenLastCalledWith(
      f.layer.captureViewport.mock.results[0].value,
      [snapshot],
    )
    key(f.host, 'Tab')
    expect(f.requestCancel).toHaveBeenCalledOnce()
    await f.p.finishLyricsLayoutTransition(1)
    f.p.cancelLyricsLayoutTransition(1)
    await f.p.animateLyricsLayoutTransition(1, 200)
    expect(await f.p.commitLyricsLayoutTransition(1)).toBe(false)
    expect(f.layer.clear).not.toHaveBeenCalled()
    expect(f.layer.animate).not.toHaveBeenCalled()
    expect(f.session.isLayoutTransitionActive.value).toBe(true)
    const replacement = card('album-0')
    f.row.children = [f.second, replacement]
    await f.p.finishLyricsLayoutTransition(2)
    expect(replacement.querySelector('.album-card-play')!.focus).toHaveBeenCalledOnce()
  })

  it.each([
    'cancel',
    'reverse',
    'inactive',
    'detach',
    'replace-container',
    'replace-layer',
  ] as const)('rejects commit invalidated before Vue flush: %s', async (cause) => {
    const f = setup()
    f.p.prepareLyricsLayoutTransition(1)
    const pending = f.p.commitLyricsLayoutTransition(1)
    if (cause === 'cancel') f.session.cancelCurrentTransition()
    if (cause === 'reverse') f.p.prepareLyricsLayoutTransition(2)
    if (cause === 'inactive') f.isPageActive.value = false
    if (cause === 'detach') f.host.isConnected = false
    if (cause === 'replace-container')
      f.container.value = new ElementHost() as unknown as HTMLElement
    if (cause === 'replace-layer') f.layerRef.value = { ...f.layer }
    expect(await pending).toBe(false)
    expect(frames.size).toBe(0)
    expect(f.layer.commitTargets).not.toHaveBeenCalled()
  })

  it.each(['cancel', 'reverse', 'inactive', 'detach', 'replace-layer'] as const)(
    'rejects a late frame after %s',
    async (cause) => {
      const f = setup()
      f.p.prepareLyricsLayoutTransition(1)
      const pending = f.p.commitLyricsLayoutTransition(1)
      await settle()
      if (cause === 'cancel') f.session.cancelCurrentTransition()
      if (cause === 'reverse') f.p.prepareLyricsLayoutTransition(2)
      if (cause === 'inactive') f.isPageActive.value = false
      if (cause === 'detach') f.host.isConnected = false
      if (cause === 'replace-layer') f.layerRef.value = { ...f.layer }
      await frame()
      expect(await pending).toBe(false)
      expect(f.layer.commitTargets).not.toHaveBeenCalled()
    },
  )

  it.each(['measure', 'prepare', 'reverse-capture'] as const)(
    'clears partial preparation on %s failure',
    (stage) => {
      const f = setup()
      const failure = new Error(stage)
      if (stage === 'reverse-capture') {
        f.p.prepareLyricsLayoutTransition(1)
        f.layer.captureVisuals.mockImplementationOnce(() => {
          throw failure
        })
      } else if (stage === 'measure')
        vi.spyOn(f.host, 'getBoundingClientRect').mockImplementationOnce(() => {
          throw failure
        })
      else
        f.layer.prepareSources.mockImplementationOnce(() => {
          throw failure
        })
      expect(f.p.prepareLyricsLayoutTransition(2)).toBe(false)
      expect(f.session.isLayoutTransitionActive.value).toBe(false)
      expect(f.layer.clear).toHaveBeenCalledOnce()
      expect(f.end).toHaveBeenCalledTimes(stage === 'measure' ? 0 : 1)
      expect(rendererDiagnostics.error).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'albums.transition', cause: failure }),
      )
      key(f.host, 'Tab')
      f.host.dispatchEvent(new Event('wheel'))
      expect(f.requestCancel).not.toHaveBeenCalled()
    },
  )

  it.each(['geometry', 'targets'] as const)(
    'reports commit %s failure and leaves final settlement to the shell',
    async (stage) => {
      const f = setup()
      f.p.prepareLyricsLayoutTransition(1)
      const failure = new Error(stage)
      if (stage === 'geometry')
        f.commit.mockImplementationOnce(() => {
          throw failure
        })
      else
        f.layer.commitTargets.mockImplementationOnce(() => {
          throw failure
        })
      const pending = f.p.commitLyricsLayoutTransition(1)
      await settle()
      await frame()
      expect(await pending).toBe(false)
      expect(f.layer.clear).toHaveBeenCalledOnce()
      expect(f.session.isLayoutTransitionActive.value).toBe(true)
      expect(f.end).not.toHaveBeenCalled()
      expect(rendererDiagnostics.error).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'albums.transition', cause: failure }),
      )
      f.session.cancelCurrentTransition()
      expect(f.session.isLayoutTransitionActive.value).toBe(false)
      expect(f.end).toHaveBeenCalledOnce()
    },
  )

  it('requests cancellation for navigation, wheel and touch without consuming toggle activation or ordinary keys', () => {
    const f = setup()
    f.p.prepareLyricsLayoutTransition(1)
    for (const name of ['lyricsToggle', 'sidebarToggle']) {
      const button = new ElementHost()
      button.dataset[name] = ''
      const icon = button.append(new ElementHost())
      key(icon, 'Enter')
      key(icon, ' ')
    }
    key(f.host, 'a')
    key(f.host, 'Escape')
    expect(f.requestCancel).not.toHaveBeenCalled()
    const keys = [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'PageUp',
      'PageDown',
      'Tab',
      'Enter',
      ' ',
    ]
    for (const value of keys) expect(key(f.host, value).defaultPrevented).toBe(false)
    f.host.dispatchEvent(new Event('wheel'))
    f.host.dispatchEvent(new Event('touchstart'))
    expect(f.requestCancel).toHaveBeenCalledTimes(keys.length + 2)
    f.session.cancelCurrentTransition()
    key(f.host, 'Tab')
    f.host.dispatchEvent(new Event('wheel'))
    f.host.dispatchEvent(new Event('touchstart'))
    expect(f.requestCancel).toHaveBeenCalledTimes(keys.length + 2)
  })

  it('ignores one remapped scroll within tolerance and cancels on subsequent user scroll', async () => {
    const f = setup()
    f.p.prepareLyricsLayoutTransition(1)
    const pending = f.p.commitLyricsLayoutTransition(1)
    await settle()
    f.host.scrollTop += 0.5
    f.host.dispatchEvent(new Event('scroll'))
    expect(f.requestCancel).not.toHaveBeenCalled()
    f.host.dispatchEvent(new Event('scroll'))
    expect(f.requestCancel).toHaveBeenCalledOnce()
    await frame()
    expect(await pending).toBe(true)
    f.session.cancelCurrentTransition()
    f.p.prepareLyricsLayoutTransition(2)
    f.host.dispatchEvent(new Event('scroll'))
    expect(f.requestCancel).toHaveBeenCalledTimes(2)
  })

  it.each(['cover-stage', 'album-card-play', 'other-control'])(
    'restores keyed %s focus after completion',
    async (control) => {
      const f = setup()
      f.first.querySelector(`.${control}`)!.focus()
      f.p.prepareLyricsLayoutTransition(1)
      const replacement = card('album-0')
      f.row.children = [f.second, replacement]
      const pending = f.p.finishLyricsLayoutTransition(1)
      const expected = replacement.querySelector(
        control === 'album-card-play' ? '.album-card-play' : '.cover-stage',
      )!
      expect(expected.focus).not.toHaveBeenCalled()
      await pending
      expect(doc.activeElement).toBe(expected)
      expect(f.end).toHaveBeenCalledOnce()
    },
  )

  it.each(['cancel', 'inactive', 'detached', 'removed-card'] as const)(
    'does not restore focus after %s',
    async (cause) => {
      const f = setup()
      const control = f.first.querySelector('.cover-stage')!
      control.focus()
      f.p.prepareLyricsLayoutTransition(1)
      control.focus.mockClear()
      if (cause === 'cancel') f.session.cancelCurrentTransition()
      const pending = f.p.finishLyricsLayoutTransition(1)
      if (cause === 'inactive') f.isPageActive.value = false
      if (cause === 'detached') f.host.isConnected = false
      if (cause === 'removed-card') f.row.children = [f.second]
      await pending
      expect(control.focus).not.toHaveBeenCalled()
    },
  )
})
