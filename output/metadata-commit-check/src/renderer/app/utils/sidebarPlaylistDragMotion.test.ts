import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import type { MotionQuery } from '@renderer/shared/animation/motionPreference'
import { createSidebarPlaylistDragMotion } from './sidebarPlaylistDragMotion'

class ElementStub {
  dataset: Record<string, string> = {}
  style = { transform: '', transition: '', setProperty: vi.fn() }
  children: ElementStub[] = []
  parent: ElementStub | null = null
  hidden = false
  inert = false
  className = ''
  tabIndex = 0
  scrollTop = 0
  clientHeight = 300
  scrollHeight = 300
  rect = { top: 0, left: 10, width: 200, height: 38 }
  rail = false
  attributes = new Map<string, string>()
  classList = { add: vi.fn(), remove: vi.fn() }
  getBoundingClientRect = vi.fn(() => ({
    ...this.rect,
    right: this.rect.left + this.rect.width,
    bottom: this.rect.top + this.rect.height,
    x: this.rect.left,
    y: this.rect.top,
    toJSON: () => ({}),
  }))
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name)
    if (name === 'data-sidebar-playlist-key') delete this.dataset.sidebarPlaylistKey
  }
  append(...elements: ElementStub[]): void {
    for (const element of elements) {
      element.parent = this
      this.children.push(element)
    }
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this)
  }
  closest(): ElementStub | null {
    return this.rail ? this : null
  }
  querySelectorAll(selector: string): ElementStub[] {
    return selector === '*'
      ? this.children
      : this.children.filter((child) => child.dataset.sidebarPlaylistKey)
  }
  cloneNode(): ElementStub {
    const clone = new ElementStub()
    clone.dataset = { ...this.dataset }
    clone.rail = this.rail
    return clone
  }
  animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }))
}

describe('sidebar playlist drag motion', () => {
  let body: ElementStub
  let frames: Map<number, FrameRequestCallback>
  let sequence: number
  const motions: Array<ReturnType<typeof createSidebarPlaylistDragMotion>> = []

  beforeEach(() => {
    body = new ElementStub()
    frames = new Map()
    sequence = 0
    vi.stubGlobal('document', { createElement: () => new ElementStub(), body })
    vi.stubGlobal('getComputedStyle', () => ({
      padding: '0 12px',
      font: '14px sans-serif',
      color: 'black',
      [Symbol.iterator]: function* () {},
    }))
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++sequence, callback)
      return sequence
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  })

  afterEach(() => {
    for (const motion of motions.splice(0)) motion.dispose()
    vi.unstubAllGlobals()
  })

  function frame(time: number): void {
    const callbacks = [...frames.values()]
    frames.clear()
    for (const callback of callbacks) callback(time)
  }

  function fixture(count = 3, reduced = false, rail = false) {
    const viewport = new ElementStub()
    viewport.rect = { top: 0, left: 0, width: 220, height: 300 }
    viewport.scrollHeight = count * 44 + 70
    const list = new ElementStub()
    const stride = rail ? 52 : 44
    const rows = Array.from({ length: count }, (_, index) => {
      const row = new ElementStub()
      row.dataset.sidebarPlaylistKey = `playlist:${index + 1}`
      row.rect.top = 70 + stride * index
      row.rect.height = rail ? 42 : 38
      row.rail = rail
      return row
    })
    list.append(...rows)
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    const preference = {
      matches: reduced,
      addEventListener: (_type: 'change', listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener)
      },
      removeEventListener: (_type: 'change', listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener)
      },
    }
    const onTarget = vi.fn()
    const motion = createSidebarPlaylistDragMotion({
      scrollContainer: shallowRef(viewport as unknown as HTMLElement),
      playlistContainer: shallowRef(list as unknown as HTMLElement),
      preference: preference as MotionQuery,
      onTarget,
    })
    motions.push(motion)
    const point = (x: number, y: number) => ({ clientX: x, clientY: y }) as PointerEvent
    return { motion, rows, list, viewport, onTarget, preference, listeners, point }
  }

  it('keeps the preview aligned to the column, shifts rows and leaves the DOM order intact', () => {
    const f = fixture()
    expect(f.motion.begin('playlist:1', f.point(100, 89))).toBe(true)
    f.motion.update(f.point(160, 188))
    frame(16)
    expect(f.onTarget).toHaveBeenLastCalledWith({ key: 'playlist:3', position: 'after' })
    expect(f.rows[1].style.transform).toBe('translate3d(0, -44px, 0)')
    expect(f.rows[2].style.transform).toBe('translate3d(0, -44px, 0)')
    expect(f.list.children).toEqual(f.rows)
    const layer = body.children[0]
    expect(layer.inert).toBe(true)
    expect(layer.attributes.get('aria-hidden')).toBe('true')
    const [marker, preview] = layer.children
    expect(marker.hidden).toBe(false)
    expect(preview.dataset.sidebarPlaylistKey).toBeUndefined()
    expect(preview.tabIndex).toBe(-1)
    expect(preview.style.transform).toBe('translate3d(0, 169px, 0)')
    f.motion.flush(f.point(500, 188))
    expect(f.onTarget).toHaveBeenLastCalledWith(null)
    expect(marker.hidden).toBe(true)
    expect(f.rows[1].style.transform).toBe('translate3d(0, 0px, 0)')
  })

  it('does not remeasure 600 rows while following and coalesces pointer events', () => {
    const f = fixture(600)
    f.motion.begin('playlist:1', f.point(100, 89))
    for (let i = 0; i < 72; i += 1) f.motion.update(f.point(110 + (i % 3), 190))
    expect(frames.size).toBe(1)
    frame(16)
    for (let i = 0; i < 30; i += 1) {
      f.motion.update(f.point(100, 190))
      frame(32 + i * 16)
    }
    expect(f.rows.every((row) => row.getBoundingClientRect.mock.calls.length === 1)).toBe(true)
    expect(frames.size).toBe(0)
    expect(f.motion.flush(f.point(100, 90))).toBeNull()
  })

  it('scrolls at the edge and stops when the pointer leaves or the gesture ends', () => {
    const f = fixture(120)
    f.motion.begin('playlist:1', f.point(100, 89))
    f.motion.update(f.point(100, 294))
    for (let i = 0; i <= 60; i += 1) frame(i * 16)
    expect(f.viewport.scrollTop).toBeGreaterThan(400)
    expect(f.viewport.scrollTop).toBeLessThanOrEqual(600)
    expect(f.onTarget.mock.calls.some((call) => call[0]?.key !== 'playlist:1')).toBe(true)
    f.motion.update(f.point(500, 294))
    frame(1000)
    const stopped = f.viewport.scrollTop
    expect(frames.size).toBe(0)
    frame(1100)
    expect(f.viewport.scrollTop).toBe(stopped)
    f.motion.clear()
    expect(body.children).toHaveLength(0)
    expect(frames.size).toBe(0)
    expect(f.rows.every((row) => row.style.transform === '')).toBe(true)
  })

  it('rejects headers, outside releases and nonexistent source rows', () => {
    const f = fixture()
    expect(f.motion.begin('playlist:99', f.point(100, 89))).toBe(false)
    f.motion.begin('playlist:1', f.point(100, 89))
    expect(f.motion.flush(f.point(100, 10))).toBeNull()
    expect(f.motion.flush(f.point(100, 301))).toBeNull()
    expect(f.motion.flush(f.point(219, 180))).toBeNull()
  })

  it('uses the actual collapsed row stride and disables transitions under reduced motion', async () => {
    const f = fixture(3, true, true)
    f.motion.begin('playlist:1', f.point(100, 91))
    f.motion.flush(f.point(100, 210))
    expect(f.rows[1].style.transform).toBe('translate3d(0, -52px, 0)')
    expect(f.rows[1].style.transition).toBe('none')
    const preview = body.children[0].children[1]
    expect(preview.classList.add).toHaveBeenCalledWith('sidebar-playlist-drag-preview--rail')
    await f.motion.finish(false)
    expect(preview.animate).not.toHaveBeenCalled()
    expect(body.children).toHaveLength(0)
  })

  it('lands on the committed geometry and cleans every temporary transform', async () => {
    const f = fixture()
    f.motion.begin('playlist:1', f.point(100, 89))
    f.motion.flush(f.point(100, 188))
    const preview = body.children[0].children[1]
    f.rows[0].rect.top = 158
    f.rows[1].rect.top = 70
    f.rows[2].rect.top = 114
    await f.motion.finish(true)
    expect(preview.animate).toHaveBeenCalledWith(
      [{ transform: 'translate3d(0, 169px, 0)' }, { transform: 'translate3d(0, 158px, 0)' }],
      { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    )
    expect(f.rows.every((row) => row.style.transform === '')).toBe(true)
    expect(body.children).toHaveLength(0)
  })

  it('does not let an old settling promise clear a new gesture', async () => {
    const f = fixture()
    f.motion.begin('playlist:1', f.point(100, 89))
    const old = f.motion.finish(true)
    f.motion.begin('playlist:2', f.point(100, 133))
    await old
    expect(body.children).toHaveLength(1)
    f.motion.update(f.point(100, 188))
    frame(16)
    expect(f.onTarget).toHaveBeenLastCalledWith({ key: 'playlist:3', position: 'after' })
  })

  it('animates keyboard moves only for the two changed rows and obeys preference changes', async () => {
    const f = fixture(600)
    const moving = f.motion.reorderWithKeyboard(['playlist:1', 'playlist:2'], () => {
      f.rows[0].rect.top = 114
      f.rows[1].rect.top = 70
    })
    await nextTick()
    await moving
    expect(f.rows[0].animate).toHaveBeenCalledTimes(1)
    expect(f.rows[1].animate).toHaveBeenCalledTimes(1)
    expect(f.rows.slice(2).every((row) => row.animate.mock.calls.length === 0)).toBe(true)
    f.motion.begin('playlist:1', f.point(100, 133))
    f.motion.flush(f.point(100, 188))
    f.preference.matches = true
    for (const listener of f.listeners) listener({ matches: true } as MediaQueryListEvent)
    expect(f.rows[2].style.transition).toBe('none')
    await f.motion.finish(false)
    expect(body.children).toHaveLength(0)
  })
})
