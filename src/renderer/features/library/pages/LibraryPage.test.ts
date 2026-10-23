import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, reactive, ref, type Component } from 'vue'
import {
  createPageParameters,
  providePageParameters,
  type PageParameters,
} from '@renderer/features/appearance/composables/usePageParameters'
import type { TrackListItem } from '@shared/types/libraryScan'
import {
  ShellTestElement,
  shellTestDocument as doc,
  shellTestRenderer as renderer,
} from '@renderer/app/layout/appShellTestHost'
import { libraryCatalogClient } from '../utils/libraryCatalogClient'
import { libraryNavigationViewportStore } from '../utils/libraryNavigationViewport'
import LibraryPage from './LibraryPage.vue'

const fixture = vi.hoisted(() => ({
  tracks: [] as TrackListItem[],
  state: {
    selectedTrackId: null as number | null,
    currentTrackId: null as number | null,
    isPlaying: false,
  },
  select: vi.fn(),
  play: vi.fn(),
  leave: null as null | (() => void),
  route: { name: 'library', fullPath: '/songs', params: {}, query: {} },
}))
vi.mock('vue-router', () => ({
  useRoute: () => fixture.route,
  useRouter: () => ({ replace: vi.fn() }),
  onBeforeRouteLeave: (callback: () => void) => {
    fixture.leave = callback
  },
  onBeforeRouteUpdate: vi.fn(),
}))
vi.mock('vue-i18n', async (original) => {
  const actual = await original<typeof import('vue-i18n')>()
  const { ref } = await import('vue')
  return { ...actual, useI18n: () => ({ t: (key: string) => key, locale: ref('zh-Hans') }) }
})
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({
    state: fixture.state,
    selectTrack: fixture.select,
    playTrackFromQueue: fixture.play,
  }),
}))
vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: {
    library: {
      getTrackPage: async () => ({
        snapshotId: 'focus-fixture',
        totalTracks: fixture.tracks.length,
        tracks: fixture.tracks,
        nextCursor: null,
        diagnostics: { snapshotBuildMs: 0, pageSliceMs: 0 },
      }),
      onChanged: () => () => undefined,
      onScanProgress: () => () => undefined,
    },
    playlists: { listSidebarItems: async () => [] },
    metadata: {
      getTrackMetadata: async () => null,
      getTrackEditState: async () => ({ status: 'editable', version: 1 }),
      onTrackEditStateChanged: () => () => undefined,
    },
  },
}))
vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')
  return { useElementSize: () => ({ width: ref(900), height: ref(600) }) }
})
vi.mock('@tanstack/vue-virtual', async () => {
  const { computed } = await import('vue')
  return {
    useVirtualizer: (options: {
      value: { count: number; estimateSize: (index: number) => number }
    }) =>
      computed(() => ({
        measure: vi.fn(),
        getTotalSize: () =>
          Array.from({ length: options.value.count }, (_, i) =>
            options.value.estimateSize(i),
          ).reduce((sum, size) => sum + size, 0),
        getVirtualItems: () =>
          Array.from({ length: options.value.count }, (_, index) => ({
            index,
            key: index,
            start: index * options.value.estimateSize(index),
            size: options.value.estimateSize(index),
            end: (index + 1) * options.value.estimateSize(index),
          })),
      })),
  }
})
// Keep the page, rows, album groups and all library composables real. The visual
// menu/dialog engines and browser observation/transition timing are external.
vi.mock('../components/LibraryContextMenu.vue', () => ({
  default: {
    props: ['open'],
    emits: ['close', 'edit-metadata', 'switch-view'],
    render(this: { open: boolean; $emit: (event: string, ...args: unknown[]) => void }) {
      return this.open
        ? h('div', { class: 'test-menu', role: 'menu' }, [
            h('button', { class: 'test-close-menu', onClick: () => this.$emit('close') }),
            h('button', { class: 'test-edit', onClick: () => this.$emit('edit-metadata') }),
            h('button', {
              class: 'test-switch',
              onClick: () => this.$emit('switch-view', 'cover'),
            }),
          ])
        : null
    },
  },
}))
vi.mock('../components/MetadataEditDialog.vue', () => ({
  default: {
    props: ['open'],
    emits: ['close'],
    render(this: { open: boolean; $emit: (event: string) => void }) {
      return this.open
        ? h('div', { class: 'test-editor', role: 'dialog', onClick: () => this.$emit('close') })
        : null
    },
  },
}))
vi.mock('../components/FlatTrackColumnHeader.vue', () => ({
  default: { methods: { getResizeHandles: () => [] }, render: () => null },
}))
vi.mock('../components/FlatTrackColumnMenu.vue', () => ({ default: { render: () => null } }))
vi.mock('vue', async (original) => {
  const actual = await original<typeof import('vue')>()
  return {
    ...actual,
    Transition: {
      setup: (_: unknown, { slots }: { slots: { default: () => unknown } }) => slots.default,
    },
  }
})

const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
let unmount: (() => void) | null = null
const storage = new Map<string, string>()
function track(id: number): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    albumArtist: 'Artist',
    album: 'Album',
    trackNo: id,
    discNo: 1,
    releaseDate: '2026',
    copyright: null,
    composer: null,
    bitrateBps: null,
    durationSeconds: 180,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-01-01',
  }
}
async function settle() {
  for (let i = 0; i < 20; i++) {
    await nextTick()
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((callback) => callback(i))
    await Promise.resolve()
  }
}
function find(selector: string) {
  return doc.body.querySelector(selector)!
}
function row(id: number) {
  return find(`[data-track-id="${id}"]`)
}
function fire(element: ShellTestElement, name: string, event: unknown = {}) {
  const handler = element.props[name] as ((event: unknown) => void) | undefined
  handler?.(event)
}
function bubbleFocus(element: ShellTestElement) {
  for (let node: ShellTestElement | null = element; node; node = node.parent)
    fire(node, 'onFocusin', { currentTarget: node })
}
function key(element: ShellTestElement, value: string) {
  const event = {
    key: value,
    target: element,
    currentTarget: element,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true
    },
  }
  for (let node: ShellTestElement | null = element; node; node = node.parent)
    fire(node, 'onKeydown', event)
  return event
}
function context(element: ShellTestElement) {
  fire(element, 'onContextmenu', { preventDefault: vi.fn(), clientX: 30, clientY: 30 })
}
async function mount(withParameters = false) {
  const container = new ShellTestElement('main')
  doc.body.append(container)
  let parameters: PageParameters | undefined
  const app = renderer.createApp({
    setup() {
      if (withParameters) {
        parameters = createPageParameters(ref(fixture.route.name), ref(false))
        providePageParameters(parameters)
      }
      return () => h(LibraryPage as Component)
    },
  })
  app.directive('tooltip', {})
  app.mount(container)
  unmount = () => app.unmount()
  await settle()
  return parameters
}
beforeEach(() => {
  fixture.tracks = [track(1), track(2), track(3)]
  fixture.state = reactive({ selectedTrackId: null, currentTrackId: null, isPlaying: false })
  fixture.select.mockReset().mockImplementation((id: number) => {
    fixture.state.selectedTrackId = id
  })
  fixture.play.mockReset()
  fixture.leave = null
  storage.clear()
  frames.clear()
  libraryCatalogClient.invalidate('strong')
  vi.spyOn(libraryNavigationViewportStore, 'get').mockReturnValue(undefined)
  doc.body.replaceChildren()
  doc.activeElement = null
  const requestFrame = (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  }
  vi.stubGlobal('requestAnimationFrame', requestFrame)
  vi.stubGlobal('HTMLElement', ShellTestElement)
  vi.stubGlobal('Node', ShellTestElement)
  vi.stubGlobal('document', doc)
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      requestAnimationFrame: requestFrame,
      cancelAnimationFrame: (id: number) => frames.delete(id),
      setTimeout,
      clearTimeout,
    }),
  )
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  const originalMatches = ShellTestElement.prototype.matches
  vi.spyOn(ShellTestElement.prototype, 'matches').mockImplementation(function (
    this: ShellTestElement,
    selector,
  ) {
    const attributes = [...selector.matchAll(/\[([\w-]+)="([^"]*)"\]/gu)]
    const stripped = selector.replace(/\[([\w-]+)="([^"]*)"\]/gu, '[$1]')
    return (
      attributes.every(([, name, value]) => String(this.props[name]) === value) &&
      originalMatches.call(this, stripped)
    )
  })
  vi.spyOn(ShellTestElement.prototype, 'focus').mockImplementation(function (
    this: ShellTestElement,
  ) {
    doc.activeElement = this
    fire(this, 'onFocus')
    bubbleFocus(this)
  })
  Object.defineProperties(ShellTestElement.prototype, {
    clientHeight: { configurable: true, get: () => 600 },
    clientWidth: { configurable: true, get: () => 900 },
    scrollHeight: { configurable: true, get: () => 5000 },
  })
})
afterEach(async () => {
  unmount?.()
  unmount = null
  await settle()
  for (const name of ['clientHeight', 'clientWidth', 'scrollHeight'])
    Reflect.deleteProperty(ShellTestElement.prototype, name)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('LibraryPage focus wiring', () => {
  it('moves DOM focus without selecting or playing, then selects/plays the focused track once', async () => {
    await mount()
    const shell = find('.library-list-shell')
    key(shell, 'ArrowDown')
    await settle()
    expect(doc.activeElement).toBe(row(2))
    expect(row(2).props.tabindex).toBe(0)
    expect(fixture.select).not.toHaveBeenCalled()
    expect(fixture.play).not.toHaveBeenCalled()
    key(row(2), ' ')
    key(row(2), 'Enter')
    expect(fixture.select).toHaveBeenCalledExactlyOnceWith(2)
    expect(fixture.play).toHaveBeenCalledExactlyOnceWith(fixture.tracks, 2, {
      shufflePool: undefined,
    })
  })
  it('uses row focus events for shell shortcuts and keeps interactive targets isolated', async () => {
    await mount()
    row(3).focus()
    key(find('.library-list-shell'), ' ')
    expect(fixture.select).toHaveBeenCalledExactlyOnceWith(3)
    const input = new ShellTestElement('input')
    find('.library-list-shell').append(input)
    expect(key(input, 'Enter').defaultPrevented).toBe(false)
    expect(fixture.play).not.toHaveBeenCalled()
  })
  it('suppresses shell keys while the menu is open and restores pointer focus without scrolling', async () => {
    await mount()
    const scroll = find('.library-list-scroll')
    scroll.scrollTop = 190
    context(row(2))
    await settle()
    expect(key(find('.library-list-shell'), 'Enter').defaultPrevented).toBe(false)
    expect(fixture.play).not.toHaveBeenCalled()
    fire(find('.test-close-menu'), 'onClick')
    await settle()
    expect(doc.activeElement).toBe(row(2))
    expect(scroll.scrollTop).toBe(190)
    expect(fixture.state.selectedTrackId).toBeNull()
  })
  it('hands menu focus to the editor and restores it after close without activating playback', async () => {
    await mount()
    context(row(3))
    await settle()
    fire(find('.test-edit'), 'onClick')
    await settle()
    expect(find('.test-editor')).toBeTruthy()
    expect(key(find('.library-list-shell'), 'Enter').defaultPrevented).toBe(false)
    fire(find('.test-editor'), 'onClick')
    await settle()
    expect(doc.activeElement).toBe(row(3))
    expect(fixture.play).not.toHaveBeenCalled()
    expect(fixture.select).not.toHaveBeenCalled()
  })
  it('updates the real cover row focus and plays the full queue on Enter', async () => {
    storage.set('auralis-library-view-mode', 'cover')
    await mount()
    key(find('.library-list-shell'), 'End')
    await settle()
    expect(doc.activeElement).toBe(row(3))
    expect(row(3).props.tabindex).toBe(0)
    key(row(3), 'Enter')
    expect(fixture.play).toHaveBeenCalledExactlyOnceWith(fixture.tracks, 3, {
      shufflePool: undefined,
    })
  })
  it('preserves the existing navigation viewport capture on route leave', async () => {
    await mount()
    find('.library-list-scroll').scrollTop = 125
    const save = vi.spyOn(libraryNavigationViewportStore, 'save')
    fixture.leave?.()
    expect(save).toHaveBeenCalledWith(
      { kind: 'library' },
      expect.objectContaining({ scrollTop: 125 }),
    )
  })
})

async function openFlatSearch(): Promise<void> {
  fire(find('.library-flat-search-launcher'), 'onClick')
  await settle()
}

describe('LibraryPage flat search entry', () => {
  it('opens from the corner launcher and leaves the top hover zone idle', async () => {
    await mount(true)
    fire(find('.library-page'), 'onMousemove', { clientX: 280, clientY: 20 })
    await settle()
    expect(doc.body.querySelector('.library-search-input')).toBeNull()
    expect(doc.body.querySelector('.library-search-zone')).toBeNull()
    expect(find('.library-flat-search-launcher').props['aria-expanded']).toBe(false)
    await openFlatSearch()
    const bar = find('.library-search-bar')
    expect(bar.querySelector('.i-lucide-search')).toBeNull()
    expect(find('.i-lucide-search').parent).toBe(find('.library-flat-search-launcher'))
    expect(find('[data-page-parameters-trigger]').parent).toBe(find('.page-search-tools'))
    expect(bar.parent).toBe(find('.page-search-tools'))
    expect(find('.library-flat-search-launcher').props['aria-expanded']).toBe(true)
  })

  it('keeps cover search on the centered hover zone', async () => {
    storage.set('auralis-library-view-mode', 'cover')
    await mount()
    expect(doc.body.querySelector('.library-flat-search-launcher')).toBeNull()
    fire(find('.library-page'), 'onMousemove', { clientX: 280, clientY: 20 })
    await settle()
    expect(find('.library-search-zone')).toBeDefined()
    expect(find('.library-search-bar').querySelector('.i-lucide-search')).toBeDefined()
  })
})

describe('LibraryPage page parameter entry', () => {
  it('keeps search and the external button together, preserves the query and returns focus', async () => {
    const parameters = (await mount(true))!
    await openFlatSearch()
    const tools = find('.page-search-tools')
    const bar = find('.library-search-bar')
    const input = find('.library-search-input')
    const trigger = find('[data-page-parameters-trigger]')
    expect(trigger.parent).toBe(tools)
    expect(bar.parent).toBe(tools)
    expect(bar.contains(trigger)).toBe(false)
    Reflect.set(input, 'value', 'al')
    fire(input, 'onUpdate:modelValue', 'al')
    await settle()
    const focus = vi.spyOn(input, 'focus')
    fire(trigger, 'onClick', { currentTarget: trigger })
    await settle()
    expect(parameters.open.value).toBe(true)
    expect(focus).not.toHaveBeenCalled()
    fire(find('.library-page'), 'onMouseleave')
    parameters.close()
    await settle()
    expect(doc.activeElement).toBe(trigger)
    expect(find('[data-page-parameters-trigger]')).toBe(trigger)
    expect(Reflect.get(input, 'value')).toBe('al')
  })
  it('keeps the parameter entry available for an empty library while search is disabled', async () => {
    fixture.tracks = []
    const parameters = (await mount(true))!
    await openFlatSearch()
    expect(find('.library-search-input').props.disabled).toBe(true)
    const trigger = find('[data-page-parameters-trigger]')
    expect(trigger.props.disabled).toBe(false)
    fire(trigger, 'onClick', { currentTarget: trigger })
    expect(parameters.open.value).toBe(true)
  })
  it('retains an empty search toolbar through panel closure and releases it after focus leaves', async () => {
    const parameters = (await mount(true))!
    await openFlatSearch()
    const trigger = find('[data-page-parameters-trigger]')
    fire(trigger, 'onClick', { currentTarget: trigger })
    fire(find('.library-page'), 'onMouseleave')
    await settle()
    parameters.close()
    await settle()
    expect(doc.activeElement).toBe(trigger)
    const tools = find('.page-search-tools')
    const bar = find('.library-search-bar')
    fire(bar, 'onFocusout', { currentTarget: bar, relatedTarget: row(1) })
    fire(tools, 'onFocusout', { currentTarget: tools, relatedTarget: row(1) })
    await settle()
    expect(doc.body.querySelector('.page-search-tools')).toBeNull()
  })
})
