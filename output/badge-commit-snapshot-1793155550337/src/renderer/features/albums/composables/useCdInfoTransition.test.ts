import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import type { CdAlbumInfo } from '../types/cdAlbumInfo'
import { useCdInfoTransition } from './useCdInfoTransition'

const motion = vi.hoisted(() => ({
  phases: [] as Array<{
    duration: number
    update: (progress: number) => void
    finish: () => void
    cancel: ReturnType<typeof vi.fn>
  }>,
}))
vi.mock('@renderer/shared/animation/motion', () => ({
  animateProgress: (duration: number, update: (progress: number) => void, finish: () => void) => {
    const cancel = vi.fn()
    motion.phases.push({ duration, update, finish, cancel })
    return cancel
  },
}))
function album(key: string): CdAlbumInfo {
  return {
    key,
    title: key,
    artist: 'Artist',
    releaseDate: null,
    copyright: null,
    tracks: [],
    trackCount: 0,
    artworkUrl: null,
    artworkCacheKey: null,
  }
}
function fixture() {
  const currentAlbum = shallowRef<CdAlbumInfo | null>(album('one'))
  let reduced = false
  let disposed = false
  const text = { style: { opacity: '1', transform: '' } }
  const row = {
    style: { height: '', overflow: '' },
    getBoundingClientRect: vi.fn(() => ({ height: 40 })),
  }
  let divider = '1'
  const panel = {
    style: {
      setProperty: (_key: string, value: string) => {
        divider = value
      },
      getPropertyValue: () => divider,
    },
    querySelector: () => text,
    querySelectorAll: (selector: string) => (selector.includes('title-row') ? [row] : [text]),
  }
  const infoRef = shallowRef<HTMLElement | null>(panel as unknown as HTMLElement)
  const session = useCdInfoTransition({
    currentAlbum,
    infoRef,
    reducedMotion: () => reduced,
    isDisposed: () => disposed,
  })
  return {
    ...session,
    currentAlbum,
    infoRef,
    text,
    row,
    divider: () => divider,
    reduce: () => {
      reduced = true
    },
    dispose: () => {
      disposed = true
    },
  }
}
async function tick() {
  for (let i = 0; i < 3; i++) await nextTick()
}
function finish(index: number) {
  motion.phases[index].update(1)
  motion.phases[index].finish()
}
beforeEach(() => {
  motion.phases.length = 0
})
describe('useCdInfoTransition', () => {
  it('uses the current album immediately on first display and reduced-motion changes', async () => {
    const f = fixture()
    expect(f.displayedAlbum.value).toBeNull()
    await f.transitionInfo(f.currentAlbum.value)
    expect(f.displayedAlbum.value).toBe(f.currentAlbum.value)
    f.reduce()
    f.currentAlbum.value = album('two')
    await f.transitionInfo(f.currentAlbum.value)
    expect(f.displayedAlbum.value?.key).toBe('two')
    expect(motion.phases).toHaveLength(0)
    expect(f.divider()).toBe('1')
  })
  it('fades entry for 240ms and clears its temporary styles on completion', async () => {
    const f = fixture()
    const entered = f.transitionInfo(f.currentAlbum.value, true)
    expect(f.text.style.opacity).toBe('0')
    expect(f.divider()).toBe('0')
    await tick()
    expect(motion.phases[0].duration).toBe(240)
    motion.phases[0].update(0.5)
    expect(f.text.style.opacity).toBe('0.5')
    finish(0)
    await entered
    expect(f.text.style.opacity).toBe('1')
    expect(f.row.style.height).toBe('')
    expect(f.divider()).toBe('1')
  })
  it('fades old text out before swapping and interpolates row height with the 200ms reveal', async () => {
    const f = fixture()
    f.settleInfo()
    f.currentAlbum.value = album('two')
    f.row.getBoundingClientRect.mockReturnValueOnce({ height: 20 })
    const changed = f.transitionInfo(f.currentAlbum.value)
    expect(f.displayedAlbum.value?.key).toBe('one')
    expect(motion.phases[0].duration).toBe(100)
    finish(0)
    await tick()
    expect(f.displayedAlbum.value?.key).toBe('two')
    expect(motion.phases[1].duration).toBe(200)
    expect(f.row.style.overflow).toBe('hidden')
    expect(f.row.style.height).toBe('20px')
    motion.phases[1].update(0.1)
    expect(f.text.style.opacity).toBe('0')
    motion.phases[1].update(0.5)
    expect(f.row.style.height).toBe('37.5px')
    finish(1)
    await changed
    expect(f.text.style.opacity).toBe('1')
    expect(f.row.style.overflow).toBe('')
  })
  it('settling cancels the active phase and prevents its old continuation from swapping text', async () => {
    const f = fixture()
    f.settleInfo()
    const changed = f.transitionInfo(album('stale'))
    f.currentAlbum.value = album('latest')
    f.settleInfo()
    await changed
    expect(motion.phases[0].cancel).toHaveBeenCalledOnce()
    expect(f.displayedAlbum.value?.key).toBe('latest')
    expect(motion.phases).toHaveLength(1)
  })
  it('a new transition cancels the previous phase and only publishes the latest target', async () => {
    const f = fixture()
    f.settleInfo()
    const old = f.transitionInfo(album('old'))
    const latest = f.transitionInfo(album('latest'))
    await old
    expect(motion.phases[0].cancel).toHaveBeenCalledOnce()
    finish(1)
    await tick()
    finish(2)
    await latest
    expect(f.displayedAlbum.value?.key).toBe('latest')
  })
  it('rapid browse cancels entry before nextTick and leaves publication to the page watch on release', async () => {
    const f = fixture()
    const entry = f.transitionInfo(f.currentAlbum.value, true)
    f.setRapidBrowse(true)
    await entry
    expect(motion.phases).toHaveLength(0)
    expect(f.infoSuppressed.value).toBe(true)
    f.setRapidBrowse(false)
    expect(f.infoSuppressed.value).toBe(false)
  })
  it('does not run the entry phase after disposal', async () => {
    const f = fixture()
    const entry = f.transitionInfo(f.currentAlbum.value, true)
    f.dispose()
    await entry
    expect(motion.phases).toHaveLength(0)
  })
  it('does not swap to the new album after disposal during fade-out', async () => {
    const f = fixture()
    f.settleInfo()
    const changed = f.transitionInfo(album('two'))
    f.dispose()
    finish(0)
    await changed
    expect(f.displayedAlbum.value?.key).toBe('one')
  })
  it('clears a missing album or panel without scheduling phases', async () => {
    const f = fixture()
    f.settleInfo()
    await f.transitionInfo(null)
    expect(f.displayedAlbum.value).toBeNull()
    f.infoRef.value = null
    await f.transitionInfo(album('two'))
    expect(f.displayedAlbum.value?.key).toBe('two')
    expect(motion.phases).toHaveLength(0)
  })
})
