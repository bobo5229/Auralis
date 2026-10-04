import { effectScope, nextTick, ref, shallowRef, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calculateAlbumGridGeometry, useAlbumGridLayout } from './useAlbumGridLayout'

const scopes: EffectScope[] = []
beforeEach(() => {
  vi.stubGlobal('getComputedStyle', () => ({ paddingTop: '24px', paddingBottom: '32px' }))
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.unstubAllGlobals()
})

function setup() {
  let width = 970
  const readWidth = vi.fn(() => width)
  const element = {
    isConnected: true,
    clientHeight: 700,
    get clientWidth() {
      return readWidth()
    },
    scrollTop: 0,
  }
  const container = shallowRef(element as HTMLElement)
  const isResizing = ref(false)
  const isActive = ref(true)
  const albumKeys = ref(Array.from({ length: 120 }, (_, index) => `album-${index}`))
  const measure = vi.fn()
  const scope = effectScope()
  scopes.push(scope)
  const grid = scope.run(() =>
    useAlbumGridLayout({ container, isResizing, isActive, albumKeys, measure }),
  )!
  grid.update(false)
  readWidth.mockClear()
  measure.mockClear()
  return {
    grid,
    element,
    setWidth: (value: number) => {
      width = value
    },
    readWidth,
    isResizing,
    isActive,
    albumKeys,
    measure,
    scope,
  }
}

describe('album grid geometry', () => {
  it('preserves the 3–6 column rules and grid row spacing', () => {
    const keys = Array.from({ length: 20 }, (_, index) => `album-${index}`)
    const calculate = (width: number) =>
      calculateAlbumGridGeometry({
        width,
        viewportHeight: 800,
        paddingTop: 24,
        paddingBottom: 32,
        albumKeys: keys,
        previous: null,
        scrollTop: 0,
        anchorAlbumKey: null,
      }).geometry

    expect(calculate(700).columnCount).toBe(3)
    expect(calculate(970).columnCount).toBe(5)
    expect(calculate(1290).columnCount).toBe(6)
    expect(calculate(970).rowHeight).toBe(268)
  })

  it('clamps a remapped bottom anchor to the new legal scroll range', () => {
    const albumKeys = Array.from({ length: 37 }, (_, index) => `album-${index}`)
    const previous = {
      width: 970,
      columnCount: 5,
      cardWidth: 170,
      rowHeight: 268,
      totalHeight: 268 * Math.ceil(albumKeys.length / 5),
    }
    const result = calculateAlbumGridGeometry({
      width: 1290,
      viewportHeight: 700,
      paddingTop: 24,
      paddingBottom: 32,
      albumKeys,
      previous,
      scrollTop: 24 + previous.totalHeight,
      anchorAlbumKey: 'album-35',
    })
    expect(result.nextScrollTop).toBe(24 + result.geometry.totalHeight + 32 - 700)
    expect(result.nextScrollTop).toBeGreaterThanOrEqual(0)
  })
})

describe('album grid layout commits', () => {
  it('commits the target geometry once before motion and ignores intervening resize observations', async () => {
    const state = setup()
    const initialHeight = state.grid.rowHeight.value
    state.grid.beginTransition()
    state.isResizing.value = true
    await nextTick()
    state.setWidth(1290)
    expect(state.grid.update()).toBe(false)
    expect(state.readWidth).not.toHaveBeenCalled()

    expect(state.grid.commitTransitionTarget()).toBe(true)
    expect(state.grid.gridWidth.value).toBe(1290)
    expect(state.grid.columnCount.value).toBe(6)
    expect(state.grid.rowHeight.value).not.toBe(initialHeight)
    expect(state.measure).toHaveBeenCalledOnce()

    state.setWidth(1300)
    expect(state.grid.update()).toBe(false)
    expect(state.measure).toHaveBeenCalledOnce()
    state.grid.endTransition()
    state.isResizing.value = false
    await nextTick()
    await nextTick()
    expect(state.grid.gridWidth.value).toBe(1300)
  })

  it('keeps the committed width and row geometry frozen during legacy resize motion', async () => {
    const state = setup()
    const initialHeight = state.grid.rowHeight.value
    state.isResizing.value = true
    await nextTick()
    for (const width of [990, 1050, 1150, 1240, 1290]) {
      state.setWidth(width)
      expect(state.grid.update()).toBe(false)
    }
    expect(state.readWidth).not.toHaveBeenCalled()
    expect(state.measure).not.toHaveBeenCalled()
    expect(state.grid.gridWidth.value).toBe(970)
    expect(state.grid.columnCount.value).toBe(5)
    expect(state.grid.rowHeight.value).toBe(initialHeight)
    state.isResizing.value = false
    await nextTick()
    await nextTick()
    expect(state.grid.gridWidth.value).toBe(1290)
    expect(state.grid.columnCount.value).toBe(6)
    expect(state.measure).toHaveBeenCalledOnce()
  })

  it('retains the stable album key and offset across repeated column count round trips', async () => {
    const state = setup()
    const initialOffset = 24 + 10 * 268 + 20
    state.element.scrollTop = initialOffset
    for (let cycle = 0; cycle < 10; cycle += 1) {
      state.setWidth(1290)
      state.grid.update()
      await nextTick()
      state.setWidth(970)
      state.grid.update()
      await nextTick()
      expect(state.element.scrollTop).toBeCloseTo(initialOffset)
    }
  })

  it('commits the reversed target once after the transition releases its geometry lock', async () => {
    const state = setup()
    state.grid.beginTransition()
    state.setWidth(1250)
    expect(state.grid.commitTransitionTarget()).toBe(true)
    state.setWidth(970)
    expect(state.grid.update()).toBe(false)
    state.grid.endTransition()
    await nextTick()
    await nextTick()
    expect(state.grid.columnCount.value).toBe(5)
    expect(state.measure).toHaveBeenCalledTimes(2)
  })

  it('ignores detached pages and does not apply queued geometry after disposal', async () => {
    const state = setup()
    state.element.isConnected = false
    state.setWidth(1290)
    expect(state.grid.update()).toBe(false)
    expect(state.readWidth).not.toHaveBeenCalled()
    state.element.isConnected = true
    state.isResizing.value = true
    await nextTick()
    state.isResizing.value = false
    await nextTick()
    state.scope.stop()
    await nextTick()
    expect(state.measure).not.toHaveBeenCalled()
  })

  it('does not restore a stale scroll offset after leaving and reactivating the same container', async () => {
    const state = setup()
    state.element.scrollTop = 24 + 10 * 268 + 20
    state.setWidth(1290)
    state.grid.update()
    state.isActive.value = false
    state.isActive.value = true
    state.element.scrollTop = 80
    await nextTick()
    expect(state.element.scrollTop).toBe(80)
  })
})
