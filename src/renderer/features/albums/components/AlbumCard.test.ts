import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref } from 'vue'
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
vi.mock('@renderer/shared/media/getArtworkUrl', () => ({ getArtworkUrl: () => null }))

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
  vi.useRealTimers()
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

function textContent(element: TestNode | undefined): string {
  return element?.text ?? element?.children.map(textContent).join('') ?? ''
}

function mountCard(sourceAlbum = album) {
  const highlighted = ref(false)
  const highlightRevision = ref(0)
  const open = vi.fn()
  const play = vi.fn()
  const openContextMenu = vi.fn()
  const container = node()
  const app = renderer.createApp({
    render: () =>
      h(AlbumCard, {
        album: sourceAlbum,
        highlighted: highlighted.value,
        highlightRevision: highlightRevision.value,
        onOpen: open,
        onPlay: play,
        onOpenContextMenu: openContextMenu,
      }),
  })
  app.directive('tooltip', {})
  app.mount(container)
  cleanups.push(() => app.unmount())
  return { root: container, open, play, openContextMenu, highlighted, highlightRevision }
}

describe('AlbumCard search hint', () => {
  it('replays a repeated match without remounting the cover and cancels on clear', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const card = mountCard()
    const cover = findByClass(card.root, 'cover-stage')!
    const first = { cancel: vi.fn(), onfinish: null }
    const second = { cancel: vi.fn(), onfinish: null }
    const animate = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    Object.assign(cover, { animate })
    card.highlighted.value = true
    card.highlightRevision.value++
    await nextTick()
    expect(animate).toHaveBeenCalledTimes(1)
    expect(animate.mock.calls[0]?.[1]).toEqual({ duration: 800, composite: 'add' })
    card.highlightRevision.value++
    await nextTick()
    expect(first.cancel).toHaveBeenCalledOnce()
    expect(animate).toHaveBeenCalledTimes(2)
    expect(findByClass(card.root, 'cover-stage')).toBe(cover)
    card.highlighted.value = false
    await nextTick()
    expect(second.cancel).toHaveBeenCalledOnce()
    expect(card.play).not.toHaveBeenCalled()
    expect(card.open).not.toHaveBeenCalled()
  })

  it('uses a temporary static outline for reduced motion and clears on unmount', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const card = mountCard()
    const cue = { cancel: vi.fn(), onfinish: null }
    const animate = vi.fn(() => cue)
    Object.assign(findByClass(card.root, 'cover-stage')!, { animate })
    card.highlighted.value = true
    await nextTick()
    const [frames] = animate.mock.calls[0] as unknown as [Keyframe[]]
    expect(frames[0]).toEqual(frames[1])
    cleanups.pop()?.()
    expect(cue.cancel).toHaveBeenCalledOnce()
  })
})

describe('AlbumCard play control', () => {
  it('updates album metadata while keeping the source identity and emitted album intact', async () => {
    vi.stubGlobal('localStorage', { setItem: vi.fn() })
    const source = Object.freeze({ ...album, title: '看着你', albumArtist: '萧敬腾; 郁可唯' })
    const card = mountCard(source)
    useChineseTextDisplay().setSongInfoScript('traditional')
    await nextTick()
    expect(textContent(findByClass(card.root, 'album-card-title'))).toBe('看著你')
    expect(textContent(findByClass(card.root, 'album-card-artist'))).toBe('蕭敬騰 & 鬱可唯')
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

describe('AlbumCard cover interaction', () => {
  it.each([
    { key: 'Enter', shiftKey: false },
    { key: ' ', shiftKey: false },
    { key: 'Enter', shiftKey: true },
  ])('opens details with $key (shift=$shiftKey)', (keys) => {
    const card = mountCard()
    const cover = findByClass(card.root, 'cover-stage')!
    const event = { ...keys, preventDefault: vi.fn(), repeat: false }
    ;(cover.props.onKeydown as (event: object) => void)(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(card.open).toHaveBeenCalledExactlyOnceWith(album)
    expect(card.play).not.toHaveBeenCalled()
  })

  it('ignores repeated activation and unrelated keys', () => {
    const card = mountCard()
    const keydown = findByClass(card.root, 'cover-stage')!.props.onKeydown as (
      event: object,
    ) => void
    const preventDefault = vi.fn()
    keydown({ key: 'Enter', repeat: true, preventDefault })
    keydown({ key: ' ', repeat: true, preventDefault })
    keydown({ key: 'ArrowRight', preventDefault })
    expect(preventDefault).toHaveBeenCalledTimes(2)
    expect(card.open).not.toHaveBeenCalled()
    expect(card.play).not.toHaveBeenCalled()
  })

  it('keeps a held cover as a normal click without feedback or delayed playback', async () => {
    vi.useFakeTimers()
    const card = mountCard()
    const cover = findByClass(card.root, 'cover-stage')!
    ;(cover.props.onPointerdown as ((event: object) => void) | undefined)?.({ button: 0 })
    await vi.advanceTimersByTimeAsync(1500)
    await nextTick()
    expect(cover.props.class).toBe('cover-stage')
    expect(cover.props['aria-description']).toBeUndefined()
    expect(card.open).not.toHaveBeenCalled()
    expect(card.play).not.toHaveBeenCalled()
    ;(cover.props.onClick as () => void)()
    expect(card.open).toHaveBeenCalledExactlyOnceWith(album)
    await vi.runAllTimersAsync()
    expect(card.play).not.toHaveBeenCalled()
  })

  it('opens the context menu from the cover without opening details or playing', () => {
    const card = mountCard()
    const event = { preventDefault: vi.fn() }
    ;(findByClass(card.root, 'cover-stage')!.props.onContextmenu as (event: object) => void)(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(card.openContextMenu).toHaveBeenCalledExactlyOnceWith(album, event)
    expect(card.open).not.toHaveBeenCalled()
    expect(card.play).not.toHaveBeenCalled()
  })
})
