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
} from '@renderer/testUtils/rendererTestHost'
import { libraryCatalogClient } from '../utils/libraryCatalogClient'
import { libraryNavigationViewportStore } from '../utils/libraryNavigationViewport'
import LibraryPage from './LibraryPage.vue'
import { provideTrackEditor } from '@renderer/features/trackEditor/trackEditor'
import zhHans from '../../../locales/zh-Hans.json'
import en from '../../../locales/en.json'

const folderApi = vi.hoisted(() => ({
  getRoots: vi.fn(),
  selectRoot: vi.fn(),
  startScan: vi.fn(),
  onScanProgress: vi.fn(),
}))

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
      ...folderApi,
      getTrackPage: async () => ({
        snapshotId: 'focus-fixture',
        totalTracks: fixture.tracks.length,
        tracks: fixture.tracks,
        nextCursor: null,
        diagnostics: { snapshotBuildMs: 0, pageSliceMs: 0 },
      }),
      onChanged: () => () => undefined,
    },
    playlists: { onChanged: () => () => undefined, listSidebarItems: async () => [] },
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
function text(node: ShellTestElement): string {
  return node.text + node.children.map(text).join(' ')
}
function statusChild(selector: string): ShellTestElement {
  return find('.library-status-state').querySelector(selector)!
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
      const editor = provideTrackEditor(() => {})
      return () =>
        h('div', [
          h(LibraryPage as Component),
          editor.request.value
            ? h('button', {
                class: 'test-editor',
                'data-artwork-key': editor.request.value.artworkCacheKey,
                onClick: () => {
                  const request = editor.request.value
                  editor.close()
                  void request?.restoreFocus?.()
                },
              })
            : null,
        ])
    },
  })
  app.directive('tooltip', {})
  app.mount(container)
  unmount = () => app.unmount()
  await settle()
  return parameters
}
beforeEach(() => {
  folderApi.getRoots.mockReset().mockResolvedValue([{ id: 1, path: 'D:\\Music' }])
  folderApi.selectRoot.mockReset().mockResolvedValue({ canceled: true })
  folderApi.startScan.mockReset().mockResolvedValue({ jobId: 1 })
  folderApi.onScanProgress.mockReset().mockReturnValue(() => undefined)
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

describe('LibraryPage initial folder entry', () => {
  it('shows a translated folder action only when no root is configured', async () => {
    expect(zhHans.settings.library.selectFolder).toBe('选择文件夹')
    expect(en.settings.library.selectFolder).toBe('Choose folder')
    fixture.tracks = []
    folderApi.getRoots.mockResolvedValue([])
    await mount()
    expect(text(statusChild('h3'))).toBe('library.status.emptyAll')
    expect(text(statusChild('button'))).toBe('settings.library.selectFolder')
    expect(find('.library-status-state--initial')).toBeTruthy()
  })

  it('selects once and starts the initial scan with the selected root', async () => {
    fixture.tracks = []
    folderApi.getRoots.mockResolvedValue([])
    let resolveSelection!: (value: { canceled: false; root: { id: number; path: string } }) => void
    folderApi.selectRoot.mockReturnValue(new Promise((resolve) => (resolveSelection = resolve)))
    await mount()
    const action = statusChild('button')
    fire(action, 'onClick')
    fire(action, 'onClick')
    await settle()
    expect(action.props.disabled).toBe(true)
    expect(folderApi.selectRoot).toHaveBeenCalledTimes(1)
    resolveSelection({ canceled: false, root: { id: 8, path: 'D:\\Next' } })
    await settle()
    expect(folderApi.startScan).toHaveBeenCalledExactlyOnceWith(8)
    expect(find('.library-status-state').querySelector('button')).toBeNull()
  })

  it('keeps the action after cancellation without starting a scan', async () => {
    fixture.tracks = []
    folderApi.getRoots.mockResolvedValue([])
    await mount()
    fire(statusChild('button'), 'onClick')
    await settle()
    expect(folderApi.startScan).not.toHaveBeenCalled()
    expect(text(statusChild('button'))).toBe('settings.library.selectFolder')
  })

  it('shows a retryable selection error', async () => {
    fixture.tracks = []
    folderApi.getRoots.mockResolvedValue([])
    folderApi.selectRoot.mockRejectedValueOnce(new Error('picker failed'))
    await mount()
    fire(statusChild('button'), 'onClick')
    await settle()
    expect(text(statusChild('p'))).toBe('settings.library.errors.selectFolder')
    fire(statusChild('button'), 'onClick')
    await settle()
    expect(folderApi.selectRoot).toHaveBeenCalledTimes(2)
  })

  it('retries a failed root lookup before offering the folder picker', async () => {
    fixture.tracks = []
    folderApi.getRoots.mockRejectedValueOnce(new Error('roots unavailable')).mockResolvedValue([])
    await mount()
    expect(text(statusChild('p'))).toBe('settings.library.errors.loadState')
    expect(text(statusChild('button'))).toBe('library.status.retry')
    fire(statusChild('button'), 'onClick')
    await settle()
    expect(text(statusChild('button'))).toBe('settings.library.selectFolder')
    expect(find('.library-status-state').querySelector('p')).toBeNull()
  })

  it('retries a failed scan without selecting another root', async () => {
    fixture.tracks = []
    folderApi.getRoots.mockResolvedValue([])
    folderApi.selectRoot.mockResolvedValue({ canceled: false, root: { id: 8, path: 'D:\\Next' } })
    folderApi.startScan.mockRejectedValueOnce(new Error('scan failed'))
    await mount()
    fire(statusChild('button'), 'onClick')
    await settle()
    expect(text(statusChild('p'))).toBe('settings.library.errors.startScan')
    expect(text(statusChild('button'))).toBe('settings.library.scanLibrary')
    fire(statusChild('button'), 'onClick')
    await settle()
    expect(folderApi.selectRoot).toHaveBeenCalledTimes(1)
    expect(folderApi.startScan).toHaveBeenCalledTimes(2)
    expect(folderApi.startScan).toHaveBeenLastCalledWith(8)
  })

  it('does not offer root replacement for an already configured empty library', async () => {
    fixture.tracks = []
    await mount()
    expect(text(statusChild('h3'))).toBe('library.status.emptyAll')
    expect(find('.library-status-state').querySelector('button')).toBeNull()
  })

  it('shows imported tracks after the initial scan completes', async () => {
    fixture.tracks = []
    folderApi.getRoots.mockResolvedValue([])
    folderApi.selectRoot.mockResolvedValue({ canceled: false, root: { id: 8, path: 'D:\\Next' } })
    await mount()
    fire(statusChild('button'), 'onClick')
    await settle()
    fixture.tracks = [track(1)]
    const onProgress = folderApi.onScanProgress.mock.calls[0][0] as (progress: {
      status: string
    }) => Promise<void>
    await onProgress({ status: 'completed' })
    await settle()
    expect(doc.body.querySelector('[data-track-id="1"]')).toBeTruthy()
    expect(doc.body.querySelector('.library-status-state')).toBeNull()
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
    fixture.tracks[2].artworkCacheKey = 'selected-track-cover'
    await mount()
    context(row(3))
    await settle()
    fire(find('.test-edit'), 'onClick')
    await settle()
    expect(find('.test-editor')).toBeTruthy()
    expect(find('.test-editor').props['data-artwork-key']).toBe('selected-track-cover')
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
  fire(find('.library-search-input'), 'onFocus')
  await settle()
}

describe('LibraryPage flat search entry', () => {
  it('keeps the search bar visible without a corner launcher', async () => {
    await mount(true)
    fire(find('.library-page'), 'onMousemove', { clientX: 280, clientY: 20 })
    await settle()
    expect(find('.library-search-input')).toBeDefined()
    expect(doc.body.querySelector('.library-search-zone')).toBeNull()
    expect(doc.body.querySelector('.library-flat-search-launcher')).toBeNull()
    const bar = find('.library-search-bar')
    expect(bar.querySelector('.i-lucide-search')).toBeDefined()
    expect(bar.contains(find('[data-page-parameters-trigger]'))).toBe(true)
    expect(find('[data-page-parameters-trigger]').parent).toBe(find('.page-search-parameters'))
    expect(bar.parent).toBe(find('.page-search-tools'))
  })

  it('keeps cover search on the centered hover zone', async () => {
    storage.set('auralis-library-view-mode', 'cover')
    const parameters = (await mount(true))!
    expect(doc.body.querySelector('.library-flat-search-launcher')).toBeNull()
    expect(doc.body.querySelector('.library-search-bar')).toBeNull()
    fire(find('.library-page'), 'onMousemove', { clientX: 280, clientY: 20 })
    await settle()
    expect(find('.library-search-zone')).toBeDefined()
    const bar = find('.library-search-bar')
    expect(bar.querySelector('.i-lucide-search')).toBeDefined()
    const trigger = find('[data-page-parameters-trigger]')
    expect(bar.contains(trigger)).toBe(true)
    fire(trigger, 'onClick', { currentTarget: trigger })
    expect(parameters.open.value).toBe(true)
  })
})

describe('LibraryPage page parameter entry', () => {
  it('keeps the parameter button inside search, preserves the query and returns focus', async () => {
    const parameters = (await mount(true))!
    await openFlatSearch()
    const tools = find('.page-search-tools')
    const bar = find('.library-search-bar')
    const input = find('.library-search-input')
    const trigger = find('[data-page-parameters-trigger]')
    expect(trigger.parent).toBe(find('.page-search-parameters'))
    expect(bar.parent).toBe(tools)
    expect(bar.contains(trigger)).toBe(true)
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
  it('retains the search toolbar after panel closure and focus leaves', async () => {
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
    expect(doc.body.querySelector('.page-search-tools')).toBeDefined()
  })
})
