import { effectScope, nextTick, reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useRecentAddedRange, useRecentAddedRangeMemory } from './useRecentAddedRange'

function setup(value = 'all') {
  const scope = effectScope()
  const route = reactive({
    name: 'recent-added',
    query: { range: value, sort: 'title' },
    hash: '#day',
  })
  const replace = vi.fn(async (target: { query: typeof route.query; hash: string }) => {
    route.query = target.query
  })
  const state = scope.run(() => useRecentAddedRange(route, { replace } as never))!
  return { scope, route, replace, state }
}

describe('recent added range controls', () => {
  it('applies fixed ranges and keeps unrelated query and hash', async () => {
    const f = setup()
    await f.state.select('7')
    expect(f.replace).toHaveBeenCalledWith({ query: { range: '7', sort: 'title' }, hash: '#day' })
    expect(f.state.range.value).toBe(7)
    f.scope.stop()
  })
  it('keeps custom drafts unapplied and cancels without navigation', async () => {
    const f = setup('14')
    await f.state.select('custom')
    expect(f.state.draft.value).toBe(14)
    f.state.draft.value = 21
    expect(f.state.range.value).toBe(14)
    f.state.cancel()
    expect(f.state.editing.value).toBe(false)
    expect(f.replace).not.toHaveBeenCalled()
    f.scope.stop()
  })
  it('defaults to 30 from all time, rejects invalid days and applies valid days', async () => {
    const f = setup()
    await f.state.select('custom')
    expect(f.state.draft.value).toBe(30)
    for (const value of ['', 0, -1, 1.5, 100000001]) {
      f.state.draft.value = value
      await f.state.apply()
      expect(f.state.invalid.value).toBe(true)
      expect(f.replace).not.toHaveBeenCalled()
    }
    f.state.draft.value = '21'
    await f.state.apply()
    expect(f.state.range.value).toBe(21)
    expect(f.state.editing.value).toBe(false)
    f.scope.stop()
  })
  it('preserves the applied range and draft when navigation fails or is cancelled', async () => {
    const f = setup('30')
    await f.state.select('custom')
    f.state.draft.value = 14
    f.replace.mockRejectedValueOnce(new Error('navigation failed'))
    await f.state.apply()
    expect(f.state.failed.value).toBe(true)
    expect(f.state.editing.value).toBe(true)
    expect(f.state.range.value).toBe(30)
    f.replace.mockImplementationOnce(async () => {})
    await f.state.select('7')
    expect(f.state.failed.value).toBe(true)
    expect(f.state.range.value).toBe(30)
    f.scope.stop()
  })
  it('remembers a legacy custom range on leaving and clears drafts on navigation', async () => {
    const f = setup('14')
    const memory = f.scope.run(() => useRecentAddedRangeMemory(f.route))!
    await f.state.select('custom')
    f.route.name = 'library'
    f.route.query = { range: 'all', sort: 'title' }
    await nextTick()
    expect(memory()).toBe('14')
    expect(f.state.editing.value).toBe(false)
    f.scope.stop()
  })
})
