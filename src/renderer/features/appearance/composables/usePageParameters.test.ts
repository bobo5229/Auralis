import { effectScope, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPageParameters } from './usePageParameters'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
})
function setup() {
  const route = ref<unknown>('library')
  const blocked = ref(false)
  const scope = effectScope()
  scopes.push(scope)
  const state = scope.run(() => createPageParameters(route, blocked))!
  const trigger = {
    isConnected: true,
    matches: () => false,
    closest: () => null,
    focus: vi.fn(),
  } as unknown as HTMLElement
  return { route, blocked, state, trigger }
}

describe('page parameters', () => {
  it('requires an actual supported page context and toggles with focus return', async () => {
    const { state, trigger } = setup()
    state.toggle(trigger)
    expect(state.open.value).toBe(false)
    state.publish(Symbol(), { kind: 'songs', view: 'list' })
    state.toggle(trigger)
    expect(state.open.value).toBe(true)
    state.toggle(trigger)
    await nextTick()
    expect(state.open.value).toBe(false)
    expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true })
  })
  it('follows actual song views and keeps open across supported routes', () => {
    const { state, route, trigger } = setup()
    const songs = Symbol(),
      albums = Symbol()
    state.publish(songs, { kind: 'songs', view: 'list' })
    state.toggle(trigger)
    state.publish(songs, { kind: 'songs', view: 'cover' })
    expect(state.context.value).toEqual({ kind: 'songs', view: 'cover' })
    route.value = 'albums'
    expect(state.context.value).toBeNull()
    expect(state.open.value).toBe(true)
    state.publish(albums, { kind: 'albums' })
    expect(state.context.value).toEqual({ kind: 'albums' })
    state.publish(songs, { kind: 'songs', view: 'list' })
    state.release(songs)
    expect(state.context.value).toEqual({ kind: 'albums' })
  })
  it.each([
    'playlist',
    'smart-playlist',
    'album-detail',
    'cd-albums',
    'archive',
    'archive-annual-summary',
  ])('closes on unsupported route %s without moving focus', async (name) => {
    const { state, route, trigger } = setup()
    state.publish(Symbol(), { kind: 'songs', view: 'list' })
    state.toggle(trigger)
    route.value = name
    await nextTick()
    expect(state.open.value).toBe(false)
    expect(state.supported.value).toBe(false)
    expect(trigger.focus).not.toHaveBeenCalled()
    route.value = 'library'
    expect(state.open.value).toBe(false)
  })
  it('closes for global settings/fullscreen and never reopens automatically', async () => {
    const { state, blocked, trigger } = setup()
    state.publish(Symbol(), { kind: 'songs', view: 'list' })
    state.toggle(trigger)
    blocked.value = true
    await nextTick()
    expect(state.open.value).toBe(false)
    expect(trigger.focus).not.toHaveBeenCalled()
    blocked.value = false
    expect(state.open.value).toBe(false)
  })
  it('does not let an old instance release a newer context', () => {
    const { state } = setup()
    const oldOwner = Symbol(),
      newOwner = Symbol()
    state.publish(oldOwner, { kind: 'songs', view: 'list' })
    state.publish(newOwner, { kind: 'songs', view: 'cover' })
    state.release(oldOwner)
    expect(state.context.value).toEqual({ kind: 'songs', view: 'cover' })
    state.release(newOwner)
    expect(state.context.value).toBeNull()
  })
  it('does not return focus to a removed or disabled trigger, or steal focus after reopening', async () => {
    const { state, trigger } = setup()
    state.publish(Symbol(), { kind: 'songs', view: 'list' })
    state.toggle(trigger)
    state.close()
    state.toggle(trigger)
    await nextTick()
    expect(trigger.focus).not.toHaveBeenCalled()
    Object.defineProperty(trigger, 'isConnected', { value: false })
    state.close()
    await nextTick()
    expect(trigger.focus).not.toHaveBeenCalled()
  })
})
