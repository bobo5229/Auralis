import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, reactive, type Slots } from 'vue'
import { createFocusTrap, type FocusTrap } from 'focus-trap'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import AppSidebar from './AppSidebar.vue'
import { useTheme, THEME_STORAGE_KEY } from '@renderer/composables/useTheme'
import { ShellTestElement as Host, shellTestDocument as doc } from './appShellTestHost'
import { useSidebarLayout } from '@renderer/features/appearance/composables/useSidebarLayout'

const fixture = vi.hoisted(() => ({
  route: { path: '/songs', name: 'library', query: {}, hash: '', fullPath: '/songs' },
  items: [] as SidebarPlaylistItem[],
  create: vi.fn(),
  createSmart: vi.fn(),
  rename: vi.fn(),
  renameSmart: vi.fn(),
  delete: vi.fn(),
  deleteSmart: vi.fn(),
  reorder: vi.fn(),
  push: vi.fn(),
  changed: new Set<(event: { reason: string }) => void>(),
  positions: [] as { dispose: ReturnType<typeof vi.fn> }[],
}))
vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: {
    library: {
      getStats: async () => ({ trackCount: 4, albumCount: 1 }),
      getRoots: async () => [],
      getScanStatus: async () => null,
      onScanProgress: () => () => undefined,
      onChanged: (callback: (event: { reason: string }) => void) => {
        fixture.changed.add(callback)
        return () => fixture.changed.delete(callback)
      },
    },
    playlists: {
      listSidebarItems: async () => structuredClone(fixture.items),
      create: fixture.create,
      rename: fixture.rename,
      delete: fixture.delete,
      reorderSidebarItems: fixture.reorder,
    },
    smartPlaylists: {
      list: async () =>
        fixture.items
          .filter((i) => i.kind === 'smart')
          .map((i) => ({ ...i, rule: { preset: 'mostListened' } })),
      listTrackCounts: async () => [],
      create: fixture.createSmart,
      rename: fixture.renameSmart,
      delete: fixture.deleteSmart,
    },
  },
}))
vi.mock('vue-router', async () => {
  const { h } = await import('vue')
  return {
    useRoute: () => fixture.route,
    useRouter: () => ({ push: fixture.push }),
    RouterLink: {
      props: ['to'],
      setup:
        (_props: unknown, { slots }: { slots: Slots }) =>
        () =>
          h('a', undefined, slots.default?.()),
    },
  }
})
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'zh-CN' }) }))
vi.mock('@vueuse/core', () => ({ useResizeObserver: vi.fn() }))
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { error: vi.fn(), warn: vi.fn() },
}))
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({ state: {}, playTrackFromQueue: vi.fn(), clearError: vi.fn() }),
}))
vi.mock('@renderer/features/facets/components/FacetsDialog.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@renderer/features/smartPlaylists/components/SmartPlaylistBuilderDialog.vue', async () => {
  const { h } = await import('vue')
  return {
    default: {
      props: ['open', 'trigger'],
      setup: (props: { open: boolean; trigger: HTMLElement | null }) => () =>
        props.open ? h('div', { class: 'builder-stub', trigger: props.trigger }) : null,
    },
  }
})
vi.mock('../router/routeWarmup', () => ({ prefetchRouteOnIntent: vi.fn() }))
vi.mock('@renderer/features/settings/utils/settingsContentLoader', () => ({
  preloadSettingsContent: vi.fn(),
}))
vi.mock('./sidebarBrandMotion', () => ({ vBrandResonance: {} }))
vi.mock('focus-trap', () => ({ createFocusTrap: vi.fn() }))
vi.mock('@renderer/shared/floating/floatingPosition', () => ({
  pointReference: vi.fn(),
  startFloatingPosition: (options: { floating: HTMLElement; onPosition: () => void }) => {
    options.floating.style.visibility = 'visible'
    options.onPosition()
    const position = { dispose: vi.fn(), update: vi.fn() }
    fixture.positions.push(position)
    return position
  },
}))
vi.mock('vue', async (original) => {
  const actual = await original<typeof import('vue')>()
  return {
    ...actual,
    Transition: {
      inheritAttrs: false,
      setup: (_props: unknown, { slots }: { slots: Slots }) => slots.default,
    },
  }
})

class Events extends EventTarget {
  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ) {
    super.removeEventListener(
      type,
      callback,
      typeof options === 'boolean' ? { capture: options } : options,
    )
  }
}
const renderer = createRenderer<Host, Host>({
  createElement: (tag) => new Host(tag),
  createText: (text) => Object.assign(new Host('#text'), { text }),
  createComment: () => new Host('#comment'),
  setText: (node, text) => {
    node.text = text
  },
  setElementText: (node, text) => {
    node.text = text
  },
  insert: (node, parent, anchor) => {
    node.remove()
    node.parent = parent
    const at = anchor ? parent.children.indexOf(anchor) : -1
    if (at < 0) parent.children.push(node)
    else parent.children.splice(at, 0, node)
  },
  remove: (node) => node.remove(),
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  querySelector: (selector) => (selector === 'body' ? doc.body : doc.body.querySelector(selector)),
  patchProp: (node, key, _previous, value) => {
    if (key === 'style') {
      if (typeof value === 'object') Object.assign(node.style, value)
      return
    }
    if (key === 'inert') {
      node.inert = Boolean(value)
      return
    }
    if (value == null || (key === 'disabled' && !value)) {
      node.removeAttribute(key)
      return
    }
    node.props[key] = value
    if (key.startsWith('data-')) node.setAttribute(key, String(value))
  },
})
const traps: { root: Host; escape: (event: KeyboardEvent) => boolean; active: boolean }[] = []
let unmount: (() => void) | null = null
function item(id: number, kind: SidebarPlaylistItem['kind'] = 'playlist'): SidebarPlaylistItem {
  return {
    id,
    kind,
    name: `${kind} ${id}`,
    viewMode: 'flat',
    trackCount: 2,
    sortOrder: id,
    createdAt: '',
    updatedAt: '',
  }
}
function match(element: Host, selector: string): boolean {
  return selector.split(',').some((part) => {
    const parts = part.trim().match(/(?:\[[^\]]*\]|[^\s\[])+/g) ?? []
    const simple = parts.pop()!
    const negative = simple.includes(':not(:disabled)')
    const value = simple.replace(':not(:disabled)', '')
    const tag = /^[a-z][\w-]*/i.exec(value)?.[0]
    const classes = [...value.matchAll(/\.([\w-]+)/g)].map((m) => m[1])
    const id = /#([\w-]+)/.exec(value)?.[1]
    const attrs = [...value.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]/g)]
    if (
      (negative && element.props.disabled) ||
      (tag && element.tagName !== tag) ||
      (id && element.props.id !== id) ||
      !classes.every((c) => element.classList.contains(c)) ||
      !attrs.every((m) =>
        m[2] === undefined ? element.hasAttribute(m[1]) : String(element.props[m[1]]) === m[2],
      )
    )
      return false
    if (!parts.length) return true
    let ancestor = element.parent
    while (ancestor) {
      if (match(ancestor, parts.join(' '))) return true
      ancestor = ancestor.parent
    }
    return false
  })
}
const extraDescriptors: Record<string, PropertyDescriptor | undefined> = {}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  traps.length = 0
  fixture.positions.length = 0
  fixture.route = reactive({
    path: '/songs',
    name: 'library',
    query: {},
    hash: '',
    fullPath: '/songs',
  })
  fixture.items = [item(1), item(1, 'smart'), item(2)]
  fixture.create.mockImplementation(async () => {
    const p = item(3)
    fixture.items.push(p)
    return p
  })
  fixture.createSmart.mockResolvedValue({
    playlist: { ...item(3, 'smart'), rule: { preset: 'recentPlayed', days: 30 } },
  })
  fixture.rename.mockImplementation(async (id: number, name: string) => {
    fixture.items.find((i) => i.kind === 'playlist' && i.id === id)!.name = name
    return item(id)
  })
  fixture.renameSmart.mockImplementation(async (id: number, name: string) => {
    fixture.items.find((i) => i.kind === 'smart' && i.id === id)!.name = name
    return item(id, 'smart')
  })
  fixture.delete.mockImplementation(async (id: number) => {
    fixture.items = fixture.items.filter((i) => i.kind !== 'playlist' || i.id !== id)
    return { deleted: true }
  })
  fixture.deleteSmart.mockResolvedValue({ deleted: true })
  fixture.reorder.mockImplementation(async (order: { id: number; kind: string }[]) => {
    fixture.items = order.map((k) => fixture.items.find((i) => i.id === k.id && i.kind === k.kind)!)
    return structuredClone(fixture.items)
  })
  doc.body.replaceChildren()
  doc.activeElement = doc.body
  vi.stubGlobal('document', doc)
  vi.stubGlobal('Document', EventTarget)
  vi.stubGlobal(
    'window',
    Object.assign(new Events(), {
      innerWidth: 1000,
      innerHeight: 800,
      setTimeout,
      clearTimeout,
      matchMedia: () => Object.assign(new Events(), { matches: true }),
    }),
  )
  vi.stubGlobal('HTMLElement', Host)
  vi.stubGlobal('Element', Host)
  vi.stubGlobal('Node', Host)
  vi.stubGlobal('SVGElement', Host)
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  vi.stubGlobal('CSS', { escape: (value: string) => value })
  vi.stubGlobal('getComputedStyle', (node: Host) =>
    Object.assign(node.style, {
      opacity: '1',
      visibility: 'visible',
      paddingTop: '0px',
      paddingBottom: '0px',
    }),
  )
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 16),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(Host.prototype, 'matches').mockImplementation(function (this: Host, selector) {
    return match(this, selector)
  })
  vi.spyOn(Host.prototype, 'removeEventListener').mockImplementation(function (
    this: Host,
    type,
    callback,
    options,
  ) {
    EventTarget.prototype.removeEventListener.call(
      this,
      type,
      callback,
      typeof options === 'boolean' ? { capture: options } : options,
    )
  })
  for (const [name, descriptor] of Object.entries({
    value: {
      get(this: Host) {
        return this.props.value ?? ''
      },
      set(this: Host, value: unknown) {
        this.props.value = value
      },
    },
    getRootNode: {
      value() {
        return doc
      },
    },
    scrollIntoView: { value: vi.fn() },
    getAttribute: {
      value(this: Host, key: string) {
        return this.props[key] ?? null
      },
    },
    getAttributeNames: {
      value(this: Host) {
        return Object.keys(this.props)
      },
    },
    getClientRects: {
      value(this: Host) {
        return this.isConnected ? [this.rect] : []
      },
    },
    select: {
      value(this: Host) {
        this.props.selected = true
      },
    },
  })) {
    extraDescriptors[name] = Object.getOwnPropertyDescriptor(Host.prototype, name)
    Object.defineProperty(Host.prototype, name, { ...descriptor, configurable: true })
  }
  vi.mocked(createFocusTrap).mockImplementation((root, options = {}) => {
    const node = root as unknown as Host
    const state = {
      root: node,
      escape: options.escapeDeactivates as (event: KeyboardEvent) => boolean,
      active: false,
    }
    const trap = {
      activate: vi.fn(() => {
        state.active = true
        options.trapStack!.push(trap as unknown as FocusTrap)
        const initial =
          typeof options.initialFocus === 'function' ? options.initialFocus() : undefined
        ;(
          (initial instanceof Host ? initial : undefined) ??
          node.querySelector('[role="menuitem"]:not(:disabled)') ??
          node.querySelector('input') ??
          node
        ).focus()
        return trap
      }),
      deactivate: vi.fn(() => {
        state.active = false
        const stack = options.trapStack!
        stack.splice(stack.indexOf(trap as unknown as FocusTrap), 1)
        return trap
      }),
    }
    traps.push(state)
    return trap as unknown as FocusTrap
  })
  const layout = useSidebarLayout()
  layout.setSidebarFullHeight(true)
  layout.setSidebarCollapsed(false)
})
afterEach(async () => {
  unmount?.()
  unmount = null
  await settle()
  expect(traps.every((t) => !t.active)).toBe(true)
  expect(fixture.changed.size).toBe(0)
  for (const [name, descriptor] of Object.entries(extraDescriptors)) {
    if (descriptor) Object.defineProperty(Host.prototype, name, descriptor)
    else Reflect.deleteProperty(Host.prototype, name)
  }
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function settle() {
  for (let i = 0; i < 12; i++) await nextTick()
}
async function mount() {
  const root = new Host('main')
  root.setAttribute('data-app-shell-root', '')
  doc.body.append(root)
  const app = renderer.createApp({
    render: () => h(AppSidebar, { maxWidth: 480, resizeDisabled: false }),
  })
  app.directive('tooltip', {})
  app.mount(root)
  unmount = () => app.unmount()
  await settle()
  return root
}
function find(selector: string) {
  const result = doc.body.querySelector(selector)
  if (!result) throw Error(`Missing ${selector}`)
  return result
}
function row(key: string) {
  return find(`[data-sidebar-playlist-key="${key}"]`)
}
function dispatch(node: Host, name: string, fields: object = {}) {
  const event = Object.assign(new Event(name, { cancelable: true }), fields)
  Object.defineProperties(event, { target: { value: node }, currentTarget: { value: node } })
  const prop = `on${name[0].toUpperCase()}${name.slice(1)}`
  const handlers = node.props[prop]
  for (const handler of Array.isArray(handlers) ? handlers : [handlers])
    if (typeof handler === 'function') handler(event)
  return event
}
async function openContext(key: string) {
  const trigger = row(key)
  trigger.focus()
  dispatch(trigger, 'contextmenu', { clientX: 50, clientY: 80 })
  await settle()
  return find('.collection-context-menu')
}
async function openCreate() {
  const button = find('.smart-playlist-add-button')
  button.focus()
  dispatch(button, 'click')
  await settle()
  return find('#sidebar-create-menu')
}
function escape() {
  const trap = traps.findLast((t) => t.active)!
  trap.escape(
    Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }) as KeyboardEvent,
  )
}
function setInput(node: Host, value: string) {
  ;(node.props['onUpdate:modelValue'] as (value: string) => void)(value)
  dispatch(node, 'input')
}

describe('AppSidebar playlist operations', () => {
  it('opens nested creation menus, returns focus and keeps resize disabled until closing', async () => {
    await mount()
    const menu = await openCreate()
    expect(find('.sidebar-resize-handle').props['aria-disabled']).toBe(true)
    const trigger = menu.querySelector('[aria-controls="sidebar-smart-create-submenu"]')!
    dispatch(trigger, 'keydown', { key: 'ArrowRight' })
    await settle()
    expect(find('#sidebar-smart-create-submenu').contains(doc.activeElement)).toBe(true)
    escape()
    await settle()
    expect(doc.body.querySelector('#sidebar-smart-create-submenu')).toBeNull()
    expect(doc.activeElement).toBe(trigger)
    escape()
    await settle()
    expect(doc.activeElement).toBe(find('.smart-playlist-add-button'))
    expect(find('.sidebar-resize-handle').props['aria-disabled']).toBeUndefined()
  })

  it('hands context focus to rename, validates input and dispatches to the smart API for an equal numeric ID', async () => {
    const root = await mount()
    const menu = await openContext('smart:1')
    dispatch(menu.querySelector('.i-ph-pencil-simple')!.closest('button')!, 'click')
    await settle()
    const dialog = find('.smart-playlist-dialog'),
      input = dialog.querySelector('input')!
    expect(input.props.selected).toBe(true)
    expect(root.inert).toBe(true)
    expect(doc.activeElement).toBe(input)
    setInput(input, '   ')
    dispatch(dialog, 'submit')
    await settle()
    expect(find('.smart-playlist-dialog-error').text).toBe('sidebar.playlistNameRequired')
    expect(fixture.renameSmart).not.toHaveBeenCalled()
    setInput(input, 'Renamed')
    dispatch(dialog, 'submit')
    await settle()
    expect(fixture.renameSmart).toHaveBeenCalledWith(1, 'Renamed')
    expect(fixture.rename).not.toHaveBeenCalled()
    expect(row('smart:1').querySelector('.sidebar-link-label')!.text).toBe('Renamed')
    expect(row('playlist:1').querySelector('.sidebar-link-label')!.text).toBe('playlist 1')
    expect(root.inert).toBe(false)
    expect(doc.activeElement).toBe(row('smart:1'))
  })

  it('requires two delete presses, retains failures, and removes only the selected kind', async () => {
    await mount()
    let menu = await openContext('playlist:1')
    let button = menu.querySelector('[data-delete-playlist]')!
    dispatch(button, 'click')
    await settle()
    expect(fixture.delete).not.toHaveBeenCalled()
    expect(
      button.querySelectorAll('span').some((node) => node.text === 'sidebar.confirmDelete'),
    ).toBe(true)
    fixture.delete.mockRejectedValueOnce(new Error('delete failed'))
    dispatch(button, 'click')
    await settle()
    expect(fixture.delete).toHaveBeenCalledTimes(1)
    expect(menu.querySelector('[role="alert"]')!.text).toBe('sidebar.deleteFailed')
    expect(row('playlist:1')).toBeTruthy()
    menu = find('.collection-context-menu')
    button = menu.querySelector('[data-delete-playlist]')!
    dispatch(button, 'click')
    dispatch(button, 'click')
    await settle()
    expect(doc.body.querySelector('[data-sidebar-playlist-key="playlist:1"]')).toBeNull()
    expect(row('smart:1')).toBeTruthy()
    expect(doc.body.querySelector('.collection-context-menu')).toBeNull()
  })

  it('uses the live mixed order for dynamic menu actions and delegates keyboard moves to the real reorder module', async () => {
    await mount()
    let menu = await openContext('playlist:1')
    expect(menu.querySelector('.i-ph-arrow-up')).toBeNull()
    dispatch(menu.querySelector('.i-ph-arrow-down')!.closest('button')!, 'click')
    await settle()
    expect(fixture.reorder).toHaveBeenCalledWith([
      { kind: 'smart', id: 1 },
      { kind: 'playlist', id: 1 },
      { kind: 'playlist', id: 2 },
    ])
    menu = await openContext('playlist:1')
    expect(menu.querySelector('.i-ph-arrow-up')).toBeTruthy()
    escape()
    await settle()
    dispatch(row('playlist:1'), 'keydown', { key: 'ArrowUp', altKey: true })
    await settle()
    expect(find('[data-sidebar-playlist-key]').dataset.sidebarPlaylistKey).toBe('playlist:1')
  })

  it('closes other menus and pending gestures, then clears menus on route and rail changes', async () => {
    await mount()
    const recent = find('[aria-keyshortcuts="ContextMenu Shift+F10"]')
    dispatch(recent, 'contextmenu', { clientX: 30, clientY: 50 })
    await settle()
    expect(find('#sidebar-recent-added-context-menu')).toBeTruthy()
    await openCreate()
    expect(doc.body.querySelector('#sidebar-recent-added-context-menu')).toBeNull()
    const target = row('playlist:1')
    dispatch(target, 'pointerdown', { button: 0, pointerId: 7, clientX: 10, clientY: 10 })
    await openContext('playlist:1')
    await vi.advanceTimersByTimeAsync(300)
    await settle()
    expect(target.classList.contains('smart-playlist-link-dragging')).toBe(false)
    expect(doc.body.querySelector('#sidebar-create-menu')).toBeNull()
    useSidebarLayout().setSidebarCollapsed(true)
    await settle()
    expect(doc.body.querySelector('.collection-context-menu')).toBeNull()
    await openContext('playlist:1')
    fixture.route.path = '/albums'
    await settle()
    expect(doc.body.querySelector('.collection-context-menu')).toBeNull()
    expect(fixture.positions.every((p) => p.dispose.mock.calls.length > 0)).toBe(true)
  })

  it('creates regular playlists and passes the custom builder its original trigger', async () => {
    await mount()
    const menu = await openCreate()
    dispatch(menu.querySelector('button')!, 'click')
    await settle()
    expect(fixture.create).toHaveBeenCalledOnce()
    expect(fixture.push).toHaveBeenCalledWith('/playlists/3')
    expect(row('playlist:3')).toBeTruthy()
    const next = await openCreate()
    dispatch(next.querySelector('[aria-controls="sidebar-smart-create-submenu"]')!, 'click')
    await settle()
    const custom = find('#sidebar-smart-create-submenu').querySelectorAll('button').at(-1)!
    dispatch(custom, 'click')
    await settle()
    expect(find('.builder-stub').props.trigger).toBe(find('.smart-playlist-add-button'))
    expect(doc.body.querySelector('#sidebar-create-menu')).toBeNull()
    expect(find('.sidebar-resize-handle').props['aria-disabled']).toBe(true)
  })
})

describe('AppSidebar theme shortcut', () => {
  it.each([false, true])(
    'toggles the shared theme and persistent setting with a target label (collapsed=%s)',
    async (collapsed) => {
      useSidebarLayout().setSidebarCollapsed(collapsed)
      await useTheme().setTheme('dark')
      await mount()
      const trigger = find('[data-theme-toggle]')
      expect(doc.body.querySelector('[data-page-parameters-trigger]')).toBeNull()
      expect(trigger.props['aria-label']).toBe('sidebar.tool.switchToLightTheme')
      dispatch(trigger, 'click')
      await settle()
      expect(useTheme().isDark.value).toBe(false)
      expect(trigger.props['aria-label']).toBe('sidebar.tool.switchToDarkTheme')
      expect(localStorage.setItem).toHaveBeenLastCalledWith(THEME_STORAGE_KEY, 'light')
      dispatch(trigger, 'click')
      await settle()
      expect(useTheme().isDark.value).toBe(true)
      expect(trigger.props['aria-label']).toBe('sidebar.tool.switchToLightTheme')
      expect(localStorage.setItem).toHaveBeenLastCalledWith(THEME_STORAGE_KEY, 'dark')
    },
  )
})
