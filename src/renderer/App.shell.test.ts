import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, watchEffect, type Ref } from 'vue'
import App from './App.vue'
import { useLyricsPanelVisibility } from './features/appearance/composables/useLyricsPanelVisibility'
import { useLyricsPanelMode } from './features/appearance/composables/useLyricsPanelMode'
import { useLyricsPanelWidth } from './features/appearance/composables/useLyricsPanelWidth'
import { useSidebarLayout } from './features/appearance/composables/useSidebarLayout'
import { usePlayerDisplayMode } from './features/playback/composables/usePlayerDisplayMode'
import { useSettingsDialog } from './features/settings/composables/useSettingsDialog'
import { useTheme } from './features/appearance/composables/useTheme'
import { useAlbumDetailArtworkPublisher } from './features/albums/albumDetailArtwork'
import {
  getAlbumColorPreference,
  setAlbumColorPreference,
} from './features/albums/albumColorPreferences'
import { albumDetailColors, cssAlbumColor } from './features/albums/albumDetailColors'
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
  before: new Set<() => void>(),
  after: new Set<(to: unknown, from: unknown, failure?: unknown) => void>(),
  hooks: {} as Record<string, unknown>,
  prepare: vi.fn(() => true),
  commit: vi.fn(async () => true),
  animate: vi.fn(async () => {}),
  finish: vi.fn(async () => {}),
  cancel: vi.fn(),
  prepareDisplay: vi.fn(async () => {}),
  syncCd: vi.fn(),
  paletteReady: null as unknown as Ref<boolean>,
  detailCover: false,
  detailCoverKey: 'test-cover',
  detailTrackIds: {} as Record<string, number>,
  publishDetailCover: null as null | ((key: string) => void),
}))
vi.mock('@renderer/shared/artwork/useArtworkPalette', async () => {
  const { computed, ref } = await import('vue')
  fixture.paletteReady = ref(true)
  return {
    useArtworkPalette: (key: Ref<string | null>) => ({
      palette: computed(() => ({
        key: key.value && fixture.paletteReady.value ? key.value : 'fallback',
        quality: key.value && fixture.paletteReady.value ? 'reduced' : 'fallback',
        dominant: key.value && fixture.paletteReady.value ? { r: 235, g: 30, b: 30 } : undefined,
      })),
    }),
  }
})
vi.mock('./features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({
    state: { currentTrackId: 7, currentTrack: { id: 7, artworkCacheKey: 'playing-cover' } },
  }),
}))
vi.mock('./features/playback/composables/useSystemMediaIntegration', () => ({
  useSystemMediaIntegration: vi.fn(),
}))
vi.mock('vue-router', async () => {
  const { reactive, h } = await import('vue')
  fixture.route = reactive({ name: 'library', fullPath: '/library', query: {} })
  const page = {
    name: 'AlbumsPage',
    setup(_props: unknown, { expose }: { expose: (value: unknown) => void }) {
      const publishArtwork = useAlbumDetailArtworkPublisher()
      if (fixture.detailCover && fixture.route.name === 'album-detail') {
        const owner = Symbol('test-detail')
        const anchors = () => [
          {
            id: fixture.detailTrackIds[fixture.route.query.artist ?? ''] ?? 7,
            createdAt: '2024-01-01',
          },
        ]
        fixture.publishDetailCover = (key) =>
          publishArtwork?.set(owner, key, anchors(), {
            artist: fixture.route.query.artist ?? '',
            title: fixture.route.query.title ?? '',
          })
        watchEffect(() =>
          publishArtwork?.set(owner, fixture.detailCoverKey, anchors(), {
            artist: fixture.route.query.artist ?? '',
            title: fixture.route.query.title ?? '',
          }),
        )
      }
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
vi.mock('./features/settings/components/SettingsDialog.vue', () => ({
  default: { render: () => null },
}))
vi.mock('./app/layout/PageParameterPanel.vue', () => ({
  default: { render: () => h('div', { class: 'test-parameters' }) },
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
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  fixture.width.value = 1600
  fixture.paletteReady.value = true
  fixture.detailCover = false
  fixture.detailCoverKey = 'test-cover'
  fixture.detailTrackIds = {}
  fixture.publishDetailCover = null
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
  it('does not write color preferences when navigating between albums sharing a cover', async () => {
    fixture.detailCover = true
    fixture.detailCoverKey =
      'v2-b91487d60e6713dacb4d01b24e7ed1436eeafba9b9f08171cadd10f9cc9c16e8.webp'
    fixture.detailTrackIds = { NewJeans: 8 }
    await mount('album-detail')
    fixture.route.query = { artist: 'Other Artist', title: 'Other Album' }
    await flush()
    const before = localStorage.getItem('auralis-album-color-preferences-v1')
    fixture.route.query = { artist: 'NewJeans', title: 'Supernatural' }
    await flush()
    expect(getAlbumColorPreference([{ id: 7, createdAt: '2024-01-01' }])).toBeNull()
    expect(getAlbumColorPreference([{ id: 8, createdAt: '2024-01-01' }])).toBeNull()
    expect(localStorage.getItem('auralis-album-color-preferences-v1')).toBe(before)
  })
  it('updates the detail accent when a saved album color changes and clears it on exit', async () => {
    fixture.detailCover = true
    await mount('album-detail')
    fixture.route.query = { artist: 'Artist', title: 'Album' }
    await flush()
    const shell = find('.app-shell')
    const custom = { r: 207, g: 255, b: 196 }
    expect(setAlbumColorPreference([{ id: 7, createdAt: '2024-01-01' }], custom)).toBe(true)
    await flush()
    const colors = albumDetailColors(custom)
    expect(shell.style.getPropertyValue('--album-detail-accent')).toBe(cssAlbumColor(colors.accent))
    expect(shell.style.getPropertyValue('--album-detail-accent-text')).toBe(
      cssAlbumColor(colors.accentText),
    )
    await navigate('albums')
    await flush()
    expect(shell.classList.contains('has-album-detail-color')).toBe(false)
  })
  it.each([
    [
      'NewJeans',
      'Supernatural',
      'v2-b91487d60e6713dacb4d01b24e7ed1436eeafba9b9f08171cadd10f9cc9c16e8.webp',
    ],
    [
      '你的婚礼 电影原声带',
      '你的婚礼 电影原声带',
      'v2-cc83d2eb92cc289bfd2fdd8637819af67f9a5d444466bd3cc1c1315691095a3d.webp',
    ],
  ])(
    'uses automatic color and preserves a saved preference for %s / %s',
    async (artist, title, key) => {
      fixture.detailCover = true
      fixture.detailCoverKey = key
      await mount('album-detail')
      fixture.route.query = { artist, title }
      await flush()
      const shell = find('.app-shell')
      const automatic = cssAlbumColor(albumDetailColors({ r: 235, g: 30, b: 30 }).main)
      expect(shell.style.getPropertyValue('--album-detail-main')).toBe(automatic)
      expect(localStorage.getItem('auralis-album-color-preferences-v1')).toBeNull()
      const saved = { r: 207, g: 255, b: 196 }
      expect(setAlbumColorPreference([{ id: 7, createdAt: '2024-01-01' }], saved)).toBe(true)
      await flush()
      expect(shell.style.getPropertyValue('--album-detail-main')).toBe(
        cssAlbumColor(albumDetailColors(saved).main),
      )
      expect(setAlbumColorPreference([{ id: 7, createdAt: '2024-01-01' }], null)).toBe(true)
      await flush()
      expect(shell.style.getPropertyValue('--album-detail-main')).toBe(automatic)
    },
  )
  it('starts the album colors together when the list-to-detail animation starts', async () => {
    fixture.detailCover = true
    await mount('albums')
    await navigate('album-detail')
    const shell = find('.app-shell')
    expect(shell.style.getPropertyValue('--album-detail-main')).toBeFalsy()
    const page = find('.test-page')
    hook('onBeforeEnter', page)
    hook('onEnter', page)
    for (let i = 0; i < 5; i++) await frame()
    expect(shell.style.getPropertyValue('--album-detail-main')).toBeTruthy()
    hook('onAfterEnter', page)
    await flush()
    expect(shell.style.getPropertyValue('--album-detail-main')).toBeTruthy()
    expect(shell.style.getPropertyValue('--album-detail-side')).toBeTruthy()
    expect(shell.style.getPropertyValue('--album-detail-lyrics-surface')).toBeTruthy()
    expect(shell.style.getPropertyValue('--album-detail-more')).toBeTruthy()
  })

  it('holds the album palette during entry and applies a late preference after the dissolve', async () => {
    fixture.detailCover = true
    await mount('albums')
    await navigate('album-detail', undefined, { artist: 'Artist', title: 'Album' })
    const shell = find('.app-shell')
    const page = find('.test-page')
    hook('onBeforeEnter', page)
    hook('onEnter', page)
    for (let i = 0; i < 5; i++) await frame()
    const initial = shell.style.getPropertyValue('--album-detail-main')
    const saved = { r: 207, g: 255, b: 196 }
    expect(setAlbumColorPreference([{ id: 7, createdAt: '2024-01-01' }], saved)).toBe(true)
    await flush()
    expect(shell.style.getPropertyValue('--album-detail-main')).toBe(initial)
    page.animations.forEach((animation) => animation.finish())
    await flush()
    expect(shell.style.getPropertyValue('--album-detail-main')).toBe(
      cssAlbumColor(albumDetailColors(saved).main),
    )
  })

  it('crossfades a late palette after the entry preparation times out', async () => {
    vi.useFakeTimers()
    const root = new ShellTestElement('html')
    const cleanup = vi.fn()
    const snapshot = vi.fn((update: () => Promise<void>) => {
      const updated = update()
      return { ready: updated, finished: updated, skipTransition: cleanup }
    })
    Object.assign(doc, { documentElement: root, startViewTransition: snapshot })
    try {
      fixture.detailCover = true
      fixture.paletteReady.value = false
      await mount('albums')
      await navigate('album-detail', undefined, { artist: 'Artist', title: 'Album' })
      const page = find('.test-page')
      const shell = find('.app-shell')
      hook('onBeforeEnter', page)
      hook('onEnter', page)
      await vi.advanceTimersByTimeAsync(1000)
      hook('onAfterEnter', page)
      await flush()
      expect(shell.style.getPropertyValue('--album-detail-main')).toBeFalsy()
      fixture.paletteReady.value = true
      await flush()
      expect(snapshot).toHaveBeenCalledOnce()
      expect(shell.style.getPropertyValue('--album-detail-main')).toBeTruthy()
      expect(root.classList.contains('album-palette-reveal')).toBe(false)
    } finally {
      unmount?.()
      Reflect.deleteProperty(doc, 'documentElement')
      Reflect.deleteProperty(doc, 'startViewTransition')
      vi.useRealTimers()
    }
  })

  it('applies late colors without intermediate transitions when snapshots are unavailable', async () => {
    vi.useFakeTimers()
    const root = new ShellTestElement('html')
    Object.assign(doc, { documentElement: root })
    try {
      fixture.detailCover = true
      fixture.paletteReady.value = false
      await mount('albums')
      await navigate('album-detail', undefined, { artist: 'Artist', title: 'Album' })
      const page = find('.test-page')
      const shell = find('.app-shell')
      hook('onBeforeEnter', page)
      hook('onEnter', page)
      await vi.advanceTimersByTimeAsync(1000)
      hook('onAfterEnter', page)
      await flush()
      fixture.paletteReady.value = true
      await flush()
      expect(shell.style.getPropertyValue('--album-detail-main')).toBeTruthy()
      expect(shell.classList.contains('album-palette-instant')).toBe(false)
    } finally {
      unmount?.()
      Reflect.deleteProperty(doc, 'documentElement')
      vi.useRealTimers()
    }
  })

  it('keeps transition suppression until a skipped snapshot update finishes', async () => {
    vi.useFakeTimers()
    const root = new ShellTestElement('html')
    const finished = deferred<void>()
    let update: (() => Promise<void>) | undefined
    Object.assign(doc, {
      documentElement: root,
      startViewTransition: (callback: () => Promise<void>) => {
        update = callback
        return {
          ready: Promise.reject(new Error('skipped')),
          finished: finished.promise,
          skipTransition: vi.fn(),
        }
      },
    })
    try {
      fixture.detailCover = true
      fixture.paletteReady.value = false
      await mount('albums')
      await navigate('album-detail', undefined, { artist: 'Artist', title: 'Album' })
      const page = find('.test-page')
      const shell = find('.app-shell')
      hook('onBeforeEnter', page)
      hook('onEnter', page)
      await vi.advanceTimersByTimeAsync(1000)
      hook('onAfterEnter', page)
      await flush()
      fixture.paletteReady.value = true
      await flush()
      expect(shell.classList.contains('album-palette-instant')).toBe(true)
      await update?.()
      await flush()
      expect(shell.style.getPropertyValue('--album-detail-main')).toBeTruthy()
      expect(shell.classList.contains('album-palette-instant')).toBe(true)
      finished.resolve()
      await flush()
      expect(shell.classList.contains('album-palette-instant')).toBe(false)
    } finally {
      unmount?.()
      Reflect.deleteProperty(doc, 'documentElement')
      Reflect.deleteProperty(doc, 'startViewTransition')
      vi.useRealTimers()
    }
  })

  it('cancels a pending late-color snapshot when navigating away', async () => {
    vi.useFakeTimers()
    const root = new ShellTestElement('html')
    const skip = vi.fn()
    let update: (() => Promise<void>) | undefined
    const pending = new Promise<void>(() => {})
    Object.assign(doc, {
      documentElement: root,
      startViewTransition: (callback: () => Promise<void>) => {
        update = callback
        return { ready: pending, finished: pending, skipTransition: skip }
      },
    })
    try {
      fixture.detailCover = true
      fixture.paletteReady.value = false
      await mount('albums')
      await navigate('album-detail', undefined, { artist: 'Artist', title: 'Album' })
      const page = find('.test-page')
      hook('onBeforeEnter', page)
      hook('onEnter', page)
      await vi.advanceTimersByTimeAsync(1000)
      hook('onAfterEnter', page)
      await flush()
      fixture.paletteReady.value = true
      await flush()
      expect(update).toBeDefined()
      await navigate('albums')
      expect(skip).toHaveBeenCalledOnce()
      await update?.()
      await flush()
      expect(find('.app-shell').classList.contains('has-album-detail-color')).toBe(false)
      expect(root.classList.contains('album-palette-reveal')).toBe(false)
    } finally {
      unmount?.()
      Reflect.deleteProperty(doc, 'documentElement')
      Reflect.deleteProperty(doc, 'startViewTransition')
      vi.useRealTimers()
    }
  })

  it('keeps album canvas and text colors identical when the application theme changes', async () => {
    await useTheme().setTheme('dark')
    fixture.detailCover = true
    await mount('album-detail')
    const shell = find('.app-shell')
    const names = [
      '--album-detail-main',
      '--album-detail-more',
      '--album-detail-side',
      '--album-detail-main-text',
      '--album-detail-lyrics-active',
      '--album-detail-lyrics-inactive',
    ]
    const dark = names.map((name) => shell.style.getPropertyValue(name))
    expect(dark.every(Boolean)).toBe(true)
    await useTheme().setTheme('light')
    await flush()
    expect(names.map((name) => shell.style.getPropertyValue(name))).toEqual(dark)
    await useTheme().setTheme('dark')
  })
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

  it('blocks page parameters across settings and fullscreen overlays', async () => {
    await mount()
    const parameters = find('.test-parameters').props.controller as { supported: Ref<boolean> }
    expect(parameters.supported.value).toBe(true)
    settings.openSettings()
    await flush()
    expect(parameters.supported.value).toBe(false)
    display.showFullscreenPlayer()
    await flush()
    expect(settings.isSettingsOpen.value).toBe(false)
    expect(display.displayMode.value).toBe('fullscreen')
    expect(parameters.supported.value).toBe(false)
    display.showNormalPlayer()
    await flush()
    expect(parameters.supported.value).toBe(true)
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

  it('unlocks the returning list when detail content fades while the page dissolve continues', async () => {
    await mount('album-detail')
    find('.app-main').focus()
    await navigate('albums')
    const main = find('.app-main')
    const detail = new ShellTestElement()
    const content = new ShellTestElement()
    content.className = 'album-body-grid'
    detail.append(content)
    const list = new ShellTestElement()
    main.append(detail)
    main.append(list)
    const call = (name: string, node: ShellTestElement, done: () => void) => {
      const callbacks = fixture.hooks[name]
      for (const cb of Array.isArray(callbacks) ? callbacks : [callbacks])
        if (typeof cb === 'function') cb(node, done)
    }
    call('onBeforeLeave', detail, () => {})
    call('onLeave', detail, () => {})
    call('onBeforeEnter', list, () => {})
    const entered = vi.fn(() => hook('onAfterEnter', list))
    call('onEnter', list, entered)
    for (let i = 0; i < 4; i++) await frame()
    expect(main.inert).toBe(true)
    expect(content.animations).toHaveLength(1)
    content.animations[0].finish()
    await flush()
    expect(main.inert).toBe(false)
    expect(list.style.getPropertyValue('pointer-events')).toBe('')
    expect(detail.animations[0].cancelled).toBe(false)
    expect(entered).not.toHaveBeenCalled()
    const button = new ShellTestElement('button')
    list.append(button)
    button.focus()
    detail.animations[0].finish()
    await flush()
    expect(entered).toHaveBeenCalledOnce()
    expect(doc.activeElement).toBe(button)
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
