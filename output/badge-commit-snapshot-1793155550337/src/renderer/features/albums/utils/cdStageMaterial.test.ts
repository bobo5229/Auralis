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
  return { material, node, disc, canvas, document, invalidate: () => invalidate() }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('focused CD material lifetime and CSS fallback', () => {
  it('allocates lazily and reuses a single coating across focused discs', () => {
    const { material, node, disc, canvas } = setup()
    material.sync(undefined)
    expect(gpu.create).not.toHaveBeenCalled()
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
    const { material, node, disc, canvas, invalidate } = setup()
    gpu.draw.mockReturnValue(false)
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
    const { material, node, disc } = setup()
    gpu.create.mockImplementation(() => {
      throw new Error('Shader unavailable')
    })
    material.sync(node, appearance)
    material.sync(node, { ...appearance, x: 25 })
    expect(gpu.create).toHaveBeenCalledTimes(1)
    expect(disc.attributes.get('data-material-ready')).toBe('false')
    expect(disc.children).toEqual([])
    material.dispose()
  })

  it('does no GPU work while hidden and uses the latest appearance when visible', () => {
    const { material, node, document, invalidate } = setup()
    document.hidden = true
    material.sync(node, appearance)
    expect(gpu.create).not.toHaveBeenCalled()
    document.hidden = false
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
    const { material, node, disc, invalidate } = setup()
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
})
