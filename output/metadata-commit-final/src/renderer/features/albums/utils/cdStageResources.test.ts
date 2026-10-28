import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCdStageResources, type CdStartupPreparation } from './cdStageResources'
import { flushDecodes, installStageDOM, stageClock, TestElement } from './cdStageTestSupport'

vi.mock('@renderer/shared/animation/motion', async () => {
  const { stageClock } = await import('./cdStageTestSupport')
  return { animateFrames: stageClock.animateFrames }
})

afterEach(() => {
  stageClock.reset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function setup(count = 20) {
  const dom = installStageDOM()
  const removed = vi.fn()
  const resources = createCdStageResources(dom.stage, () => ({ width: 1200, height: 700 }), removed)
  const images: TestElement[] = []
  const decodes: Array<{ image: TestElement; resolve: () => void; reject: () => void }> = []
  vi.stubGlobal(
    'Image',
    class extends TestElement {
      constructor() {
        super()
        images.push(this)
      }
      decode(): Promise<void> {
        return new Promise((resolve, reject) => decodes.push({ image: this, resolve, reject }))
      }
    },
  )
  const albums = Array.from({ length: count }, (_, index) => ({
    key: String(index),
    artworkUrl: `cover:${index}`,
  }))
  resources.replaceAlbums(albums)
  return { ...dom, resources, images, decodes, albums, removed }
}

describe('CD stage resources', () => {
  it('decodes the opening first, uses two remaining lanes, and hands off after seven warm frames', async () => {
    const { resources, decodes, element } = setup()
    const ready = vi.fn<(preparation: CdStartupPreparation) => void>()
    resources.prepareStartup(ready)
    expect([...resources.values()]).toHaveLength(13)
    expect(decodes).toHaveLength(4)
    decodes.slice(0, 3).forEach((job) => job.resolve())
    await flushDecodes()
    expect(decodes).toHaveLength(4)
    decodes[3].resolve()
    await flushDecodes()
    expect(decodes).toHaveLength(6)
    decodes[4].resolve()
    await flushDecodes()
    expect(decodes).toHaveLength(7)
    for (let index = 5; index < 13; index++) {
      decodes[index].resolve()
      await flushDecodes()
    }
    expect(element.children).toHaveLength(14)
    stageClock.advance(6)
    expect(ready).not.toHaveBeenCalled()
    stageClock.advance(1)
    expect(element.children).toHaveLength(13)
    const preparation = ready.mock.calls[0][0]
    expect(preparation.pool.size).toBe(13)
    expect(preparation.count).toBe(20)
    expect(preparation.isCurrent()).toBe(true)
    resources.cancelPreparation()
    expect(preparation.isCurrent()).toBe(false)
    resources.dispose()
  })

  it('freezes timeout images until motion ends and ignores late decode/error results', async () => {
    vi.useFakeTimers()
    const { resources, images, decodes } = setup()
    resources.prepareStartup(vi.fn())
    vi.advanceTimersByTime(1199)
    expect(stageClock.running).toBe(false)
    vi.advanceTimersByTime(1)
    stageClock.advance(7)
    const released = [...images]
    decodes.forEach((job) => job.resolve())
    await flushDecodes()
    expect([...resources.values()].every((node) => node.art.children.length === 0)).toBe(true)
    expect(images).toHaveLength(13)
    resources.cancelPreparation()
    resources.retain([-2, -1, 0, 1])
    for (const index of [-2, -1, 0, 1]) resources.ensure(index, false)
    expect(images).toHaveLength(17)
    released.forEach((image) => image.dispatchEvent(new Event('error')))
    expect([...resources.values()].every((node) => node.art.children.length === 1)).toBe(true)
    resources.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['decoding', 'warming'] as const)(
    'invalidates %s on replacement and disposal',
    async (phase) => {
      vi.useFakeTimers()
      const { resources, element, decodes, albums } = setup()
      const ready = vi.fn()
      resources.prepareStartup(ready)
      if (phase === 'warming') {
        vi.advanceTimersByTime(1200)
        stageClock.advance(3)
      }
      resources.replaceAlbums(albums.slice(0, 1))
      const next = resources.ensure(0, false)
      decodes.forEach((job) => job.resolve())
      await flushDecodes()
      stageClock.advance(10)
      expect(element.children).toEqual([next.slot])
      expect(ready).not.toHaveBeenCalled()
      resources.replaceAlbums(albums)
      resources.prepareStartup(ready)
      if (phase === 'warming') vi.advanceTimersByTime(1200)
      resources.dispose()
      decodes.forEach((job) => job.reject())
      await flushDecodes()
      stageClock.advance(10)
      expect(ready).not.toHaveBeenCalled()
      expect(element.children).toHaveLength(0)
      expect(stageClock.running).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('releases interaction state before images/DOM and forgets removed hit targets', () => {
    const { resources, removed, element } = setup(4)
    const node = resources.ensure(0, false)
    const image = node.art.children[0] as unknown as TestElement
    removed.mockImplementation((removing) => {
      expect(removing).toBe(node)
      expect(element.children).toContain(node.slot)
      expect(image.src).toBe('cover:0')
    })
    resources.retain([])
    expect(removed).toHaveBeenCalledExactlyOnceWith(node)
    expect(image.src).toBe('')
    expect(resources.nodeFromTarget(node.disc)).toBeUndefined()
    expect(resources.get(0)).toBeUndefined()
    expect(element.children).toHaveLength(0)
    resources.dispose()
  })

  it('synchronizes album angles across nodes and retains only catalog keys across recycling', () => {
    const { resources, albums } = setup(4)
    const first = resources.ensure(0, false)
    const duplicate = resources.ensure(4, false)
    resources.setArtworkAngle(first, 123.5)
    expect(duplicate.art.style.transform).toBe('rotate(123.5deg)')
    resources.retain([])
    expect(resources.ensure(0, false).art.style.transform).toBe('rotate(123.5deg)')
    resources.replaceAlbums([...albums].reverse())
    expect(resources.ensure(3, false).art.style.transform).toBe('rotate(123.5deg)')
    resources.replaceAlbums([])
    resources.replaceAlbums(albums)
    expect(resources.getArtworkAngle(resources.ensure(0, false))).not.toBe(123.5)
    resources.setArtworkAngle(resources.get(0)!, 123.5)
    resources.dispose()
    resources.replaceAlbums(albums)
    expect(resources.getArtworkAngle(resources.ensure(0, false))).not.toBe(123.5)
    resources.dispose()
  })

  it('does not re-request absent or failed covers after preparation', async () => {
    const { resources, albums, images, decodes } = setup(2)
    resources.replaceAlbums([albums[0], { ...albums[1], artworkUrl: null }])
    resources.prepareStartup(vi.fn())
    decodes.forEach((job) => job.reject())
    await flushDecodes()
    stageClock.advance(7)
    resources.cancelPreparation()
    resources.ensure(0, false)
    resources.ensure(1, false)
    expect(images).toHaveLength(1)
    expect([...resources.values()].every((node) => node.art.children.length === 0)).toBe(true)
    resources.dispose()
  })
})
