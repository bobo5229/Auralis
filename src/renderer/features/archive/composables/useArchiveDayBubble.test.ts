import { effectScope } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { useArchiveDayBubble } from './useArchiveDayBubble'

const anchor = {} as HTMLElement
const scopes: ReturnType<typeof effectScope>[] = []
function fixture() {
  vi.useFakeTimers()
  const scope = effectScope()
  scopes.push(scope)
  const state = scope.run(() => useArchiveDayBubble())!
  return { scope, state }
}
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.useRealTimers()
})
it('previews after a brief hover without querying track details, then dismisses after leaving', () => {
  const { state } = fixture()
  state.preview('2026-10-09', anchor)
  vi.advanceTimersByTime(149)
  expect(state.date.value).toBeNull()
  vi.advanceTimersByTime(1)
  expect(state.date.value).toBe('2026-10-09')
  state.leave()
  vi.advanceTimersByTime(150)
  expect(state.date.value).toBeNull()
})
it('cancels brief hovers and keeps a bubble open while the pointer crosses into it', () => {
  const { state } = fixture()
  state.preview('2026-10-09', anchor)
  state.leave()
  vi.advanceTimersByTime(300)
  expect(state.date.value).toBeNull()
  state.preview('2026-10-09', anchor, true)
  state.leave()
  vi.advanceTimersByTime(100)
  state.keepOpen()
  vi.advanceTimersByTime(300)
  expect(state.date.value).toBe('2026-10-09')
})
it('cancels a pending preview on selection and never reopens after disposal', () => {
  const { scope, state } = fixture()
  state.preview('2026-10-09', anchor)
  state.close()
  vi.advanceTimersByTime(200)
  expect(state.date.value).toBeNull()
  state.preview('2026-10-10', anchor)
  scope.stop()
  vi.advanceTimersByTime(200)
  state.preview('2026-10-11', anchor, true)
  expect(state.date.value).toBeNull()
  expect(state.anchor.value).toBeNull()
})
it('switches hover dates without retaining the previous date', () => {
  const { state } = fixture()
  state.preview('2026-10-09', anchor, true)
  const nextAnchor = {} as HTMLElement
  state.preview('2026-10-10', nextAnchor)
  vi.advanceTimersByTime(150)
  expect(state.date.value).toBe('2026-10-10')
  expect(state.anchor.value).toBe(nextAnchor)
})
