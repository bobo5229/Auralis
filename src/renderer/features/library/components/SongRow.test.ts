import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref, type Component } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import SongRow from './SongRow.vue'
import AlbumCoverTrackRow from './AlbumCoverTrackRow.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: ref('zh-Hans'),
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
type TestNode = { props: Record<string, unknown>; children: TestNode[]; text?: string }
function node(): TestNode {
  return { props: {}, children: [] }
}
const renderer = createRenderer<TestNode, TestNode>({
  createElement: node,
  createText: (text) => ({ ...node(), text }),
  createComment: node,
  insert: (child, parent) => {
    parent.children.push(child)
  },
  remove: () => undefined,
  setText: (element, text) => {
    element.text = text
  },
  setElementText: (element, text) => {
    element.text = text
  },
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

function mountRows(component: Component, trackPatch: Partial<TrackListItem> = {}) {
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
          h(component, {
            track: { ...createTrack(id), ...trackPatch },
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
    handler?.(event)
  }
  return { selectedId, focusedId, play, contextMenu, rows, fire }
}

describe.each([
  ['SongRow', SongRow],
  ['AlbumCoverTrackRow', AlbumCoverTrackRow],
] as const)('%s', (_name, component) => {
  it.each([null, '', '   '])('shows the missing-title fallback for %j', (title) => {
    const view = mountRows(component, { title })
    const texts = (element: TestNode): string[] => [
      element.text ?? '',
      ...element.children.flatMap(texts),
    ]
    expect(texts(view.rows[0])).toContain('library.missing.title')
  })

  it.each([{ isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }])(
    'does not activate during composition or after another handler: %j',
    (flags) => {
      const view = mountRows(component)
      const preventDefault = vi.fn()
      view.fire(0, 'onKeydown', { key: 'Enter', preventDefault, ...flags })
      view.fire(0, 'onKeydown', { key: ' ', preventDefault, ...flags })
      expect(view.play).not.toHaveBeenCalled()
      expect(view.selectedId.value).toBeNull()
      expect(preventDefault).not.toHaveBeenCalled()
    },
  )

  it('does not handle a single click', async () => {
    const view = mountRows(component)
    const focus = vi.fn()
    view.fire(1, 'onClick', { currentTarget: { focus } })
    await nextTick()
    expect(view.rows[1].props.onClick).toBeUndefined()
    expect(focus).not.toHaveBeenCalled()
    expect(view.focusedId.value).toBeNull()
    expect(view.selectedId.value).toBeNull()
    expect(view.rows[1].props.tabindex).toBe(-1)
    expect(view.rows[1].props['aria-pressed']).toBe(false)
    expect(view.play).not.toHaveBeenCalled()
  })

  it('preserves right-click selection when another row is clicked', async () => {
    const view = mountRows(component)
    const event = { preventDefault: vi.fn() }
    view.fire(0, 'onContextmenu', event)
    view.fire(1, 'onClick', { currentTarget: { focus: vi.fn() } })
    await nextTick()
    expect(event.preventDefault).toHaveBeenCalled()
    expect(view.contextMenu).toHaveBeenCalledWith(1, event, 'pointer')
    expect(view.selectedId.value).toBe(1)
    expect(view.focusedId.value).toBeNull()
    expect(view.rows[0].props['aria-pressed']).toBe(true)
    expect(view.rows[1].props['aria-pressed']).toBe(false)
  })

  it('preserves space selection and Enter playback', () => {
    const view = mountRows(component)
    const preventDefault = vi.fn()
    view.fire(1, 'onKeydown', { key: ' ', preventDefault })
    expect(view.selectedId.value).toBe(2)
    expect(preventDefault).toHaveBeenCalledOnce()
    view.fire(1, 'onKeydown', { key: 'Enter', preventDefault })
    expect(view.play).toHaveBeenCalledExactlyOnceWith(2)
  })

  it('plays on double-click without selecting during its two clicks', () => {
    const view = mountRows(component)
    const event = { currentTarget: { focus: vi.fn() } }
    view.fire(1, 'onClick', event)
    expect(view.selectedId.value).toBeNull()
    view.fire(1, 'onClick', event)
    expect(view.selectedId.value).toBeNull()
    view.fire(1, 'onDblclick')
    expect(view.play).toHaveBeenCalledExactlyOnceWith(2)
  })
})
