import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick } from 'vue'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import type { TrackListItem } from '@shared/types/libraryScan'
import AlbumCard from './AlbumCard.vue'
import type { AlbumSummary } from '../types'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/features/playback/composables/useArtworkPalette', async () => {
  const { ref } = await import('vue')
  return {
    prefetchArtworkPalette: vi.fn(),
    useArtworkPalette: () => ({
      palette: ref({
        key: 'cover-a',
        quality: 'full',
        dominant: { r: 20, g: 30, b: 40 },
        accents: [],
      }),
    }),
  }
})
vi.mock('@renderer/features/library/utils/getArtworkUrl', () => ({ getArtworkUrl: () => null }))

type TestNode = { props: Record<string, unknown>; children: TestNode[]; text?: string }
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
  setText: (node, text) => {
    node.text = text
  },
  setElementText: (node, text) => {
    node.text = text
  },
  parentNode: () => null,
  nextSibling: () => null,
  patchProp: (element, key, _previous, value) => {
    element.props[key] = value
  },
})

const track = { id: 1 } as TrackListItem
const album: AlbumSummary = {
  key: 'artist\u0000album',
  title: 'Album',
  albumArtist: 'Artist',
  releaseDate: null,
  artworkCacheKey: 'cover-a',
  tracks: [track],
}
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  useChineseTextDisplay().setSongInfoScript('simplified')
  vi.unstubAllGlobals()
})

function findByClass(root: TestNode, className: string): TestNode | undefined {
  if (
    String(root.props.class ?? '')
      .split(/\s+/)
      .includes(className)
  )
    return root
  for (const child of root.children) {
    const found = findByClass(child, className)
    if (found) return found
  }
  return undefined
}

function mountCard(sourceAlbum = album) {
  const open = vi.fn()
  const play = vi.fn()
  const openContextMenu = vi.fn()
  const container = node()
  const app = renderer.createApp({
    render: () =>
      h(AlbumCard, {
        album: sourceAlbum,
        onOpen: open,
        onPlay: play,
        onOpenContextMenu: openContextMenu,
      }),
  })
  app.mount(container)
  cleanups.push(() => app.unmount())
  return { root: container, open, play, openContextMenu }
}

describe('AlbumCard play control', () => {
  it('updates album metadata while keeping the source identity and emitted album intact', async () => {
    vi.stubGlobal('localStorage', { setItem: vi.fn() })
    const source = Object.freeze({ ...album, title: '看着你', albumArtist: '萧敬腾; 郁可唯' })
    const card = mountCard(source)
    useChineseTextDisplay().setSongInfoScript('traditional')
    await nextTick()
    expect(findByClass(card.root, 'album-card-title')?.text).toBe('看著你')
    expect(findByClass(card.root, 'album-card-artist')?.text).toBe('蕭敬騰 & 鬱可唯')
    ;(findByClass(card.root, 'album-card-play')?.props.onClick as () => void)()
    expect(card.play).toHaveBeenCalledWith(source)
    expect(source.title).toBe('看着你')
    expect(source.key).toBe(album.key)
  })
  it('uses the cover dominant color and plays without opening the album', () => {
    const card = mountCard()
    const playClip = findByClass(card.root, 'album-card-play-clip')
    const playButton = findByClass(card.root, 'album-card-play')
    const cover = findByClass(card.root, 'cover-stage')
    expect(playClip).toBeDefined()
    expect(playClip && findByClass(playClip, 'album-card-play')).toBe(playButton)
    expect(playButton).toBeDefined()
    expect(playButton?.props.style).toMatchObject({
      '--album-card-play-bg': 'rgb(20 30 40)',
      '--album-card-play-fg': '#ffffff',
    })
    ;(playButton?.props.onClick as () => void)()
    expect(card.play).toHaveBeenCalledExactlyOnceWith(album)
    expect(card.open).not.toHaveBeenCalled()
    ;(cover?.props.onClick as () => void)()
    expect(card.open).toHaveBeenCalledExactlyOnceWith(album)
    const contextEvent = { preventDefault: vi.fn() }
    ;(playButton?.props.onContextmenu as (event: object) => void)(contextEvent)
    expect(contextEvent.preventDefault).toHaveBeenCalledOnce()
    expect(card.openContextMenu).toHaveBeenCalledExactlyOnceWith(album, contextEvent)
  })
})
