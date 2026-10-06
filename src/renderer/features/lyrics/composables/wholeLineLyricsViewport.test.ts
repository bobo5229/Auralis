import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWholeLineLyricsViewport } from './wholeLineLyricsViewport'

class Style {
  height = ''
  transform = ''
  visibility = ''
  fontSize = ''
  readonly custom = new Map<string, string>()
  setProperty(name: string, value: string) {
    this.custom.set(name, value)
  }
  removeProperty(name: string) {
    if (name === 'height') this.height = ''
    if (name === 'transform') this.transform = ''
    if (name === 'visibility') this.visibility = ''
    if (name === 'font-size') this.fontSize = ''
    this.custom.delete(name)
  }
}

interface TestNode {
  style: Style
  dataset: { lyricIndex: string }
  offsetHeight: number
  children: TestNode[]
  getBoundingClientRect: () => {
    top: number
    bottom: number
    height: number
    width: number
    left: number
    right: number
  }
  querySelector: (selector: string) => TestNode | null
  querySelectorAll: () => TestNode[]
  setAttribute: (name: string, value: string) => void
  removeAttribute: (name: string) => void
  animate: (frames: Keyframe[], timing: KeyframeAnimationOptions) => Animation
}

function setup(firstIndex = 0) {
  const active = ref(-1)
  const reduced = ref(false)
  const nodes: TestNode[] = []
  const materials: TestNode[] = []
  const runs: {
    element: TestNode
    frames: Keyframe[]
    duration: number
    finish: () => void
    cancel: ReturnType<typeof vi.fn>
  }[] = []
  const trackStyle = new Style()
  const trackY = () => Number(/translate3d\(0, ([\d.-]+)px/.exec(trackStyle.transform)?.[1] ?? 0)
  const scale = (value: string) => Number(/scale\(([\d.-]+)\)/.exec(value)?.[1] ?? 1)
  const make = (index: number, material = false): TestNode => {
    const node: TestNode = {
      style: new Style(),
      dataset: { lyricIndex: String(firstIndex + index) },
      offsetHeight: 48,
      children: [],
      getBoundingClientRect: () => {
        const top =
          20 +
          trackY() +
          nodes
            .slice(0, index)
            .reduce((sum, row) => sum + (parseFloat(row.style.height) || 48) + 10, 0)
        const height = material
          ? 48 * scale(node.style.transform)
          : parseFloat(node.style.height) || 48
        return { top, bottom: top + height, height, width: 200, left: 300, right: 500 }
      },
      querySelector: (selector) =>
        selector.includes('-material')
          ? materials[index]
          : selector.includes('-fill')
            ? materials[index].children[1]
            : null,
      querySelectorAll: () => [],
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      animate: (frames, timing) => {
        let finish!: () => void
        let reject!: (error: Error) => void
        const finished = new Promise<void>((resolve, fail) => {
          finish = resolve
          reject = fail
        })
        const cancel = vi.fn(() => reject(new Error('cancelled')))
        runs.push({ element: node, frames, duration: Number(timing.duration), finish, cancel })
        return { finished, cancel } as unknown as Animation
      },
    }
    return node
  }
  for (let index = 0; index < 9; index++) {
    const material = make(index, true)
    material.children = [make(index), make(index)]
    materials.push(material)
    nodes.push(make(index))
  }
  vi.stubGlobal('getComputedStyle', (node: TestNode) => {
    const index = Number(node.dataset.lyricIndex)
    const row = nodes[index - firstIndex]
    const isLine = row === node
    const isActive = index === active.value
    return {
      visibility: row?.style.visibility || 'hidden',
      transform: node.style.transform || 'none',
      lineHeight: '48px',
      fontSize: '32px',
      color: isActive ? 'rgb(255, 255, 255)' : 'rgb(133, 139, 147)',
      webkitTextStrokeColor: 'rgb(24, 30, 39)',
      textShadow: 'none',
      opacity: isLine && !isActive ? '0.34' : '1',
      filter: isLine && !isActive ? 'blur(3px)' : 'blur(0px)',
    }
  })
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      a: number
      constructor(value: string) {
        this.a = scale(value)
      }
    },
  )
  const track = {
    style: trackStyle,
    querySelectorAll: () => nodes,
    querySelector: () => null,
    getBoundingClientRect: () => ({ top: 20 + trackY() }),
  } as unknown as HTMLElement
  const controller = createWholeLineLyricsViewport({
    trackRef: ref(track),
    scrollRef: ref({
      clientHeight: 500,
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 20, bottom: 520, left: 300, width: 200 }),
    } as unknown as HTMLElement),
    artworkRef: ref({
      getBoundingClientRect: () => ({ top: 30, right: 100 }),
    } as unknown as HTMLElement),
    lines: ref(
      Array.from({ length: firstIndex + nodes.length }, (_, index) => ({
        id: String(index),
        text: `Sentence ${index}`,
        timeSeconds: 10 + index * 10,
      })),
    ),
    activeIndex: active,
    showPrelude: ref(false),
    reducedMotion: reduced,
    focalRatio: 0.3,
    activeScale: 1.23,
  })
  const change = (index: number) => {
    controller.beforeChange()
    active.value = index
    controller.update('smooth')
  }
  controller.update('auto')
  return { controller, active, reduced, nodes, materials, runs, change }
}

afterEach(() => vi.unstubAllGlobals())

describe('whole-sentence motion lifecycle', () => {
  it('positions a mounted window by its original lyric indices after a distant seek', () => {
    const { change, nodes, materials } = setup(1000)
    change(1006)
    expect(nodes.slice(0, 4).every((line) => line.style.visibility === 'hidden')).toBe(true)
    expect(nodes[4].style.visibility).toBe('visible')
    expect(nodes[6].style.visibility).toBe('visible')
    expect(materials[6].style.transform).toBe('scale(1)')
    expect(nodes[4].getBoundingClientRect().top).toBeCloseTo(30)
  })

  it('reuses measured heights across sentence changes and invalidates them on a font refresh', () => {
    const { controller, change, materials } = setup()
    const readHeight = vi.fn(() => 48)
    materials.forEach((material) =>
      Object.defineProperty(material, 'offsetHeight', { get: readHeight }),
    )
    controller.update('auto', true)
    expect(readHeight).toHaveBeenCalledTimes(materials.length)
    change(0)
    change(1)
    expect(readHeight).toHaveBeenCalledTimes(materials.length)
    controller.update('auto', true)
    expect(readHeight).toHaveBeenCalledTimes(materials.length * 2)
  })

  it('calibrates opening immediately, then moves and changes paint together for 360ms', () => {
    const { nodes, runs, change } = setup()
    expect(runs).toHaveLength(0)
    expect(nodes[0].getBoundingClientRect().top).toBeGreaterThan(30)
    change(0)
    expect(runs.length).toBeGreaterThan(0)
    expect(runs.every((run) => run.duration === 360)).toBe(true)
    expect(
      runs.some(
        (run) =>
          run.frames[0].color === 'rgb(133, 139, 147)' &&
          run.frames[1].color === 'rgb(255, 255, 255)',
      ),
    ).toBe(true)
  })

  it('animates fluid-style dimming and blur with sentence movement', () => {
    const { nodes, change, runs } = setup()
    change(0)
    expect(
      runs.some(
        (run) =>
          run.element === nodes[0] &&
          run.frames[0].filter === 'blur(3px)' &&
          run.frames[0].opacity === '0.34' &&
          run.frames[1].filter === 'blur(0px)' &&
          run.frames[1].opacity === '1',
      ),
    ).toBe(true)
  })

  it('ignores repeated observer measurements without cancelling or restarting movement', () => {
    const { controller, change, runs } = setup()
    change(0)
    const count = runs.length
    controller.update('auto')
    expect(runs).toHaveLength(count)
    expect(runs.every((run) => run.cancel.mock.calls.length === 0)).toBe(true)
  })

  it('cancels old movement on a backward seek and uses a short transition', () => {
    const { change, runs } = setup()
    change(0)
    const old = [...runs]
    change(-1)
    expect(old.every((run) => run.cancel.mock.calls.length === 1)).toBe(true)
    expect(runs.slice(old.length).every((run) => run.duration === 180)).toBe(true)
  })

  it('removes extra history before the post-render measurement of a rapid seek', () => {
    const { controller, active, nodes } = setup()
    active.value = 6
    controller.beforeChange()
    expect(nodes.slice(0, 4).every((line) => line.style.visibility === 'hidden')).toBe(true)
  })

  it('lands instantly and cancels in-flight animation when reduced motion is enabled', () => {
    const { controller, change, runs, reduced } = setup()
    change(0)
    const count = runs.length
    reduced.value = true
    controller.beforeChange()
    controller.update('smooth')
    expect(runs).toHaveLength(count)
    expect(runs.every((run) => run.cancel.mock.calls.length === 1)).toBe(true)
  })

  it('clears transforms, row heights and visibility and prevents stale entry callbacks', async () => {
    const { controller, change, runs, nodes, materials } = setup()
    change(0)
    runs.forEach((run) => run.finish())
    for (let tick = 0; tick < 4; tick++) await Promise.resolve()
    change(1)
    expect(nodes[7].style.visibility).toBe('hidden')
    const old = runs.filter((run) => !run.cancel.mock.calls.length)
    controller.clear()
    old.forEach((run) => run.finish())
    for (let tick = 0; tick < 4; tick++) await Promise.resolve()
    expect(
      nodes.every(
        (line) =>
          line.style.visibility === '' && line.style.height === '' && line.style.transform === '',
      ),
    ).toBe(true)
    expect(materials.every((material) => material.style.transform === '')).toBe(true)
    expect(old.every((run) => run.cancel.mock.calls.length === 1)).toBe(true)
  })
})
