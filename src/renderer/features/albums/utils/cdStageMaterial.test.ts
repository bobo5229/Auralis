import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCdStageMaterial } from './cdStageMaterial'
import type { CdDiscMaterialState } from './cdDiscMaterial'
import type { CdStageNode } from './cdStageResources'

const gpu = vi.hoisted(() => ({ create: vi.fn(), draw: vi.fn(), dispose: vi.fn() }))
vi.mock('./cdDiscMaterial', () => ({ createCdDiscMaterial: gpu.create }))

class Element {
  parentElement: Element | null = null
  children: Element[] = []
  style = { visibility: '' }
  attributes = new Map<string, string>()
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value)
  }
  append(child: Element) {
    child.remove()
    child.parentElement = this
    this.children.push(child)
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this)
    this.parentElement = null
  }
}
const appearance: CdDiscMaterialState = {
  x: 9,
  y: -42,
  z: 24,
  angle: 18,
  vinyl: 1,
  dark: false,
  size: 392,
}
function setup() {
  let nextIdle = 0
  const idle = new Map<number, () => void>()
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
    idle.set(++nextIdle, callback)
    return nextIdle
  })
  vi.stubGlobal('cancelIdleCallback', (id: number) => idle.delete(id))
  const flushPreparation = () => {
    const callbacks = [...idle.values()]
    idle.clear()
    callbacks.forEach((callback) => callback())
  }
  let invalidate = () => {}
  const canvas = new Element()
  const document = { hidden: false, createElement: vi.fn(() => canvas) }
  vi.stubGlobal('document', document)
  gpu.draw.mockReturnValue(true)
  gpu.create.mockImplementation((_canvas, changed) => {
    invalidate = changed
    return gpu
  })
  const material = createCdStageMaterial()
  const disc = new Element()
  const node = { disc } as unknown as CdStageNode
  return {
    material,
    node,
    disc,
    canvas,
    document,
    flushPreparation,
    invalidate: () => invalidate(),
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('focused CD material lifetime and CSS fallback', () => {
  it('warms a detached coating in idle time and reuses it across focused discs', () => {
    const { material, node, disc, canvas, flushPreparation } = setup()
    material.sync(undefined)
    material.prepare(appearance)
    expect(gpu.create).not.toHaveBeenCalled()
    flushPreparation()
    expect(disc.children).toEqual([])
    expect(gpu.draw).toHaveBeenCalledWith(appearance, true)
    material.sync(node, appearance)
    expect(disc.attributes.get('data-material-ready')).toBe('true')
    expect(disc.children).toEqual([canvas])
    material.sync(undefined)
    expect(disc.children).toEqual([])
    expect(disc.attributes.get('data-material-ready')).toBe('false')
    const second = { disc: new Element() } as unknown as CdStageNode
    material.sync(second, { ...appearance, dark: true, angle: 94 })
    expect(gpu.create).toHaveBeenCalledTimes(1)
    expect(gpu.draw).toHaveBeenLastCalledWith(
      expect.objectContaining({ dark: true, angle: 94 }),
      true,
    )
    material.dispose()
    expect(gpu.dispose).toHaveBeenCalledTimes(1)
  })

  it('keeps CSS until a valid draw and restores it immediately on context loss', () => {
    const { material, node, disc, canvas, invalidate, flushPreparation } = setup()
    gpu.draw.mockReturnValue(false)
    material.prepare(appearance)
    flushPreparation()
    material.sync(node, appearance)
    expect(disc.attributes.get('data-material-ready')).toBe('false')
    expect(canvas.style.visibility).toBe('hidden')
    gpu.draw.mockReturnValue(true)
    invalidate()
    expect(disc.attributes.get('data-material-ready')).toBe('true')
    gpu.draw.mockReturnValue(false)
    invalidate()
    expect(disc.attributes.get('data-material-ready')).toBe('false')
    expect(canvas.style.visibility).toBe('hidden')
    gpu.draw.mockReturnValue(true)
    invalidate()
    expect(canvas.style.visibility).toBe('visible')
    material.dispose()
  })

  it('falls back after an allocation/compile failure without retrying every pose update', () => {
    const { material, node, disc, flushPreparation } = setup()
    gpu.create.mockImplementation(() => {
      throw new Error('Shader unavailable')
    })
    material.prepare(appearance)
    flushPreparation()
    material.sync(node, appearance)
    material.sync(node, { ...appearance, x: 25 })
    expect(gpu.create).toHaveBeenCalledTimes(1)
    expect(disc.attributes.get('data-material-ready')).toBe('false')
    expect(disc.children).toEqual([])
    material.dispose()
  })

  it('does no GPU work while hidden and uses the latest appearance when visible', () => {
    const { material, node, document, invalidate, flushPreparation } = setup()
    document.hidden = true
    material.prepare(appearance)
    flushPreparation()
    material.sync(node, appearance)
    expect(gpu.create).not.toHaveBeenCalled()
    document.hidden = false
    material.prepare(appearance)
    flushPreparation()
    material.sync(node, appearance)
    gpu.draw.mockClear()
    document.hidden = true
    material.sync(node, { ...appearance, vinyl: 0.4 })
    invalidate()
    expect(gpu.draw).not.toHaveBeenCalled()
    document.hidden = false
    material.sync(node, { ...appearance, vinyl: 0.4 })
    expect(gpu.draw).toHaveBeenCalledWith(expect.objectContaining({ vinyl: 0.4 }), false)
    material.dispose()
  })

  it('cannot reattach a removed disc or revive the renderer after disposal', () => {
    const { material, node, disc, invalidate, flushPreparation } = setup()
    material.prepare(appearance)
    flushPreparation()
    material.sync(node, appearance)
    material.releaseNode(node)
    gpu.draw.mockClear()
    invalidate()
    expect(gpu.draw).not.toHaveBeenCalled()
    expect(disc.children).toEqual([])
    material.dispose()
    invalidate()
    material.sync(node, appearance)
    expect(gpu.create).toHaveBeenCalledTimes(1)
    expect(gpu.dispose).toHaveBeenCalledTimes(1)
    expect(disc.attributes.get('data-material-ready')).toBe('false')
  })

  it('keeps the CSS coating when immediate motion cancels preparation, then prepares the latest pose', () => {
    const { material, node, disc, flushPreparation } = setup()
    material.prepare(appearance)
    material.cancelPreparation()
    for (let x = 0; x < 60; x++) material.sync(node, { ...appearance, x })
    flushPreparation()
    expect(gpu.create).not.toHaveBeenCalled()
    expect(disc.attributes.get('data-material-ready')).toBe('false')
    material.prepare(appearance)
    material.prepare({ ...appearance, x: 59 })
    flushPreparation()
    expect(gpu.create).toHaveBeenCalledTimes(1)
    expect(gpu.draw).toHaveBeenLastCalledWith(expect.objectContaining({ x: 59 }), true)
    expect(disc.attributes.get('data-material-ready')).toBe('true')
    material.dispose()
  })

  it('cancels pending preparation on disposal and skips it if the window becomes hidden', () => {
    const { material, document, flushPreparation } = setup()
    material.prepare(appearance)
    document.hidden = true
    flushPreparation()
    expect(gpu.create).not.toHaveBeenCalled()
    document.hidden = false
    material.prepare(appearance)
    material.dispose()
    flushPreparation()
    expect(gpu.create).not.toHaveBeenCalled()
  })
})
