import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref, shallowRef } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import VirtualAlbumTrackList from './VirtualAlbumTrackList.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ locale: ref('zh-Hans'), t: (key: string) => key }),
}))
vi.mock('@renderer/i18n', () => ({
  uiText: (_key: string, values: { number: string }) => values.number,
}))

type Node = { props: Record<string, unknown>; children: Node[]; parent: Node | null }
const node = (): Node => ({ props: {}, children: [], parent: null })
const renderer = createRenderer<Node, Node>({
  createElement: node,
  createText: node,
  createComment: node,
  insert(child, parent, anchor) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    const index = anchor ? parent.children.indexOf(anchor) : -1
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child)
    child.parent = parent
  },
  remove(child) {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = null
  },
  setText: () => undefined,
  setElementText: () => undefined,
  parentNode: (child) => child.parent,
  nextSibling: (child) => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  patchProp: (element, key, _previous, value) => {
    element.props[key] = value
  },
})
const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

function mountList() {
  const listeners = new Map<string, () => void>()
  const element = {
    offsetWidth: 800,
    offsetHeight: 480,
    scrollTop: 0,
    ownerDocument: { defaultView: { setTimeout, clearTimeout } },
    addEventListener: (name: string, callback: () => void) => listeners.set(name, callback),
    removeEventListener: (name: string) => listeners.delete(name),
    scrollTo: ({ top }: { top: number }) => {
      element.scrollTop = top
    },
  }
  const tracks = shallowRef(
    Array.from(
      { length: 1000 },
      (_, index) =>
        ({
          id: index + 1,
          title: `Track ${index + 1}`,
          artist: 'Artist',
          album: 'Album',
          albumArtist: 'Artist',
          trackNo: (index % 100) + 1,
          discNo: Math.floor(index / 100) + 1,
          releaseDate: null,
          copyright: null,
          composer: null,
          durationSeconds: 180,
          artworkCacheKey: null,
          genre: null,
          availability: 'available',
          playCount: 0,
          lastPlayedAt: null,
          createdAt: '2026-01-01',
        }) satisfies TrackListItem,
    ),
  )
  const focusedTrackId = ref<number | null>(null)
  const app = renderer.createApp({
    render: () =>
      h(VirtualAlbumTrackList, {
        tracks: tracks.value,
        scrollElement: element as unknown as HTMLElement,
        startOffset: 16,
        nowPlayingTrackId: null,
        isPlaying: false,
        selectedTrackId: null,
        focusedTrackId: focusedTrackId.value,
      }),
  })
  app.directive('tooltip', {})
  const root = node()
  app.mount(root)
  cleanups.push(() => app.unmount())
  const rows = (): Node[] => {
    const visit = (current: Node): Node[] => [
      ...(current.props['data-track-id'] ? [current] : []),
      ...current.children.flatMap(visit),
    ]
    return visit(root)
  }
  async function scroll(top: number) {
    element.scrollTop = top
    listeners.get('scroll')?.()
    await nextTick()
  }
  return { root, rows, scroll, focusedTrackId, tracks }
}

describe('VirtualAlbumTrackList', () => {
  it('bounds mounted rows and preserves the full multi-disc scroll height', async () => {
    const view = mountList()
    await nextTick()
    expect(view.rows().length).toBeLessThan(30)
    expect(view.root.children[0].props.style).toEqual({ height: '48216px' })
    // Disc 2 starts after 100 rows, with its 24px heading above the first track.
    await view.scroll(44 + 4800)
    expect(view.rows().some((row) => row.props['data-track-id'] === 101)).toBe(true)
    expect(view.rows().length).toBeLessThan(30)
    await view.scroll(44 + 48100)
    expect(view.rows().some((row) => row.props['data-track-id'] === 1000)).toBe(true)
    expect(view.rows().length).toBeLessThan(30)
  })

  it('keeps an offscreen keyboard focus target mounted and releases the previous target', async () => {
    const view = mountList()
    view.focusedTrackId.value = 900
    await nextTick()
    expect(view.rows().find((row) => row.props['data-track-id'] === 900)?.props.tabindex).toBe(0)
    expect(view.rows().length).toBeLessThan(30)
    view.focusedTrackId.value = 901
    await nextTick()
    expect(view.rows().some((row) => row.props['data-track-id'] === 900)).toBe(false)
    expect(view.rows().find((row) => row.props['data-track-id'] === 901)?.props.tabindex).toBe(0)
  })

  it('updates rows and total geometry when a same-sized catalog snapshot changes discs', async () => {
    const view = mountList()
    view.tracks.value = view.tracks.value.map((track) => ({
      ...track,
      discNo: 1,
      id: track.id + 1000,
    }))
    await nextTick()
    expect(view.root.children[0].props.style).toEqual({ height: '48000px' })
    expect(view.rows().every((row) => Number(row.props['data-track-id']) > 1000)).toBe(true)
  })
})
