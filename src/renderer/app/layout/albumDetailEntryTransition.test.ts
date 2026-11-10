import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  ShellTestElement,
  ShellTestRect,
  shellTestDocument as doc,
} from '@renderer/testUtils/rendererTestHost'
import { albumIdentityKey } from '@shared/utils/albumIdentity'
import { createAlbumDetailEntryTransition } from './albumDetailEntryTransition'
const motion = vi.hoisted(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}))
vi.mock('@renderer/shared/animation/motionPreference', () => ({
  createReducedMotionQuery: () => motion,
}))
const frames = new Map<number, FrameRequestCallback>()
let serial = 0
beforeEach(() => {
  doc.body.replaceChildren()
  motion.matches = false
  const events = new EventTarget()
  vi.stubGlobal(
    'document',
    Object.assign(doc, {
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    }),
  )
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('getComputedStyle', () => ({ borderRadius: '12px' }))
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(++serial, cb)
    return serial
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => {
  frames.clear()
  vi.unstubAllGlobals()
})
async function tick() {
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach((cb) => cb(0))
  for (let i = 0; i < 6; i++) await Promise.resolve()
}
function setup(images = true) {
  const root = new ShellTestElement()
  root.rect = new ShellTestRect(0, 0, 1000, 800)
  doc.body.append(root)
  const list = new ShellTestElement()
  const card = new ShellTestElement()
  card.className = 'album-card'
  card.setAttribute('data-album-key', albumIdentityKey('Artist', 'Album'))
  const cover = new ShellTestElement()
  cover.className = 'cover-stage'
  cover.rect = new ShellTestRect(50, 100, 120, 120)
  card.append(cover)
  list.append(card)
  root.append(list)
  const detail = new ShellTestElement()
  const hero = new ShellTestElement()
  hero.className = 'album-hero-cover'
  hero.rect = new ShellTestRect(100, 80, 300, 300)
  detail.append(hero)
  root.append(detail)
  if (images)
    for (const node of [cover, hero])
      node.append(Object.assign(new ShellTestElement('img'), { complete: true, naturalWidth: 500 }))
  const finished = vi.fn()
  const transition = createAlbumDetailEntryTransition({
    root: () => root as unknown as HTMLElement,
    started: vi.fn(),
    finished,
  })
  const albums = { name: 'albums', query: {} }
  const album = { name: 'album-detail', query: { artist: 'Artist', title: 'Album' } }
  return { root, list, detail, cover, hero, finished, transition, albums, album }
}
it.each([false, true])(
  'animates only the shared cover and cleans up (return %s)',
  async (reverse) => {
    const f = setup()
    const incoming = reverse ? f.list : f.detail
    const outgoing = reverse ? f.detail : f.list
    f.transition.prepare(reverse ? f.albums : f.album, reverse ? f.album : f.albums)
    const entered = vi.fn()
    const left = vi.fn()
    f.transition.beforeEnter(incoming as unknown as Element)
    f.transition.leave(outgoing as unknown as Element, left)
    f.transition.enter(incoming as unknown as Element, entered)
    await tick()
    expect(f.root.children).toHaveLength(3)
    const layer = f.root.children[2]
    const picture = layer.children[0]
    expect(picture.animations[0].options).toMatchObject({ duration: reverse ? 200 : 240 })
    expect(incoming.animations[0].options).toMatchObject({ duration: reverse ? 160 : 180 })
    expect(picture.animations[0].keyframes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ transform: expect.stringContaining('scale(') }),
      ]),
    )
    picture.animations[0].finish()
    incoming.animations[0].finish()
    outgoing.animations[0].finish()
    await tick()
    expect(entered).toHaveBeenCalledOnce()
    expect(left).toHaveBeenCalledOnce()
    expect(f.finished).toHaveBeenCalledOnce()
    expect(f.root.children).toHaveLength(2)
    expect(f.hero.children[0].style.visibility).not.toBe('hidden')
    f.transition.cancel()
    expect(entered).toHaveBeenCalledOnce()
  },
)
it.each(['missing', 'reduced', 'offscreen'])('uses a short fade for %s', async (condition) => {
  const f = setup(condition !== 'missing')
  motion.matches = condition === 'reduced'
  if (condition === 'offscreen') f.cover.rect = new ShellTestRect(-200, 0, 120, 120)
  f.transition.prepare(f.album, f.albums)
  const done = vi.fn()
  f.transition.beforeEnter(f.detail as unknown as Element)
  f.transition.enter(f.detail as unknown as Element, done)
  await tick()
  expect(f.root.children).toHaveLength(2)
  expect(f.detail.animations[0].options).toMatchObject({ duration: 120, delay: 0 })
  f.transition.cancel()
  expect(done).toHaveBeenCalledOnce()
  expect(f.detail.style.opacity).not.toBe('0')
})
it('settles callbacks once when superseded before the next frame', async () => {
  const f = setup()
  f.transition.prepare(f.album, f.albums)
  const done = vi.fn()
  f.transition.beforeEnter(f.detail as unknown as Element)
  f.transition.enter(f.detail as unknown as Element, done)
  f.transition.prepare(f.albums, f.album)
  await tick()
  expect(done).toHaveBeenCalledOnce()
  expect(f.detail.style.opacity).not.toBe('0')
  expect(f.root.children).toHaveLength(2)
})

it('finishes on resize and ignores late animation completion', async () => {
  const f = setup()
  f.transition.prepare(f.album, f.albums)
  const done = vi.fn()
  f.transition.beforeEnter(f.detail as unknown as Element)
  f.transition.enter(f.detail as unknown as Element, done)
  await tick()
  window.dispatchEvent(new Event('resize'))
  expect(done).toHaveBeenCalledOnce()
  expect(f.root.children).toHaveLength(2)
  for (const animation of f.detail.animations) animation.finish()
  await tick()
  expect(done).toHaveBeenCalledOnce()
})

it('falls back when a cover is clipped by its scrolling viewport', async () => {
  const f = setup()
  f.list.className = 'albums-scroll'
  f.list.rect = new ShellTestRect(0, 0, 1000, 100)
  f.transition.prepare(f.album, f.albums)
  f.transition.enter(f.detail as unknown as Element, vi.fn())
  await tick()
  expect(f.root.children).toHaveLength(2)
  expect(f.detail.animations[0].options).toMatchObject({ duration: 120 })
  f.transition.cancel()
})

it('carries the matching recommendation cover into the next detail page', async () => {
  const f = setup()
  const card = new ShellTestElement()
  card.className = 'album-more-gallery-card'
  card.setAttribute('data-album-key', albumIdentityKey('Other', 'Next'))
  const cover = new ShellTestElement()
  cover.className = 'album-more-gallery-cover'
  cover.rect = new ShellTestRect(200, 300, 150, 150)
  cover.append(Object.assign(new ShellTestElement('img'), { complete: true, naturalWidth: 500 }))
  card.append(cover)
  f.detail.append(card)
  const next = new ShellTestElement()
  const hero = new ShellTestElement()
  hero.className = 'album-hero-cover'
  hero.rect = new ShellTestRect(100, 80, 300, 300)
  hero.append(Object.assign(new ShellTestElement('img'), { complete: true, naturalWidth: 500 }))
  next.append(hero)
  f.root.append(next)
  const target = { name: 'album-detail', query: { artist: 'Other', title: 'Next' } }
  f.transition.prepare(target, f.album)
  f.transition.beforeEnter(next as unknown as Element)
  f.transition.leave(f.detail as unknown as Element, vi.fn())
  const done = vi.fn()
  f.transition.enter(next as unknown as Element, done)
  await tick()
  const overlay = f.root.children[3]
  expect(overlay.children[0].animations[0].options).toMatchObject({ duration: 240 })
  expect(cover.children[0].style.visibility).toBe('hidden')
  f.transition.cancel()
  expect(done).toHaveBeenCalledOnce()
  expect(cover.children[0].style.visibility).not.toBe('hidden')
})

it('uses the short fade for an ambiguous recommendation source', async () => {
  const f = setup()
  for (let i = 0; i < 2; i++) {
    const card = new ShellTestElement()
    card.className = 'album-more-gallery-card'
    card.setAttribute('data-album-key', albumIdentityKey('Other', 'Next'))
    const cover = new ShellTestElement()
    cover.className = 'album-more-gallery-cover'
    cover.rect = new ShellTestRect(200, 300, 150, 150)
    cover.append(Object.assign(new ShellTestElement('img'), { complete: true, naturalWidth: 500 }))
    card.append(cover)
    f.detail.append(card)
  }
  f.transition.prepare({ name: 'album-detail', query: { artist: 'Other', title: 'Next' } }, f.album)
  f.transition.enter(f.detail as unknown as Element, vi.fn())
  await tick()
  expect(f.root.children).toHaveLength(2)
  expect(f.detail.animations[0].options).toMatchObject({ duration: 120 })
  f.transition.cancel()
})

it.each(['missing', 'offscreen'] as const)(
  'uses the short fade for a %s recommendation cover',
  async (condition) => {
    const f = setup()
    const card = new ShellTestElement()
    card.className = 'album-more-gallery-card'
    card.setAttribute('data-album-key', albumIdentityKey('Other', 'Next'))
    const cover = new ShellTestElement()
    cover.className = 'album-more-gallery-cover'
    cover.rect = new ShellTestRect(condition === 'offscreen' ? 1100 : 200, 300, 150, 150)
    if (condition !== 'missing')
      cover.append(
        Object.assign(new ShellTestElement('img'), { complete: true, naturalWidth: 500 }),
      )
    card.append(cover)
    f.detail.append(card)
    f.transition.prepare(
      { name: 'album-detail', query: { artist: 'Other', title: 'Next' } },
      f.album,
    )
    f.transition.enter(f.detail as unknown as Element, vi.fn())
    await tick()
    expect(f.root.children).toHaveLength(2)
    expect(f.detail.animations[0].options).toMatchObject({ duration: 120 })
    f.transition.cancel()
  },
)
it('retains the outgoing palette and restores only its temporary values', () => {
  const f = setup()
  vi.stubGlobal('getComputedStyle', () => ({
    borderRadius: '12px',
    backgroundColor: 'rgb(20, 20, 20)',
    getPropertyValue: () => 'white',
  }))
  f.transition.prepare(f.album, f.albums)
  f.transition.leave(f.list as unknown as Element, vi.fn())
  expect(f.list.style.getPropertyValue('--auralis-text')).toBe('white')
  expect(f.list.style.getPropertyValue('background-color')).toBe('rgb(20, 20, 20)')
  f.list.style.setProperty('--unrelated', 'preserved')
  f.transition.cancel()
  expect(f.list.style.getPropertyValue('--auralis-text')).toBe('')
  expect(f.list.style.getPropertyValue('--unrelated')).toBe('preserved')
})
it('settles and unsubscribes when the native window is hidden', async () => {
  let visibility!: (state: { isVisible: boolean }) => void
  const unsubscribe = vi.fn()
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      auralis: {
        window: {
          getVisibility: () => new Promise(() => {}),
          onVisibilityChanged: (callback: typeof visibility) => {
            visibility = callback
            return unsubscribe
          },
        },
      },
    }),
  )
  const f = setup()
  const done = vi.fn()
  f.transition.prepare(f.album, f.albums)
  f.transition.enter(f.detail as unknown as Element, done)
  await tick()
  visibility({ isVisible: false })
  expect(done).toHaveBeenCalledOnce()
  expect(unsubscribe).toHaveBeenCalledOnce()
  expect(f.root.children).toHaveLength(2)
})
it('restores the page if the animation API fails', async () => {
  const f = setup(false)
  const done = vi.fn()
  f.detail.animate = () => {
    throw new Error('unavailable')
  }
  f.transition.prepare(f.album, f.albums)
  f.transition.beforeEnter(f.detail as unknown as Element)
  f.transition.enter(f.detail as unknown as Element, done)
  await tick()
  expect(done).toHaveBeenCalledOnce()
  expect(f.detail.style.opacity).not.toBe('0')
})
