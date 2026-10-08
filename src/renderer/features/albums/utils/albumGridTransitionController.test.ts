import { describe, expect, it } from 'vitest'
import {
  createAlbumGridTransitionController,
  type AlbumGridTransitionLayerHost,
  type AlbumTransitionItemOptions,
  type AlbumTransitionRect,
  type AlbumTransitionTarget,
  type AlbumTransitionVisual,
} from './albumGridTransitionController'

interface FakeSnapshot {
  name: string
  cloneNode(deep?: boolean): FakeSnapshot
}

interface FakeWrapper {
  key: string
  side: 'from' | 'to'
  snapshot: FakeSnapshot
  rect: AlbumTransitionRect
  localLeft: number
  localTop: number
  opacity: number
  transform: string
  connected: boolean
  writes: number
}

function rect(left: number, top: number, width = 100, height = 100): AlbumTransitionRect {
  return { left, top, width, height }
}

function snapshot(name: string, counts: { clones: number }): FakeSnapshot {
  return {
    name,
    cloneNode() {
      counts.clones += 1
      return snapshot(`${name}-copy`, counts)
    },
  }
}

function visual(
  key: string,
  position: AlbumTransitionRect,
  counts: { clones: number },
): AlbumTransitionVisual {
  return {
    key,
    node: snapshot(key, counts) as unknown as HTMLElement,
    rect: position,
    opacity: 1,
  }
}

function target(
  key: string,
  position: AlbumTransitionRect,
  counts: { clones: number },
): AlbumTransitionTarget {
  return {
    key,
    node: snapshot(key, counts) as unknown as HTMLElement,
    rect: position,
  }
}

function createHost() {
  const counts = {
    clones: 0,
    wrappers: 0,
    appends: 0,
    captures: 0,
    positions: 0,
    rootWrites: 0,
    itemWrites: 0,
    detachedWrites: 0,
  }
  let origin = { left: 0, top: 0 }
  let current: FakeWrapper[] = []
  let visible = false
  let failNextItem = false

  const toWrapper = (item: HTMLElement): FakeWrapper => item as unknown as FakeWrapper
  const host: AlbumGridTransitionLayerHost = {
    reset() {
      current.forEach((item) => (item.connected = false))
      current = []
      visible = false
    },
    setBounds(bounds) {
      origin = { left: bounds.left, top: bounds.top }
      visible = true
    },
    createItem(options: AlbumTransitionItemOptions, itemOrigin) {
      if (failNextItem) {
        failNextItem = false
        throw new Error('fake snapshot failure')
      }
      counts.wrappers += 1
      const source = options.node as unknown as FakeSnapshot
      const wrapper: FakeWrapper = {
        key: options.key,
        side: options.side,
        snapshot: options.snapshotOwned ? source : source.cloneNode(true),
        rect: options.rect,
        localLeft: options.rect.left - itemOrigin.left,
        localTop: options.rect.top - itemOrigin.top,
        opacity: options.opacity,
        transform: 'translate3d(0, 0, 0)',
        connected: false,
        writes: 0,
      }
      return wrapper as unknown as HTMLElement
    },
    appendItem(item) {
      const wrapper = toWrapper(item)
      wrapper.connected = true
      current.push(wrapper)
      counts.appends += 1
    },
    setItemPosition(item, left, top) {
      const wrapper = toWrapper(item)
      wrapper.localLeft = left
      wrapper.localTop = top
      counts.positions += 1
    },
    renderViewport() {
      counts.rootWrites += 1
    },
    renderItem(item, transform, opacity) {
      const wrapper = toWrapper(item)
      wrapper.transform = transform
      wrapper.opacity = opacity
      wrapper.writes += 1
      if (wrapper.connected) counts.itemWrites += 1
      else counts.detachedWrites += 1
    },
    captureItem(item) {
      const wrapper = toWrapper(item)
      counts.captures += 1
      const values = wrapper.transform.match(
        /translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) scale\(([-\d.]+)\)/u,
      )
      const dx = values ? Number(values[1]) : 0
      const dy = values ? Number(values[2]) : 0
      const scale = values ? Number(values[3]) : 1
      return {
        key: wrapper.key,
        node: wrapper.snapshot as unknown as HTMLElement,
        rect: {
          left: origin.left + wrapper.localLeft + dx,
          top: origin.top + wrapper.localTop + dy,
          width: wrapper.rect.width * scale,
          height: wrapper.rect.height * scale,
        },
        opacity: wrapper.opacity,
        snapshotOwned: true,
      }
    },
    isConnected(item) {
      return toWrapper(item).connected
    },
  }

  return {
    host,
    counts,
    get current() {
      return current
    },
    get visible() {
      return visible
    },
    failNextCreate() {
      failNextItem = true
    },
  }
}

describe('album grid transition controller', () => {
  it('replaces stale registered items and only updates current wrappers', () => {
    const fake = createHost()
    const controller = createAlbumGridTransitionController(fake.host)
    const viewport = rect(0, 0, 400, 300)
    const oldSources = ['old-a', 'old-b', 'old-c'].map((key, index) =>
      visual(key, rect(index * 110, 0), fake.counts),
    )

    controller.prepareSources(viewport, oldSources)
    expect(controller.getItemStats()).toEqual({ registeredItems: 3, connectedItems: 3 })
    const oldWrappers = [...fake.current]
    const oldWriteCounts = oldWrappers.map((item) => item.writes)

    controller.prepareSources(
      viewport,
      ['new-a', 'new-b', 'new-c', 'new-d'].map((key, index) =>
        visual(key, rect(index * 90, 0), fake.counts),
      ),
    )
    expect(controller.getItemStats()).toEqual({ registeredItems: 4, connectedItems: 4 })
    expect(oldWrappers.every((item) => !item.connected)).toBe(true)

    controller.renderProgress(0.5)
    expect(oldWrappers.map((item) => item.writes)).toEqual(oldWriteCounts)
    expect(fake.counts.detachedWrites).toBe(0)

    for (const count of [2, 3, 4, 1, 5]) {
      controller.prepareSources(
        viewport,
        Array.from({ length: count }, (_, index) =>
          visual(`repeat-${count}-${index}`, rect(index * 80, 0), fake.counts),
        ),
      )
      expect(controller.getItemStats()).toEqual({
        registeredItems: count,
        connectedItems: count,
      })
    }

    controller.clear()
    controller.clear()
    expect(controller.getItemStats()).toEqual({ registeredItems: 0, connectedItems: 0 })
    expect(fake.current).toHaveLength(0)
    expect(fake.visible).toBe(false)
  })

  it('reuses outgoing snapshots and prepares the complete target layout once', () => {
    const fake = createHost()
    const controller = createAlbumGridTransitionController(fake.host)
    const viewport = rect(0, 0, 400, 300)
    controller.prepareSources(viewport, [
      visual('a', rect(0, 0), fake.counts),
      visual('b', rect(110, 0), fake.counts),
      visual('c', rect(220, 0), fake.counts),
    ])
    const sources = new Map(fake.current.map((item) => [item.key, item]))
    expect(fake.counts.clones).toBe(3)
    const beforeRender = { ...fake.counts }

    controller.commitTargets(viewport, [
      target('b', rect(0, 110), fake.counts),
      target('c', rect(110, 110), fake.counts),
      target('d', rect(220, 110), fake.counts),
    ])
    const committed = new Map(
      fake.current.filter((item) => item.side === 'from').map((item) => [item.key, item]),
    )
    expect(committed.get('a')).toBe(sources.get('a'))
    expect(committed.get('b')).toBe(sources.get('b'))
    expect(committed.get('c')).toBe(sources.get('c'))
    expect(fake.counts.clones).toBe(6)
    expect(controller.getItemStats()).toEqual({ registeredItems: 6, connectedItems: 6 })

    const beforeFrames = { ...fake.counts }
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) controller.renderProgress(progress)
    expect(fake.counts.clones).toBe(beforeFrames.clones)
    expect(fake.counts.wrappers).toBe(beforeFrames.wrappers)
    expect(fake.counts.appends).toBe(beforeFrames.appends)
    expect(fake.counts.captures).toBe(beforeFrames.captures)
    expect(fake.counts.positions).toBe(beforeFrames.positions)
    expect(fake.counts.rootWrites).toBeGreaterThan(beforeRender.rootWrites)
  })

  it('fades both complete layouts while keeping every card at its original size and position', () => {
    const fake = createHost()
    const controller = createAlbumGridTransitionController(fake.host)
    const viewport = rect(0, 0, 400, 300)
    controller.prepareSources(viewport, [
      visual('a', rect(0, 0), fake.counts),
      visual('b', rect(110, 0), fake.counts),
      visual('old', rect(220, 0), fake.counts),
    ])
    controller.commitTargets(viewport, [
      target('b', rect(0, 110), fake.counts),
      target('a', rect(110, 110), fake.counts),
      target('new', rect(220, 110), fake.counts),
    ])

    controller.renderProgress(0.5)
    const byKey = new Map(fake.current.map((item) => [item.key, item]))
    expect(fake.current).toHaveLength(6)
    expect(byKey.get('a')?.opacity).toBeCloseTo(0.15 / 0.65)
    expect(byKey.get('b')?.opacity).toBeCloseTo(0.15 / 0.65)
    expect(byKey.get('old')?.opacity).toBe(0)
    expect(byKey.get('new')?.opacity).toBeCloseTo(0.15 / 0.65)
    expect(fake.current.every((item) => item.transform === 'translate3d(0, 0, 0)')).toBe(true)
  })

  it('keeps a source at the same screen position when the union origin changes', () => {
    const fake = createHost()
    const controller = createAlbumGridTransitionController(fake.host)
    controller.prepareSources(rect(100, 40, 300, 240), [visual('a', rect(150, 70), fake.counts)])
    const source = fake.current[0]
    expect(fake.current[0].localLeft + 100).toBe(150)
    expect(fake.current[0].localTop + 40).toBe(70)

    controller.commitTargets(rect(0, 0, 400, 300), [target('a', rect(200, 100), fake.counts)])
    expect(source.localLeft + 0).toBe(150)
    expect(source.localTop + 0).toBe(70)
    controller.renderProgress(0)
    expect(fake.current[0].localLeft).toBe(150)
    expect(fake.current[0].localTop).toBe(70)
  })

  it('captures current visible nodes for a reverse without cloning or duplicate keys', () => {
    const fake = createHost()
    const controller = createAlbumGridTransitionController(fake.host)
    const viewport = rect(0, 0, 400, 300)
    controller.prepareSources(viewport, [visual('a', rect(0, 0), fake.counts)])
    controller.commitTargets(viewport, [
      target('a', rect(100, 100), fake.counts),
      target('b', rect(200, 100), fake.counts),
    ])
    controller.renderProgress(0.5)
    const captured = controller.captureVisuals()
    const cloneCount = fake.counts.clones
    const oldWrappers = [...fake.current]

    controller.prepareSources(controller.captureViewport(), captured)

    expect(controller.getItemStats()).toEqual({ registeredItems: 2, connectedItems: 2 })
    expect(new Set(fake.current.map((item) => item.key)).size).toBe(2)
    expect(fake.counts.clones).toBe(cloneCount)
    expect(fake.current.map((item) => item.snapshot)).toEqual(captured.map((item) => item.node))
    expect(oldWrappers.every((item) => !item.connected)).toBe(true)
    controller.renderProgress(0.5)
    expect(fake.counts.detachedWrites).toBe(0)
  })

  it('clears partial setup if snapshot creation fails', () => {
    const fake = createHost()
    const controller = createAlbumGridTransitionController(fake.host)
    controller.prepareSources(rect(0, 0, 400, 300), [visual('a', rect(0, 0), fake.counts)])
    fake.failNextCreate()

    expect(() =>
      controller.commitTargets(rect(0, 0, 400, 300), [target('b', rect(100, 0), fake.counts)]),
    ).toThrow('fake snapshot failure')
    expect(controller.getItemStats()).toEqual({ registeredItems: 0, connectedItems: 0 })
    expect(fake.current).toHaveLength(0)
    expect(fake.visible).toBe(false)
  })

  it('handles empty source and target sets without leaving a visible root', () => {
    const fake = createHost()
    const controller = createAlbumGridTransitionController(fake.host)
    const viewport = rect(0, 0, 400, 300)

    controller.prepareSources(viewport, [])
    controller.commitTargets(viewport, [])
    controller.renderProgress(0.5)
    expect(controller.getItemStats()).toEqual({ registeredItems: 0, connectedItems: 0 })

    controller.clear()
    expect(fake.current).toHaveLength(0)
    expect(fake.visible).toBe(false)
  })
})
