import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, createSSRApp, h, nextTick } from 'vue'
import { renderToString } from '@vue/server-renderer'
import type { AddPlaylistTracksResult, SidebarPlaylistItem } from '@shared/types/playlist'
import { useLibraryContextMenu } from '../composables/useLibraryContextMenu'
import LibraryContextMenu from './LibraryContextMenu.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/shared/floating/floatingPosition', () => ({
  pointReference: vi.fn(),
  startFloatingPosition: (options: {
    floating: TestNode
    onPosition: (position: { placement: string }, first: boolean) => void
  }) => {
    options.floating.style.visibility = 'visible'
    queueMicrotask(() => options.onPosition({ placement: 'right-start' }, true))
    return { update: vi.fn(), dispose: vi.fn() }
  },
}))
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function renderMenu(hideInsert: boolean) {
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  const app = createSSRApp({
    render: () =>
      h(LibraryContextMenu, {
        open: true,
        source: 'track',
        trackTitle: 'Track',
        albumTitle: 'Album',
        anchor: { clientX: 10, clientY: 10, returnFocusTrackId: 1, openReason: 'pointer' },
        canLocateCurrent: true,
        canInsert: !hideInsert,
        hideInsert,
        currentViewMode: 'cover',
        playlists: [],
        playlistFeedback: null,
        playlistLoading: false,
        playlistLoadError: null,
        creatingPlaylist: false,
      }),
  })
  app.directive('tooltip', {})
  const context: { teleports?: Record<string, string> } = {}
  await renderToString(app, context)
  return context.teleports?.body ?? ''
}

describe('LibraryContextMenu insert visibility', () => {
  it('does not render the insert row for the current track, preserving later item indices', async () => {
    const html = await renderMenu(true)
    expect(html).not.toContain('library.contextMenu.insertTrack')
    expect(html).not.toContain('data-context-main-index="2"')
    expect(html).toContain('data-context-main-index="3"')
    expect(html).toContain('data-context-main-index="4"')
  })

  it('renders the insert row for another track', async () => {
    const html = await renderMenu(false)
    expect(html).toContain('library.contextMenu.insertTrack')
    expect(html).toContain('data-context-main-index="2"')
  })
})

// Mount the actual SFC and composable. Only floating geometry and IPC are simulated.
interface TestNode {
  props: Record<string, unknown>
  children: TestNode[]
  parent: TestNode | null
  text: string
  style: { visibility: string }
  focus: () => void
  contains: (target: unknown) => boolean
  querySelector: (selector: string) => TestNode | null
  querySelectorAll: (selector: string) => TestNode[]
}
let focused: TestNode | null = null
function findAll(root: TestNode, matches: (item: TestNode) => boolean): TestNode[] {
  return [
    ...(matches(root) ? [root] : []),
    ...root.children.flatMap((child) => findAll(child, matches)),
  ]
}
function node(text = ''): TestNode {
  const result: TestNode = {
    props: {},
    children: [],
    parent: null,
    text,
    style: { visibility: 'hidden' },
    focus: () => {
      focused = result
    },
    contains: (target) => findAll(result, (item) => item === target).length > 0,
    querySelectorAll: (selector) =>
      findAll(result, (item) => {
        const match = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/)
        return (
          !!match &&
          Object.hasOwn(item.props, match[1]) &&
          (match[2] === undefined || String(item.props[match[1]]) === match[2])
        )
      }),
    querySelector: (selector) => result.querySelectorAll(selector)[0] ?? null,
  }
  return result
}
function textContent(root: TestNode): string {
  return root.text + root.children.map(textContent).join('')
}

async function mountInteractiveMenu(addResult: () => Promise<AddPlaylistTracksResult>) {
  vi.useFakeTimers()
  focused = null
  const body = node()
  vi.stubGlobal('document', {
    get activeElement() {
      return focused
    },
  })
  vi.stubGlobal('window', { setTimeout, clearTimeout, dispatchEvent: vi.fn() })
  vi.stubGlobal(
    'CustomEvent',
    class {
      constructor(public type: string) {}
    },
  )
  const playlist: SidebarPlaylistItem = {
    kind: 'playlist',
    id: 9,
    name: 'Night',
    viewMode: 'flat',
    sortOrder: 0,
    trackCount: 0,
    createdAt: '',
    updatedAt: '',
  }
  const menu = useLibraryContextMenu({
    tracks: { value: [] },
    isScopedPlaylist: () => false,
    getTrackById: () => null,
    getAlbumGroupByTrackId: () => null,
    currentTrackId: () => null,
    selectedTrackId: () => null,
    onTrackActivated: vi.fn(),
    playTrackFromQueue: vi.fn(),
    insertTrackAfterCurrent: vi.fn(),
    insertTracksAfterCurrent: vi.fn(),
    scrollToTrackById: async () => undefined,
    openMetadataEditor: vi.fn(),
    setMetadataReturnTarget: vi.fn(),
    setViewSwitchReturnTarget: vi.fn(),
    restoreFocus: async () => undefined,
    t: (key) => key,
    listSidebarItems: async () => [playlist],
    createPlaylist: async () => ({ id: 10, name: 'New' }),
    addTracksToPlaylist: addResult,
  })
  const renderer = createRenderer<TestNode, TestNode>({
    createElement: () => node(),
    createText: node,
    createComment: () => node(),
    insert: (child, parent, anchor) => {
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
      child.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      if (index >= 0) parent.children.splice(index, 0, child)
      else parent.children.push(child)
    },
    remove: (child) => {
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
      child.parent = null
    },
    setText: (item, value) => {
      item.text = value
    },
    setElementText: (item, value) => {
      item.text = value
      item.children = []
    },
    parentNode: (item) => item.parent,
    nextSibling: (item) => item.parent?.children[item.parent.children.indexOf(item) + 1] ?? null,
    patchProp: (item, key, _old, value) => {
      item.props[key] = value
    },
    querySelector: () => body,
  })
  menu.onOpenContextMenu(1, { clientX: 10, clientY: 10 } as MouseEvent, 'track', 'keyboard')
  const app = renderer.createApp({
    render: () =>
      h(LibraryContextMenu, {
        open: menu.contextMenu.value !== null,
        source: 'track',
        anchor: menu.contextMenuAnchor.value,
        trackTitle: 'Track',
        albumTitle: 'Album',
        canLocateCurrent: true,
        canInsert: true,
        currentViewMode: 'flat',
        playlists: menu.regularPlaylistItems.value,
        playlistFeedback: menu.addToPlaylistFeedback.value,
        playlistLoading: menu.playlistLoading.value,
        playlistLoadError: menu.playlistLoadError.value,
        creatingPlaylist: menu.isCreatingPlaylistFromMenu.value,
        onClose: () => menu.closeContextMenu(),
        onAddToPlaylist: (item: SidebarPlaylistItem) => {
          void menu.onAddContextTracksToPlaylist(item)
        },
        onCreatePlaylist: () => {
          void menu.onCreatePlaylistAndAddContextTracks()
        },
      }),
  })
  app.directive('tooltip', {})
  app.mount(node())
  cleanups.push(() => {
    app.unmount()
    menu.dispose()
  })
  async function settle() {
    await nextTick()
    await Promise.resolve()
    await nextTick()
  }
  await settle()
  async function key(key: string) {
    const backdrop = findAll(body, (item) => typeof item.props.onKeydown === 'function')[0]
    ;(backdrop.props.onKeydown as (event: object) => void)({
      key,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    })
    await settle()
  }
  async function openPlaylistSubmenu() {
    for (let i = 0; i < 3; i++) await key('ArrowDown')
    expect(focused?.props['data-context-main-index']).toBe('3')
    await key('ArrowRight')
    expect(textContent(focused!)).toContain('library.contextMenu.createPlaylist')
    await key('ArrowDown')
    expect(textContent(focused!)).toContain('Night')
  }
  return { body, menu, key, settle, openPlaylistSubmenu }
}

describe('LibraryContextMenu add result events and keyboard navigation', () => {
  it.each([
    {
      addedCount: 0,
      alreadyPresentCount: 0,
      unavailableCount: 1,
      playlistExists: true,
      message: 'tracksUnavailable',
    },
    {
      addedCount: 0,
      alreadyPresentCount: 0,
      unavailableCount: 0,
      playlistExists: false,
      message: 'playlistNotFound',
    },
    {
      addedCount: 1,
      alreadyPresentCount: 0,
      unavailableCount: 1,
      playlistExists: true,
      message: 'addedPartial',
    },
  ])(
    'renders $message after the real submenu event and leaves retry/escape usable',
    async ({ message, ...result }) => {
      const harness = await mountInteractiveMenu(async () => result)
      await harness.openPlaylistSubmenu()
      await harness.key('Enter')
      const alerts = findAll(harness.body, (item) => item.props.role === 'alert')
      expect(alerts).toHaveLength(1)
      expect(textContent(alerts[0])).toContain(`library.contextMenu.${message}`)
      expect(textContent(harness.body)).not.toContain('library.contextMenu.addedSuccess')
      vi.advanceTimersByTime(1500)
      expect(harness.menu.contextMenu.value).not.toBeNull()
      expect(focused?.props['data-context-main-index']).toBe('3')
      await harness.key('ArrowRight')
      await harness.key('End')
      expect(textContent(focused!)).toContain('Night')
      await harness.key('Escape')
      await harness.key('Escape')
      expect(harness.menu.contextMenu.value).toBeNull()
    },
  )

  it('handles a real click rejection, then renders duplicate feedback on keyboard retry', async () => {
    const add = vi
      .fn<() => Promise<AddPlaylistTracksResult>>()
      .mockRejectedValueOnce(new Error('fixture write error'))
      .mockResolvedValue({
        addedCount: 0,
        alreadyPresentCount: 1,
        unavailableCount: 0,
        playlistExists: true,
      })
    const harness = await mountInteractiveMenu(add)
    await harness.openPlaylistSubmenu()
    ;(focused!.props.onClick as (event: object) => void)({ stopPropagation: vi.fn() })
    await harness.settle()
    expect(textContent(harness.body)).toContain('library.contextMenu.playlistAddError')
    vi.advanceTimersByTime(1500)
    expect(harness.menu.contextMenu.value).not.toBeNull()
    await harness.key('ArrowRight')
    await harness.key('End')
    await harness.key('Enter')
    const status = findAll(harness.body, (item) => item.props.role === 'status')
    expect(status).toHaveLength(1)
    expect(textContent(status[0])).toContain('library.contextMenu.alreadyInPlaylist')
    expect(findAll(harness.body, (item) => item.props.role === 'alert')).toHaveLength(0)
    vi.advanceTimersByTime(1200)
    await harness.settle()
    expect(harness.menu.contextMenu.value).toBeNull()
  })
})
