import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, type Ref } from 'vue'
import App from './App.vue'
import { useLyricsPanelVisibility } from './features/appearance/composables/useLyricsPanelVisibility'
import { useLyricsPanelMode } from './features/appearance/composables/useLyricsPanelMode'
import { useLyricsPanelWidth } from './features/appearance/composables/useLyricsPanelWidth'
import { useSidebarLayout } from './features/appearance/composables/useSidebarLayout'
import { usePlayerDisplayMode } from './features/playback/composables/usePlayerDisplayMode'
import { useSettingsDialog } from './features/settings/composables/useSettingsDialog'
import { albumIdentityKey } from '@shared/utils/albumIdentity'
import {
  beginCdViewSwitchTransition,
  clearCdViewSwitchTransition,
} from './features/albums/utils/cdViewSwitchTransition'
import {
  ShellTestElement,
  ShellTestRect,
  ShellTestStyle,
  shellTestDocument as doc,
  shellTestRenderer,
} from '@renderer/testUtils/rendererTestHost'

const fixture = vi.hoisted(() => ({
  route: null as unknown as { name: string; fullPath: string; query: Record<string, string> },
  width: null as unknown as Ref<number>,
  startup: null as unknown as Ref<boolean>,
  before: new Set<() => void>(),
  after: new Set<(to: unknown, from: unknown, failure?: unknown) => void>(),
  hooks: {} as Record<string, unknown>,
  prepare: vi.fn(() => true),
  commit: vi.fn(async () => true),
  animate: vi.fn(async () => {}),
  finish: vi.fn(async () => {}),
  cancel: vi.fn(),
  prepareDisplay: vi.fn(async () => {}),
  requestClose: vi.fn(),
  syncCd: vi.fn(),
}))
vi.mock('./features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({
    state: { currentTrackId: 7, currentTrack: { id: 7, artworkCacheKey: 'playing-cover' } },
  }),
}))
vi.mock('vue-router', async () => {
  const { reactive, h } = await import('vue')
  fixture.route = reactive({ name: 'library', fullPath: '/library', query: {} })
  const page = {
    name: 'AlbumsPage',
    setup(_props: unknown, { expose }: { expose: (value: unknown) => void }) {
      expose({
        prepareLyricsLayoutTransition: fixture.prepare,
        commitLyricsLayoutTransition: fixture.commit,
        animateLyricsLayoutTransition: fixture.animate,
        finishLyricsLayoutTransition: fixture.finish,
        cancelLyricsLayoutTransition: fixture.cancel,
      })
      return () => h('section', { class: 'test-page' })
    },
  }
  return {
    useRoute: () => fixture.route,
    RouterView: {
      setup(_props: unknown, { slots }: { slots: { default: (args: unknown) => unknown } }) {
        return () => slots.default({ Component: page, route: fixture.route })
      },
    },
  }
})
vi.mock('./app/router', () => ({
  router: {
    beforeEach: (cb: () => void) => {
      fixture.before.add(cb)
      return () => fixture.before.delete(cb)
    },
    afterEach: (cb: (to: unknown, from: unknown, failure?: unknown) => void) => {
      fixture.after.add(cb)
      return () => fixture.after.delete(cb)
    },
  },
}))
vi.mock('vue', async (original) => {
  const actual = await original<typeof import('vue')>()
  return {
    ...actual,
    Transition: {
      inheritAttrs: false,
      setup(
        _props: unknown,
        { attrs, slots }: { attrs: Record<string, unknown>; slots: { default: () => unknown } },
      ) {
        fixture.hooks = attrs
        return () => slots.default()
      },
    },
  }
})
vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')
  fixture.width = ref(1600)
  return { useElementSize: () => ({ width: fixture.width }) }
})
vi.mock('./features/startupAlbum/useStartupAlbum', async () => {
  const { ref } = await import('vue')
  fixture.startup = ref(false)
  return {
    useStartupAlbum: () => ({
      active: fixture.startup,
      presentation: null,
      overlay: null,
      shown: vi.fn(),
      close: vi.fn(),
    }),
  }
})
vi.mock('./features/playback/composables/useSystemMediaIntegration', () => ({
  useSystemMediaIntegration: vi.fn(),
}))
vi.mock('./features/albums/composables/useCdCanvasTheme', () => ({
  useCdCanvasTheme: () => ({ cdCanvasTheme: 'light' }),
}))
vi.mock('./shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn(), error: vi.fn() },
}))
vi.mock('./app/layout/AppSidebar.vue', () => ({
  default: { setup: () => () => h('aside', { class: 'app-sidebar' }) },
}))
vi.mock('@renderer/shared/components/WindowTrafficLights.vue', () => ({
  default: { render: () => null },
}))
vi.mock('./app/layout/PlayerBar.vue', () => ({
  default: {
    render: () =>
      h('div', { class: 'player-bar' }, [h('div', { class: 'player-bar-island' }, [h('button')])]),
  },
}))
vi.mock('./app/layout/FullscreenPlayerOverlay.vue', () => ({ default: { render: () => null } }))
vi.mock('./features/library/components/AlbumMetadataEditDialog.vue', () => ({
  default: { render: () => null },
}))
vi.mock('./features/settings/components/SettingsDialog.vue', () => ({
  default: { render: () => null },
}))
vi.mock('./app/layout/PageParameterPanel.vue', () => ({
  default: { render: () => h('div', { class: 'test-parameters' }) },
}))
vi.mock('./app/layout/TrackEditorDialog.vue', () => ({
  default: {
    setup(_props: unknown, { expose }: { expose: (value: unknown) => void }) {
      expose({ requestClose: fixture.requestClose })
      return () => h('div', { class: 'test-editor' })
    },
  },
}))
vi.mock('./features/albums/components/CdViewSwitch.vue', () => ({
  default: {
    setup(_props: unknown, { expose }: { expose: (value: unknown) => void }) {
      expose({ syncToCurrent: fixture.syncCd })
      return () => h('div', { class: 'test-cd-switch' })
    },
  },
}))
vi.mock('./app/layout/NowPlayingPanel.vue', () => ({
  default: {
    setup(_props: unknown, { expose }: { expose: (value: unknown) => void }) {
      expose({ prepareForDisplay: fixture.prepareDisplay })
      return () =>
        h('aside', { class: 'now-playing-panel' }, [
          h('div', { class: 'now-playing-panel-content' }),
        ])
    },
  },
}))

let unmount: (() => void) | null = null
let win: EventTarget
let motion: EventTarget & { matches: boolean }
let breakpoint: EventTarget & { matches: boolean }
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
const lyrics = useLyricsPanelVisibility()
const mode = useLyricsPanelMode()
const widths = useLyricsPanelWidth()
const sidebar = useSidebarLayout()
const display = usePlayerDisplayMode()
const settings = useSettingsDialog()
const find = (selector: string) => {
  const node = doc.body.querySelector(selector)
  if (!node) throw new Error(`Missing ${selector}`)
  return node
}
async function flush() {
  for (let i = 0; i < 8; i++) await nextTick()
}
async function frame() {
  const callbacks = [...frames.values()]
  frames.clear()
  callbacks.forEach((callback) => callback(16))
  await flush()
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
async function mount(route = 'library') {
  Object.assign(fixture.route, { name: route, fullPath: `/${route}`, query: {} })
  const root = new ShellTestElement()
  doc.body.append(root)
  const app = shellTestRenderer.createApp(App)
  app.mount(root)
  unmount = () => {
    app.unmount()
    unmount = null
  }
  await flush()
}
async function navigate(name: string, failure?: unknown, query: Record<string, string> = {}) {
  const from = { ...fixture.route }
  const to = { name, fullPath: `/${name}`, query }
  for (const cb of fixture.before) cb()
  if (!failure) Object.assign(fixture.route, to)
  for (const cb of fixture.after) cb(to, from, failure)
  await flush()
}
function hook(name: string, element: ShellTestElement) {
  const callbacks = fixture.hooks[name]
  for (const cb of Array.isArray(callbacks) ? callbacks : [callbacks])
    if (typeof cb === 'function') cb(element)
}
async function finishAnimations() {
  for (const node of doc.body.querySelectorAll('*'))
    for (const animation of node.animations) if (!animation.cancelled) animation.finish()
  await flush()
}
beforeEach(() => {
  vi.clearAllMocks()
  fixture.prepare.mockReturnValue(true)
  fixture.commit.mockResolvedValue(true)
  fixture.prepareDisplay.mockResolvedValue()
  fixture.animate.mockResolvedValue()
  fixture.finish.mockResolvedValue()
  doc.body.replaceChildren()
  doc.body.className = ''
  doc.activeElement = doc.body
  win = new EventTarget()
  motion = Object.assign(new EventTarget(), { matches: false })
  breakpoint = Object.assign(new EventTarget(), { matches: true })
  vi.stubGlobal(
    'window',
    Object.assign(win, {
      innerWidth: 1600,
      matchMedia: (query: string) => (query.includes('1280') ? breakpoint : motion),
    }),
  )
  vi.stubGlobal('document', doc)
  vi.stubGlobal('HTMLElement', ShellTestElement)
  vi.stubGlobal('Element', ShellTestElement)
  vi.stubGlobal('DOMRect', ShellTestRect)
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      m41: number
      constructor(transform: string) {
        this.m41 = Number(/translate3d\(([-\d.]+)/u.exec(transform)?.[1] ?? 0)
      }
    },
  )
  vi.stubGlobal('getComputedStyle', (node: ShellTestElement) =>
    Object.assign(new ShellTestStyle(), { opacity: '1', transform: 'none' }, node.style),
  )
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(++frameId, cb)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  fixture.width.value = 1600
  fixture.startup.value = false
  lyrics.setLyricsPanelExpanded(true)
  mode.setMode('split')
  widths.setLyricsPanelWidth(0)
  sidebar.setSidebarFullHeight(true)
  sidebar.setSidebarCollapsed(false)
  sidebar.setSidebarWidth(260)
  display.showNormalPlayer()
  settings.closeSettings()
})
afterEach(() => {
  unmount?.()
  frames.clear()
  vi.unstubAllGlobals()
  expect(fixture.before.size).toBe(0)
  expect(fixture.after.size).toBe(0)
})

describe('App shell composition', () => {
  it('reverses from painted position and ignores the cancelled animation completion', async () => {
    await mount()
    const panel = find('.now-playing-panel')
    lyrics.setLyricsPanelExpanded(false)
    await flush()
    const oldMovement = panel.animations[0]
    panel.style.transform = 'translate3d(160px, 0, 0)'
    lyrics.setLyricsPanelExpanded(true)
    await flush()
    const movement = panel.animations[2]
    expect(movement.keyframes).toEqual([
      { transform: 'translate3d(160px, 0, 0)' },
      { transform: 'translate3d(0px, 0, 0)' },
    ])
    oldMovement.finish()
    await flush()
    expect(panel.props.isInteractive).toBe(false)
    movement.finish()
    await flush()
    expect(panel.props.isInteractive).toBe(true)
    expect(panel.props.isCollapsed).toBe(false)
    expect(panel.style.transform).toBeUndefined()
  })

  it.each(['resize', 'fullscreen', 'route', 'motion', 'mode', 'unmount'])(
    'settles a pending display preparation on %s',
    async (cause) => {
      lyrics.setLyricsPanelExpanded(false)
      await mount()
      const ready = deferred<void>()
      fixture.prepareDisplay.mockReturnValueOnce(ready.promise)
      lyrics.setLyricsPanelExpanded(true)
      await flush()
      const panel = find('.now-playing-panel')
      expect(fixture.prepareDisplay).toHaveBeenCalledOnce()
      if (cause === 'resize') win.dispatchEvent(new Event('resize'))
      if (cause === 'fullscreen') display.showFullscreenPlayer()
      if (cause === 'route') await navigate('albums')
      if (cause === 'motion') {
        motion.matches = true
        motion.dispatchEvent(Object.assign(new Event('change'), { matches: true }))
      }
      if (cause === 'mode') mode.setMode('floating')
      if (cause === 'unmount') unmount?.()
      await flush()
      ready.resolve()
      await flush()
      expect(panel.animations).toHaveLength(0)
      expect(doc.body.querySelectorAll('.lyrics-layout-playerbar-snapshot')).toHaveLength(0)
      if (cause !== 'unmount') {
        expect(panel.props.isInteractive).toBe(true)
        expect(find('.app-shell').classList.contains('is-lyrics-resizing')).toBe(false)
      }
    },
  )

  it.each(['prepare', 'commit'])(
    'settles the album shell when the participant refuses %s',
    async (phase) => {
      await mount('albums')
      if (phase === 'prepare') fixture.prepare.mockReturnValueOnce(false)
      else fixture.commit.mockResolvedValueOnce(false)
      lyrics.setLyricsPanelExpanded(false)
      await flush()
      expect(find('.now-playing-panel').props.isCollapsed).toBe(true)
      expect(find('.app-shell').classList.contains('is-album-layout-transitioning')).toBe(false)
      expect(doc.body.querySelectorAll('.lyrics-layout-playerbar-snapshot')).toHaveLength(0)
      expect(find('.player-bar-island').style.opacity).toBeUndefined()
    },
  )

  it.each(['route', 'resize', 'fullscreen', 'unmount'])(
    'rejects the old album commit after %s',
    async (cause) => {
      await mount('albums')
      const commit = deferred<boolean>()
      fixture.commit.mockReturnValueOnce(commit.promise)
      lyrics.setLyricsPanelExpanded(false)
      await flush()
      expect(fixture.commit).toHaveBeenCalledOnce()
      if (cause === 'route') await navigate('library')
      if (cause === 'resize') win.dispatchEvent(new Event('resize'))
      if (cause === 'fullscreen') display.showFullscreenPlayer()
      if (cause === 'unmount') unmount?.()
      await flush()
      commit.resolve(true)
      await flush()
      await frame()
      await frame()
      expect(fixture.cancel).toHaveBeenCalledOnce()
      expect(fixture.animate).not.toHaveBeenCalled()
      expect(doc.body.querySelectorAll('.lyrics-layout-playerbar-snapshot')).toHaveLength(0)
    },
  )

  it('coordinates sidebar reversal and clears snapshots after completing the latest ticket', async () => {
    await mount('albums')
    sidebar.setSidebarCollapsed(true)
    await flush()
    await frame()
    await frame()
    expect(fixture.animate).toHaveBeenCalledOnce()
    sidebar.setSidebarCollapsed(false)
    await flush()
    await frame()
    await frame()
    expect(fixture.animate).toHaveBeenCalledTimes(2)
    await finishAnimations()
    expect(find('.app-shell').classList.contains('is-sidebar-collapsed')).toBe(false)
    expect(find('.app-shell').classList.contains('is-album-layout-transitioning')).toBe(false)
    expect(doc.body.querySelectorAll('.sidebar-layout-snapshot')).toHaveLength(0)
    expect(find('.app-sidebar').style.opacity ?? '').toBe('')
  })

  it('uses the live capped player bar and keeps toggles from settling its transition', async () => {
    await mount('albums')
    find('.player-bar-island').rect.width = 760
    lyrics.setLyricsPanelExpanded(false)
    await flush()
    await frame()
    await frame()
    expect(fixture.animate).toHaveBeenCalledOnce()
    expect(doc.body.querySelectorAll('.lyrics-layout-playerbar-snapshot')).toHaveLength(0)
    const toggle = new ShellTestElement('button')
    toggle.setAttribute('data-lyrics-toggle', '')
    const pointer = new Event('pointerdown')
    Object.defineProperty(pointer, 'target', { value: toggle })
    doc.dispatchEvent(pointer)
    expect(fixture.cancel).not.toHaveBeenCalled()
    const button = find('.player-bar-island').querySelector('button')!
    const press = Object.assign(new Event('pointerdown'), { pointerId: 3 })
    Object.defineProperty(press, 'target', { value: button })
    doc.dispatchEvent(press)
    expect(button.captures.has(3)).toBe(true)
    const click = new Event('click')
    Object.defineProperty(click, 'target', { value: button })
    doc.dispatchEvent(click)
    await flush()
    expect(fixture.cancel).toHaveBeenCalledOnce()
    expect(find('.now-playing-panel').props.isCollapsed).toBe(true)
    expect(doc.body.querySelectorAll('.lyrics-layout-playerbar-snapshot')).toHaveLength(0)
  })

  it('does not let an old participant finish clear a newer album transition', async () => {
    await mount('albums')
    const finish = deferred<void>()
    fixture.finish.mockReturnValueOnce(finish.promise)
    lyrics.setLyricsPanelExpanded(false)
    await flush()
    await frame()
    await frame()
    await finishAnimations()
    expect(fixture.finish).toHaveBeenCalledOnce()
    lyrics.setLyricsPanelExpanded(true)
    await flush()
    await frame()
    await frame()
    finish.resolve()
    await flush()
    expect(find('.app-shell').classList.contains('is-album-layout-transitioning')).toBe(true)
    await finishAnimations()
    expect(find('.now-playing-panel').props.isInteractive).toBe(true)
    expect(find('.app-shell').classList.contains('is-album-layout-transitioning')).toBe(false)
  })

  it('preserves preferred width, cancels dragging on mode change and releases the body cursor', async () => {
    await mount()
    widths.setLyricsPanelWidth(640)
    fixture.width.value = 1000
    await flush()
    expect(find('.now-playing-panel').props.targetWidthPx).toBe(260)
    expect(widths.lyricsPanelWidth.value).toBe(640)
    fixture.width.value = 1600
    await flush()
    const panel = find('.now-playing-panel')
    const handle = new ShellTestElement('button')
    const start = {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: 900,
      currentTarget: handle,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }
    ;(panel.props.onResizePointerDown as (event: unknown) => void)(start)
    expect(doc.body.classList.contains('is-column-resizing')).toBe(true)
    mode.setMode('floating')
    await flush()
    expect(doc.body.classList.contains('is-column-resizing')).toBe(false)
    expect(widths.lyricsPanelWidth.value).toBe(640)
    expect(handle.captures.size).toBe(0)
  })

  it('keeps fullscreen columns, then removes lyrics layout below the breakpoint', async () => {
    await mount()
    const shell = find('.app-shell')
    const width = shell.style['--auralis-lyrics-column-width']
    display.showFullscreenPlayer()
    await flush()
    expect(find('.app-window').inert).toBe(true)
    expect(shell.style['--auralis-lyrics-column-width']).toBe(width)
    expect(find('.now-playing-panel').props.resizeDisabled).toBe(true)
    breakpoint.matches = false
    breakpoint.dispatchEvent(Object.assign(new Event('change'), { matches: false }))
    await flush()
    expect(shell.style['--auralis-lyrics-column-width']).toBe('0px')
  })

  it('requests editor closure without discarding it, and blocks page parameters across overlays', async () => {
    await mount()
    settings.openSettings()
    await flush()
    const trigger = new ShellTestElement('button')
    ;(find('.now-playing-panel').props.onEditLyrics as (node: unknown) => void)(trigger)
    await flush()
    expect(settings.isSettingsOpen.value).toBe(false)
    expect((find('.test-editor').props.request as { returnFocusTo: unknown }).returnFocusTo).toBe(
      trigger,
    )
    expect((find('.test-editor').props.request as { initialTab: string }).initialTab).toBe('lyrics')
    expect(
      (find('.test-editor').props.request as { artworkCacheKey: string }).artworkCacheKey,
    ).toBe('playing-cover')
    const parameters = find('.test-parameters').props.controller as { supported: Ref<boolean> }
    expect(parameters.supported.value).toBe(false)
    settings.openSettings()
    await flush()
    expect(fixture.requestClose).toHaveBeenCalledOnce()
    expect(find('.test-editor').props.request).not.toBeNull()
    await navigate('albums')
    expect(fixture.requestClose).toHaveBeenCalledTimes(2)
    ;(find('.test-editor').props.onClose as () => void)()
    await flush()
    expect(parameters.supported.value).toBe(true)
    fixture.startup.value = true
    await flush()
    expect(parameters.supported.value).toBe(false)
  })

  it('keeps an editor that declines closure visible when fullscreen is requested', async () => {
    await mount()
    ;(find('.now-playing-panel').props.onEditLyrics as (node: unknown) => void)(null)
    await flush()
    display.showFullscreenPlayer()
    await flush()
    expect(display.displayMode.value).toBe('normal')
    expect(fixture.requestClose).toHaveBeenCalledOnce()
    expect(find('.test-editor').props.request).not.toBeNull()
  })

  it('ignores failed navigation and stale route completion while restoring the latest focus', async () => {
    await mount('albums')
    const main = find('.app-main')
    main.focus()
    await navigate('album-detail', new Error('cancelled'))
    expect(main.inert).toBe(false)
    expect(fixture.hooks.name).toBeUndefined()
    await navigate('album-detail', undefined, { artist: 'Artist', title: 'Album' })
    const old = new ShellTestElement()
    hook('onBeforeEnter', old)
    expect(main.inert).toBe(true)
    await navigate('albums')
    const latest = new ShellTestElement()
    hook('onBeforeEnter', latest)
    hook('onAfterEnter', old)
    await flush()
    expect(main.inert).toBe(true)
    const card = new ShellTestElement()
    card.className = 'album-card'
    card.setAttribute('data-album-key', albumIdentityKey('Artist', 'Album'))
    const cover = new ShellTestElement('button')
    cover.className = 'cover-stage'
    card.append(cover)
    main.append(card)
    hook('onAfterEnter', latest)
    await flush()
    expect(main.inert).toBe(false)
    expect(doc.activeElement).toBe(cover)
  })

  it('preserves outgoing inert state and respects focus moved to the player bar', async () => {
    await mount('albums')
    find('.app-main').focus()
    await navigate('album-detail')
    const outgoing = new ShellTestElement()
    outgoing.inert = true
    hook('onBeforeLeave', outgoing)
    hook('onAfterLeave', outgoing)
    expect(outgoing.inert).toBe(true)
    const incoming = new ShellTestElement()
    hook('onBeforeEnter', incoming)
    const button = find('.player-bar-island').querySelector('button')!
    button.focus()
    hook('onEnterCancelled', incoming)
    await flush()
    expect(find('.app-main').inert).toBe(false)
    expect(doc.activeElement).toBe(button)
  })

  it('selects CD directional transitions only for the switch intent', async () => {
    await mount('cd-albums')
    const intent = beginCdViewSwitchTransition('browse', 'index')
    await navigate('cd-album-index')
    expect(fixture.hooks.name).toBe('cd-index-slide')
    hook('onEnter', new ShellTestElement())
    expect(fixture.syncCd).toHaveBeenCalledWith(true)
    clearCdViewSwitchTransition(intent)
    expect(doc.body.querySelector('.now-playing-panel')).toBeNull()
  })
})
