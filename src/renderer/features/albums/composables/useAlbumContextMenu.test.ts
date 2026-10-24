import { effectScope, markRaw, nextTick, ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import type { AlbumSummary } from '../types'
import { useAlbumContextMenu } from './useAlbumContextMenu'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.unstubAllGlobals()
})

function fixture() {
  const doc = { activeElement: null as Element | null }
  class Element {
    isConnected = true
    disabled = false
    dataset: Record<string, string> = {}
    items: Element[] = []
    constructor(action = '') {
      this.dataset.albumMenuAction = action
      markRaw(this)
    }
    focus() {
      doc.activeElement = this
    }
    contains(node: unknown) {
      return this.items.includes(node as Element)
    }
    getBoundingClientRect() {
      return { width: 250, height: 100 }
    }
    querySelectorAll() {
      return this.items.filter((item) => !item.disabled)
    }
    querySelector(selector: string) {
      return selector.includes('data-album-menu-action="play"')
        ? this.items.find((item) => item.dataset.albumMenuAction === 'play')
        : this.items.find((item) => !item.disabled)
    }
  }
  vi.stubGlobal('HTMLElement', Element)
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', { innerWidth: 400, innerHeight: 300 })
  const scope = effectScope()
  scopes.push(scope)
  const hasCurrentTrack = ref(true)
  const reveal = vi.fn(
    async (): Promise<{ ok: true } | { ok: false; reason: 'not-found' }> => ({ ok: true }),
  )
  const menu = scope.run(() =>
    useAlbumContextMenu({ hasCurrentTrack, revealInExplorer: reveal, t: (key) => key }),
  )!
  const trigger = new Element()
  const root = new Element()
  const play = new Element('play')
  const locate = new Element('locate')
  const insert = new Element('insert')
  root.items = [play, locate, insert]
  menu.contextMenuRef.value = root as unknown as HTMLElement
  const album = { key: 'album', tracks: [{ id: 9 }] } as AlbumSummary
  const open = (value = album) =>
    menu.openContextMenu(value, {
      currentTarget: trigger,
      clientX: 390,
      clientY: 290,
    } as unknown as MouseEvent)
  const key = (value: string) =>
    menu.onContextMenuKeydown({
      key: value,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent)
  return { menu, doc, trigger, play, locate, insert, hasCurrentTrack, reveal, open, key }
}

it('clamps the menu, navigates enabled actions and restores its trigger on Escape', async () => {
  const f = fixture()
  f.open()
  await nextTick()
  expect(f.menu.contextMenu.value).toMatchObject({ x: 142, y: 192 })
  expect(f.doc.activeElement).toBe(f.play)
  f.locate.disabled = true
  f.key('ArrowDown')
  expect(f.doc.activeElement).toBe(f.insert)
  f.key('ArrowDown')
  expect(f.doc.activeElement).toBe(f.play)
  f.key('End')
  expect(f.doc.activeElement).toBe(f.insert)
  f.key('Escape')
  expect(f.menu.contextMenu.value).toBeNull()
  expect(f.doc.activeElement).toBe(f.trigger)
})

it('moves focus to play when the currently focused playback action disappears', async () => {
  const f = fixture()
  f.open()
  await nextTick()
  f.locate.focus()
  f.hasCurrentTrack.value = false
  await nextTick()
  await nextTick()
  expect(f.doc.activeElement).toBe(f.play)
})

it('discards a reveal result after the menu is replaced or deactivated', async () => {
  const f = fixture()
  let finish!: (result: { ok: true }) => void
  f.reveal.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  f.open()
  await nextTick()
  const pending = f.menu.revealContextAlbumInExplorer()
  f.menu.deactivate()
  f.open({ key: 'other', tracks: [{ id: 10 }] } as AlbumSummary)
  finish({ ok: true })
  await pending
  expect(f.reveal).toHaveBeenCalledExactlyOnceWith({ trackIds: [9] })
  expect(f.menu.contextMenu.value?.album.key).toBe('other')
  expect(f.menu.revealFeedback.value).toBeNull()
})
