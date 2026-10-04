import { afterEach, describe, expect, it, vi } from 'vitest'
import { createArchiveStarfield } from './archiveStarfield'

afterEach(() => vi.unstubAllGlobals())

describe('archive starfield backing store', () => {
  it('does not reset identical sizes, but follows physical size and display scale changes', () => {
    const gradient = { addColorStop: vi.fn() }
    const context = {
      createRadialGradient: () => gradient,
      createLinearGradient: () => gradient,
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      setTransform: vi.fn(),
    }
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) })
    const screen = { devicePixelRatio: 1.5 }
    vi.stubGlobal('window', screen)
    let width = 300
    let height = 150
    const setWidth = vi.fn((value: number) => {
      width = value
    })
    const setHeight = vi.fn((value: number) => {
      height = value
    })
    const canvas = {
      get width() {
        return width
      },
      set width(value) {
        setWidth(value)
      },
      get height() {
        return height
      },
      set height(value) {
        setHeight(value)
      },
      getContext: () => context,
    }
    const field = createArchiveStarfield(canvas as unknown as HTMLCanvasElement)
    field.resize(800, 600)
    expect([width, height]).toEqual([1200, 900])
    field.resize(800, 600)
    field.resize(800, 600)
    expect(setWidth).toHaveBeenCalledTimes(1)
    expect(setHeight).toHaveBeenCalledTimes(1)
    field.resize(801, 600)
    expect([width, height]).toEqual([1202, 900])
    expect(setHeight).toHaveBeenCalledTimes(1)
    screen.devicePixelRatio = 2
    field.resize(801, 600)
    expect([width, height]).toEqual([1602, 1200])
    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0)
    field.dispose()
    expect([width, height]).toEqual([1, 1])
  })
})
