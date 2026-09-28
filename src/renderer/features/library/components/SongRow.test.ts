import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import SongRow from './SongRow.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

function createTrack(id: number): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: `Artist ${id}`,
    album: `Album ${id}`,
    albumArtist: null,
    trackNo: 1,
    discNo: 1,
    releaseDate: '2026',
    copyright: null,
    composer: null,
    durationSeconds: 180,
    artworkCacheKey: null,
    genre: 'Rock',
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-01-01',
  }
}

// Mount the real component with Vue's renderer, without requiring a browser DOM.
type TestNode = { props: Record<string, unknown>; children: TestNode[] }
function node(): TestNode {
  return { props: {}, children: [] }
}
const renderer = createRenderer<TestNode, TestNode>({
  createElement: node,
  createText: node,
  createComment: node,
  insert: (child, parent) => {
    parent.children.push(child)
  },
  remove: () => undefined,
  setText: () => undefined,
  setElementText: () => undefined,
  parentNode: () => null,
  nextSibling: () => null,
  patchProp: (element, key, _previous, value) => {
    element.props[key] = value
  },
})
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
})

function mountRows() {
  const selectedId = ref<number | null>(null)
  const focusedId = ref<number | null>(null)
  const play = vi.fn()
  const contextMenu = vi.fn((id: number) => {
    selectedId.value = id
  })
  const app = renderer.createApp({
    render: () =>
      h(
        'div',
        [1, 2].map((id) =>
          h(SongRow, {
            track: createTrack(id),
            nowPlaying: false,
            isPlaying: false,
            selected: selectedId.value === id,
            focused: focusedId.value === id,
            index: id - 1,
            artworkUrl: null,
            onFocus: (trackId: number) => {
              focusedId.value = trackId
            },
            onSelect: (trackId: number) => {
              selectedId.value = trackId
            },
            onPlay: play,
            onOpenContextMenu: contextMenu,
          }),
        ),
      ),
  })
  app.directive('tooltip', {})
  const container = node()
  app.mount(container)
  cleanups.push(() => app.unmount())
  const rows = container.children[0].children
  function fire(index: number, name: string, event = {}) {
    const handler = rows[index].props[name] as (event: object) => void
    handler(event)
  }
  return { selectedId, focusedId, play, contextMenu, rows, fire }
}

describe('SongRow', () => {
  it('focuses a clicked row without selecting or playing it', async () => {
    const view = mountRows()
    const focus = vi.fn()
    view.fire(1, 'onClick', { currentTarget: { focus } })
    await nextTick()
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(view.focusedId.value).toBe(2)
    expect(view.selectedId.value).toBeNull()
    expect(view.rows[1].props.tabindex).toBe(0)
    expect(view.rows[1].props['aria-pressed']).toBe(false)
    expect(view.play).not.toHaveBeenCalled()
  })

  it('preserves right-click selection when another row is clicked', async () => {
    const view = mountRows()
    const event = { preventDefault: vi.fn() }
    view.fire(0, 'onContextmenu', event)
    view.fire(1, 'onClick', { currentTarget: { focus: vi.fn() } })
    await nextTick()
    expect(event.preventDefault).toHaveBeenCalled()
    expect(view.contextMenu).toHaveBeenCalledWith(1, event, 'pointer')
    expect(view.selectedId.value).toBe(1)
    expect(view.focusedId.value).toBe(2)
    expect(view.rows[0].props['aria-pressed']).toBe(true)
    expect(view.rows[1].props['aria-pressed']).toBe(false)
  })

  it('preserves space selection and Enter playback', () => {
    const view = mountRows()
    const preventDefault = vi.fn()
    view.fire(1, 'onKeydown', { key: ' ', preventDefault })
    expect(view.selectedId.value).toBe(2)
    expect(preventDefault).toHaveBeenCalledOnce()
    view.fire(1, 'onKeydown', { key: 'Enter', preventDefault })
    expect(view.play).toHaveBeenCalledExactlyOnceWith(2)
  })

  it('plays on double-click without selecting during its two clicks', () => {
    const view = mountRows()
    const event = { currentTarget: { focus: vi.fn() } }
    view.fire(1, 'onClick', event)
    expect(view.selectedId.value).toBeNull()
    view.fire(1, 'onClick', event)
    expect(view.selectedId.value).toBeNull()
    view.fire(1, 'onDblclick')
    expect(view.play).toHaveBeenCalledExactlyOnceWith(2)
  })
})
