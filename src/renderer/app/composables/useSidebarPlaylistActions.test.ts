import { createSidebarPlaylistCollection } from '../utils/sidebarPlaylistCollection'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markRaw, reactive } from 'vue'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import { DEFAULT_RECENT_PLAYED_DAYS } from '@shared/smartPlaylists/recentFrequent'
import { useSidebarPlaylistActions } from './useSidebarPlaylistActions'
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))
type Options = Parameters<typeof useSidebarPlaylistActions>[0]
function record(id = 1) {
  return {
    id,
    name: `Playlist ${id}`,
    viewMode: 'flat' as const,
    sortOrder: id,
    createdAt: '',
    updatedAt: '',
  }
}
function smart(id = 1) {
  return { ...record(id), rule: { preset: 'mostListened' as const } }
}
function item(id = 1, kind: SidebarPlaylistItem['kind'] = 'playlist'): SidebarPlaylistItem {
  return { ...record(id), kind, trackCount: 4 }
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
class ElementHost {
  isConnected = true
  disabled = false
  insideOverlay = false
  deleteHit = false
  rect = { right: 300, bottom: 100 }
  focus = vi.fn()
  select = vi.fn()
  button: ElementHost | null = null
  constructor() {
    markRaw(this)
  }
  hasAttribute(name: string) {
    return name === 'disabled' && this.disabled
  }
  closest(selector: string) {
    return (selector === '.sidebar-overlay' ? this.insideOverlay : this.deleteHit) ? this : null
  }
  getBoundingClientRect() {
    return this.rect
  }
  querySelector() {
    return this.button
  }
}
const nodes = new Map<string, ElementHost>()
const doc = {
  activeElement: null as ElementHost | null,
  querySelector: (selector: string) => nodes.get(selector) ?? null,
}
let win: EventTarget & { innerWidth: number; innerHeight: number }
beforeEach(() => {
  vi.clearAllMocks()
  nodes.clear()
  doc.activeElement = null
  win = Object.assign(new EventTarget(), { innerWidth: 1000, innerHeight: 800 })
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', doc)
  vi.stubGlobal('HTMLElement', ElementHost)
  vi.stubGlobal('Element', ElementHost)
  vi.stubGlobal('CSS', { escape: (key: string) => key })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function setup() {
  const trace: string[] = []
  win.addEventListener('auralis-playlists-changed', () => trace.push('event:playlist'))
  win.addEventListener('auralis-smart-playlists-changed', () => trace.push('event:smart'))
  const api = {
    playlists: {
      create: vi.fn<Options['api']['playlists']['create']>(async () => {
        trace.push('write:create')
        return record(3)
      }),
      rename: vi.fn<Options['api']['playlists']['rename']>(async () => {
        trace.push('write:rename')
        return record()
      }),
      delete: vi.fn<Options['api']['playlists']['delete']>(async () => ({ deleted: true })),
    },
    smartPlaylists: {
      create: vi.fn<Options['api']['smartPlaylists']['create']>(async () => ({
        playlist: smart(3),
        created: true,
      })),
      rename: vi.fn<Options['api']['smartPlaylists']['rename']>(async () => smart()),
      delete: vi.fn<Options['api']['smartPlaylists']['delete']>(async () => ({ deleted: true })),
    },
  }
  const route = reactive({ path: '/songs' }),
    push = vi.fn<Options['router']['push']>(async (target) => {
      trace.push(`push:${String(target)}`)
    })
  const playlists = createSidebarPlaylistCollection([item(), item(1, 'smart'), item(2)]),
    playlistItems = playlists.items,
    reload = vi.fn(async () => {
      trace.push('reload')
    })
  const cancel = vi.fn(),
    canMove = vi.fn(() => true),
    move = vi.fn(),
    closeRecent = vi.fn(),
    keydown = vi.fn()
  const s = useSidebarPlaylistActions({
    api,
    route,
    router: { push },
    t: (key) => key,
    playlistItems,
    removePlaylist: playlists.remove,
    reloadPlaylists: reload,
    cancelReorder: cancel,
    canMove,
    move,
    closeRecentAddedContextMenu: closeRecent,
    getPlaylistKey: (p) => `${p.kind}:${p.id}`,
    getPlaylistPath: (p) =>
      p.kind === 'playlist' ? `/playlists/${p.id}` : `/smart-playlists/${p.id}`,
    onMenuKeydown: keydown,
  })
  const button = new ElementHost()
  s.createPlaylistButton.value = button as unknown as HTMLButtonElement
  nodes.set('.app-sidebar .smart-playlist-add-button', button)
  for (const p of playlistItems.value)
    nodes.set(`[data-sidebar-playlist-key="${p.kind}:${p.id}"]`, new ElementHost())
  function open(p = playlistItems.value[0]) {
    s.openPlaylistContextMenu(p, { clientX: 30, clientY: 70 } as MouseEvent)
  }
  async function rename(p = playlistItems.value[0]) {
    open(p)
    await s.openRenameDialog()
  }
  return {
    s,
    api,
    route,
    push,
    playlistItems,
    playlists,
    reload,
    trace,
    cancel,
    canMove,
    move,
    closeRecent,
    keydown,
    button,
    open,
    rename,
  }
}

describe('sidebar playlist action sessions', () => {
  it('clamps create coordinates and clears competing menu drafts', () => {
    const f = setup()
    f.open()
    f.s.createError.value = 'old'
    f.s.smartCreateSubmenu.value = true
    f.button.rect = { right: 20, bottom: 900 }
    f.s.openCreateMenu()
    expect(f.s.createMenu.value).toEqual({ x: 8, y: 580 })
    expect(f.s.playlistContextMenu.value).toBeNull()
    expect(f.closeRecent).toHaveBeenCalledTimes(2)
    expect(f.s.createError.value).toBe('')
    expect(f.s.smartCreateSubmenu.value).toBe(false)
    f.button.rect = { right: 2000, bottom: -100 }
    f.s.openCreateMenu()
    expect(f.s.createMenu.value).toEqual({ x: 802, y: 8 })
    f.s.closeCreateMenu()
    f.s.createPlaylistButton.value = null
    f.s.openCreateMenu()
    expect(f.s.createMenu.value).toBeNull()
  })
  it('captures keyed context focus, cancels reorder and derives actions from the live mixed list', () => {
    const f = setup()
    f.s.openCreateMenu()
    f.s.deleteError.value = 'old'
    f.s.deletingPlaylist.value = item()
    f.open(item(1, 'smart'))
    expect(f.cancel).toHaveBeenCalledWith(true)
    expect(f.s.createMenu.value).toBeNull()
    expect(f.s.deleteError.value).toBe('')
    expect(f.s.deletingPlaylist.value).toBeNull()
    expect(f.s.playlistContextTrigger.value).toBe(
      nodes.get('[data-sidebar-playlist-key="smart:1"]'),
    )
    expect(f.s.playlistContextHasPrevious.value).toBe(true)
    expect(f.s.playlistContextHasNext.value).toBe(true)
    f.playlists.applyLoadedItems([item(1, 'smart'), item()], f.playlists.captureLoadVersion())
    expect(f.s.playlistContextHasPrevious.value).toBe(false)
    f.canMove.mockReturnValue(false)
    f.s.movePlaylistFromMenu(1)
    expect(f.move).not.toHaveBeenCalled()
    f.canMove.mockReturnValue(true)
    f.s.movePlaylistFromMenu(1)
    expect(f.move).toHaveBeenCalledWith(item(1, 'smart'), 1)
    expect(f.s.playlistContextMenu.value).toBeNull()
  })
  it('focuses the submenu after rendering, restores its trigger and delegates other keys', async () => {
    const f = setup(),
      panel = new ElementHost(),
      control = new ElementHost(),
      trigger = new ElementHost()
    panel.button = control
    f.s.smartCreatePanel.value = panel as unknown as HTMLElement
    f.s.smartCreateTrigger.value = trigger as unknown as HTMLButtonElement
    const pending = f.s.enterSmartCreateSubmenu()
    expect(control.focus).not.toHaveBeenCalled()
    await pending
    expect(control.focus).toHaveBeenCalledOnce()
    for (const key of ['ArrowLeft', 'Escape']) {
      const e = { key, preventDefault: vi.fn(), stopPropagation: vi.fn() }
      f.s.onSmartCreateSubmenuKeydown(e as unknown as KeyboardEvent)
      expect(e.preventDefault).toHaveBeenCalledOnce()
      expect(f.s.smartCreateSubmenu.value).toBe(false)
    }
    const e = { key: 'ArrowDown' } as KeyboardEvent
    f.s.onSmartCreateSubmenuKeydown(e)
    expect(f.keydown).toHaveBeenCalledWith(e)
    f.s.openCreateMenu()
    f.s.openSmartPlaylistBuilder()
    expect(f.s.isBuilderOpen.value).toBe(true)
    expect(f.s.sidebarModalTrigger.value).toBe(f.button)
    expect(f.s.createMenu.value).toBeNull()
  })
  it.each(['recentPlayed', 'mostListened'] as const)(
    'creates %s once and keeps refresh/event/navigation order',
    async (preset) => {
      const f = setup(),
        saved = deferred<Awaited<ReturnType<typeof f.api.smartPlaylists.create>>>()
      f.api.smartPlaylists.create.mockReturnValueOnce(saved.promise)
      f.s.openCreateMenu()
      const task = f.s.createPlaybackPreset(preset)
      await f.s.createPlaybackPreset(preset)
      expect(f.api.smartPlaylists.create).toHaveBeenCalledOnce()
      expect(f.api.smartPlaylists.create).toHaveBeenCalledWith(
        preset === 'recentPlayed' ? 'sidebar.recentPlayed' : 'sidebar.mostListened',
        preset === 'recentPlayed' ? { preset, days: DEFAULT_RECENT_PLAYED_DAYS } : { preset },
      )
      expect(f.s.creatingPlaybackPreset.value).toBe(preset)
      saved.resolve({ playlist: smart(3), created: true })
      await task
      expect(f.trace).toEqual(['reload', 'push:/smart-playlists/3'])
      expect(f.s.createMenu.value).toBeNull()
      expect(f.s.creatingPlaybackPreset.value).toBeNull()
    },
  )
  it.each(['write', 'refresh', 'navigation'] as const)(
    'handles preset %s failure without another write',
    async (stage) => {
      const f = setup(),
        failure = new Error(stage)
      if (stage === 'write') f.api.smartPlaylists.create.mockRejectedValueOnce(failure)
      if (stage === 'refresh') f.reload.mockRejectedValueOnce(failure)
      if (stage === 'navigation') f.push.mockRejectedValueOnce(failure)
      f.s.openCreateMenu()
      await f.s.createPlaybackPreset('mostListened')
      expect(f.api.smartPlaylists.create).toHaveBeenCalledOnce()
      expect(f.s.creatingPlaybackPreset.value).toBeNull()
      expect(f.s.createError.value).toBe('sidebar.createPlaylistFailed')
      expect(f.s.createMenu.value === null).toBe(stage === 'navigation')
    },
  )
  it('keeps regular create open until success and prevents overlapping writes', async () => {
    const f = setup()
    f.s.openCreateMenu()
    const task = f.s.createRegularPlaylist()
    expect(f.s.createMenu.value).not.toBeNull()
    expect(f.s.creatingRegularPlaylist.value).toBe(true)
    await f.s.createRegularPlaylist()
    await task
    expect(f.api.playlists.create).toHaveBeenCalledOnce()
    expect(f.s.createMenu.value).toBeNull()
    expect(f.s.creatingRegularPlaylist.value).toBe(false)
    expect(f.trace).toEqual(['write:create', 'reload', 'push:/playlists/3'])
  })
  it.each(['write', 'refresh', 'navigation'] as const)(
    'shows regular create %s failure and retries without duplicating a saved playlist',
    async (stage) => {
      const f = setup(),
        failure = new Error(stage)
      if (stage === 'write') f.api.playlists.create.mockRejectedValueOnce(failure)
      if (stage === 'refresh') f.reload.mockRejectedValueOnce(failure)
      if (stage === 'navigation') f.push.mockRejectedValueOnce(failure)
      f.s.openCreateMenu()
      await expect(f.s.createRegularPlaylist()).resolves.toBeUndefined()
      expect(f.api.playlists.create).toHaveBeenCalledOnce()
      expect(f.s.createMenu.value).not.toBeNull()
      expect(f.s.createError.value).toBe('sidebar.createPlaylistFailed')
      expect(f.s.creatingRegularPlaylist.value).toBe(false)
      await f.s.createRegularPlaylist()
      expect(f.api.playlists.create).toHaveBeenCalledTimes(stage === 'write' ? 2 : 1)
      expect(f.s.createError.value).toBe('')
      expect(f.s.createMenu.value).toBeNull()
      expect(f.push).toHaveBeenLastCalledWith('/playlists/3')
    },
  )
  it('does not show a late regular create error in a reopened menu', async () => {
    const f = setup()
    const pending = deferred<Awaited<ReturnType<typeof f.api.playlists.create>>>()
    f.api.playlists.create.mockReturnValueOnce(pending.promise)
    f.s.openCreateMenu()
    const task = f.s.createRegularPlaylist()
    f.s.closeCreateMenu()
    f.s.openCreateMenu()
    pending.reject(new Error('SQLITE_BUSY'))
    await task
    expect(f.s.createMenu.value).not.toBeNull()
    expect(f.s.createError.value).toBe('')
    expect(f.s.creatingRegularPlaylist.value).toBe(false)
  })

  it('selects rename after rendering, rejects blank input and preserves the raw submitted name', async () => {
    const f = setup(),
      input = new ElementHost()
    f.s.renameInput.value = input as unknown as HTMLInputElement
    f.open()
    const pending = f.s.openRenameDialog()
    expect(input.select).not.toHaveBeenCalled()
    await pending
    expect(input.select).toHaveBeenCalledOnce()
    expect(f.s.sidebarModalTrigger.value).toBe(
      nodes.get('[data-sidebar-playlist-key="playlist:1"]'),
    )
    f.s.renameValue.value = ' '
    await f.s.submitRename()
    expect(f.s.renameError.value).toBe('sidebar.playlistNameRequired')
    expect(f.api.playlists.rename).not.toHaveBeenCalled()
    f.s.renameValue.value = '  New  '
    await f.s.submitRename()
    expect(f.api.playlists.rename).toHaveBeenCalledWith(1, '  New  ')
  })
  it.each(['playlist', 'smart'] as const)(
    'renames %s once and emits before refresh',
    async (kind) => {
      const f = setup()
      await f.rename(item(1, kind))
      const api = kind === 'playlist' ? f.api.playlists : f.api.smartPlaylists
      const saved = deferred<ReturnType<typeof smart>>()
      api.rename.mockReturnValueOnce(saved.promise)
      const task = f.s.submitRename()
      await f.s.submitRename()
      expect(api.rename).toHaveBeenCalledOnce()
      expect(f.s.isSavingRename.value).toBe(true)
      saved.resolve(smart())
      await task
      expect(f.trace).toEqual(['reload'])
      expect(f.s.renamingPlaylist.value).toBeNull()
      expect(f.s.isSavingRename.value).toBe(false)
    },
  )
  it('closes a rename returning null without reloading or emitting', async () => {
    const f = setup()
    await f.rename()
    f.api.playlists.rename.mockResolvedValueOnce(null)
    await f.s.submitRename()
    expect(f.trace).toEqual([])
    expect(f.s.renamingPlaylist.value).toBeNull()
  })
  it.each(['write', 'refresh'] as const)(
    'retains the rename draft on %s failure',
    async (stage) => {
      const f = setup()
      await f.rename()
      f.s.renameValue.value = 'Draft'
      if (stage === 'write') f.api.playlists.rename.mockRejectedValueOnce(new Error(stage))
      else f.reload.mockRejectedValueOnce(new Error(stage))
      await f.s.submitRename()
      expect(f.s.renameError.value).toBe('sidebar.renameFailed')
      expect(f.s.renameValue.value).toBe('Draft')
      expect(f.s.renamingPlaylist.value).not.toBeNull()
      expect(f.s.isSavingRename.value).toBe(false)
      expect(f.api.playlists.rename).toHaveBeenCalledOnce()
    },
  )
  it.each(['success', 'failure'] as const)(
    'keeps the new rename session after obsolete %s',
    async (result) => {
      const f = setup(),
        old = deferred<ReturnType<typeof record>>(),
        current = deferred<ReturnType<typeof smart>>()
      await f.rename()
      f.api.playlists.rename.mockReturnValueOnce(old.promise)
      const first = f.s.submitRename()
      f.s.closeRenameDialog()
      await f.rename(item(1, 'smart'))
      f.api.smartPlaylists.rename.mockReturnValueOnce(current.promise)
      f.s.renameValue.value = 'Current'
      const second = f.s.submitRename()
      if (result === 'success') old.resolve(record())
      else old.reject(new Error('old'))
      await first
      expect(f.s.renamingPlaylist.value?.kind).toBe('smart')
      expect(f.s.renameValue.value).toBe('Current')
      expect(f.s.renameError.value).toBe('')
      expect(f.s.isSavingRename.value).toBe(true)
      expect(f.reload).toHaveBeenCalledTimes(result === 'success' ? 1 : 0)
      current.resolve(smart())
      await second
    },
  )
  it.each(['playlist', 'smart'] as const)(
    'confirms %s deletion twice and preserves the equal-ID peer',
    async (kind) => {
      const f = setup()
      f.open(item(1, kind))
      f.route.path = kind === 'playlist' ? '/playlists/1' : '/smart-playlists/1'
      const api = kind === 'playlist' ? f.api.playlists : f.api.smartPlaylists,
        saved = deferred<{ deleted: boolean }>()
      api.delete.mockReturnValueOnce(saved.promise)
      await f.s.requestDelete()
      expect(api.delete).not.toHaveBeenCalled()
      const task = f.s.requestDelete()
      await f.s.requestDelete()
      expect(api.delete).toHaveBeenCalledOnce()
      saved.resolve({ deleted: true })
      await task
      expect(f.playlistItems.value.some((p) => p.kind === kind && p.id === 1)).toBe(false)
      expect(f.playlistItems.value.some((p) => p.kind !== kind && p.id === 1)).toBe(true)
      expect(f.trace).toEqual(['push:/songs'])
      expect(f.s.playlistContextMenu.value).toBeNull()
      expect(f.s.isDeletingPlaylist.value).toBe(false)
    },
  )
  it('closes a refused delete without changing items or emitting', async () => {
    const f = setup()
    f.open()
    f.api.playlists.delete.mockResolvedValueOnce({ deleted: false })
    await f.s.requestDelete()
    await f.s.requestDelete()
    expect(f.playlistItems.value).toHaveLength(3)
    expect(f.trace).toEqual([])
    expect(f.s.playlistContextMenu.value).toBeNull()
  })
  it.each(['write', 'navigation'] as const)(
    'keeps the current delete error on %s failure',
    async (stage) => {
      const f = setup()
      f.open()
      f.route.path = '/playlists/1'
      if (stage === 'write') f.api.playlists.delete.mockRejectedValueOnce(new Error(stage))
      else f.push.mockRejectedValueOnce(new Error(stage))
      await f.s.requestDelete()
      await f.s.requestDelete()
      expect(f.s.deleteError.value).toBe('sidebar.deleteFailed')
      expect(f.s.deletingPlaylist.value).toBeNull()
      expect(f.s.playlistContextMenu.value).not.toBeNull()
      expect(f.s.isDeletingPlaylist.value).toBe(false)
      expect(f.playlistItems.value.some((p) => p.kind === 'playlist' && p.id === 1)).toBe(
        stage === 'write',
      )
    },
  )
  it.each(['success', 'failure'] as const)(
    'keeps the replacement context after old delete %s',
    async (result) => {
      const f = setup(),
        pending = deferred<{ deleted: boolean }>()
      f.open()
      f.api.playlists.delete.mockReturnValueOnce(pending.promise)
      await f.s.requestDelete()
      const task = f.s.requestDelete()
      f.open(item(1, 'smart'))
      const menu = f.s.playlistContextMenu.value
      await f.s.requestDelete()
      expect(f.api.smartPlaylists.delete).not.toHaveBeenCalled()
      if (result === 'success') pending.resolve({ deleted: true })
      else pending.reject(new Error('old'))
      await task
      expect(f.s.playlistContextMenu.value).toBe(menu)
      expect(f.s.deleteError.value).toBe('')
      expect(f.s.isDeletingPlaylist.value).toBe(false)
      expect(f.playlistItems.value.some((p) => p.kind === 'playlist' && p.id === 1)).toBe(
        result === 'failure',
      )
    },
  )
  it.each([true, false])(
    'uses the current route to decide delete redirection: matching=%s',
    async (matching) => {
      const f = setup(),
        pending = deferred<{ deleted: boolean }>()
      f.open()
      f.api.playlists.delete.mockReturnValueOnce(pending.promise)
      await f.s.requestDelete()
      const task = f.s.requestDelete()
      f.route.path = matching ? '/playlists/1' : '/smart-playlists/1'
      pending.resolve({ deleted: true })
      await task
      expect(f.push).toHaveBeenCalledTimes(matching ? 1 : 0)
    },
  )
  it('clears confirmation only on clicks outside the delete control', async () => {
    const f = setup(),
      node = new ElementHost()
    f.open()
    await f.s.requestDelete()
    f.s.deleteError.value = 'old'
    node.deleteHit = true
    f.s.cancelDeleteOnOtherClick({ target: node } as unknown as MouseEvent)
    expect(f.s.deletingPlaylist.value).not.toBeNull()
    node.deleteHit = false
    f.s.cancelDeleteOnOtherClick({ target: node } as unknown as MouseEvent)
    expect(f.s.deletingPlaylist.value).toBeNull()
    expect(f.s.deleteError.value).toBe('')
    f.s.closePlaylistContextMenu()
    await f.s.requestDelete()
    expect(f.api.playlists.delete).not.toHaveBeenCalled()
  })
})
