import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, ref } from 'vue'
import zh from '../../locales/zh-Hans.json'
import en from '../../locales/en.json'
import { SIDEBAR_FLAVOR_INTERVAL, SIDEBAR_FLAVOR_KEYS, useSidebarFlavor } from './useSidebarFlavor'

const renderer = createRenderer<object, object>({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert() {},
  remove() {},
  setText() {},
  setElementText() {},
  patchProp() {},
  parentNode: () => null,
  nextSibling: () => null,
})
let cleanup: (() => void) | undefined
let page: EventTarget & { visibilityState: string }
beforeEach(() => {
  vi.useFakeTimers()
  page = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  vi.stubGlobal('document', page)
})
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function mount(random?: () => number) {
  const enabled = ref(true)
  const paused = ref(false)
  let flavor!: ReturnType<typeof useSidebarFlavor>
  const app = renderer.createApp(
    defineComponent({
      setup() {
        flavor = useSidebarFlavor(enabled, paused, random)
        return () => null
      },
    }),
  )
  app.mount({})
  cleanup = () => app.unmount()
  return { flavor, enabled, paused }
}

describe('sidebar flavor rotation', () => {
  it('provides complete matching Chinese and English pools, including real count placeholders', () => {
    expect(SIDEBAR_FLAVOR_KEYS).toHaveLength(150)
    for (const messages of [zh.sidebar.flavor, en.sidebar.flavor]) {
      for (const key of SIDEBAR_FLAVOR_KEYS) {
        const [mode, index] = key.split('.')
        const text = (messages as Record<string, Record<string, string>>)[mode!]![index!]
        expect(text?.trim()).toBeTruthy()
      }
      expect(messages.quests['2']).toContain('{count}')
      expect(messages.terminal['10']).toContain('{count}')
    }
  })

  it('waits 15 seconds, avoids adjacent modes, and exhausts each mode before repeating its copy', () => {
    let seed = 12345
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 0x100000000
    }
    const h = mount(random)
    const initial = h.flavor.key.value
    vi.advanceTimersByTime(SIDEBAR_FLAVOR_INTERVAL - 1)
    expect(h.flavor.key.value).toBe(initial)
    vi.advanceTimersByTime(1)
    expect(h.flavor.key.value).not.toBe(initial)
    const [initialMode, initialEntry] = initial.split('.') as [string, string]
    const seen = new Map<string, string[]>([[initialMode, [initialEntry]]])
    let previousMode = initialMode
    for (let count = 0; count < 600; count++) {
      const [mode, entry] = h.flavor.key.value.split('.') as [string, string]
      expect(mode).not.toBe(previousMode)
      previousMode = mode
      const history = seen.get(mode) ?? []
      if (history.length > 0) expect(entry).not.toBe(history[history.length - 1])
      history.push(entry)
      seen.set(mode, history)
      vi.advanceTimersByTime(SIDEBAR_FLAVOR_INTERVAL)
    }
    expect(seen.size).toBe(10)
    for (const history of seen.values()) {
      for (let offset = 0; offset + 15 <= history.length; offset += 15) {
        expect(new Set(history.slice(offset, offset + 15)).size).toBe(15)
      }
    }
  })

  it('pauses while reading or collapsed, then grants a full reading interval on resume', () => {
    const h = mount()
    const initial = h.flavor.key.value
    vi.advanceTimersByTime(14_000)
    h.paused.value = true
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(60_000)
    expect(h.flavor.key.value).toBe(initial)
    h.enabled.value = false
    h.paused.value = false
    expect(vi.getTimerCount()).toBe(0)
    h.enabled.value = true
    vi.advanceTimersByTime(14_999)
    expect(h.flavor.key.value).toBe(initial)
    vi.advanceTimersByTime(1)
    expect(h.flavor.key.value).not.toBe(initial)
  })

  it('stops while the document is hidden and cleans up timers and listeners on unmount', () => {
    const remove = vi.spyOn(page, 'removeEventListener')
    const h = mount()
    const initial = h.flavor.key.value
    page.visibilityState = 'hidden'
    page.dispatchEvent(new Event('visibilitychange'))
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(60_000)
    expect(h.flavor.key.value).toBe(initial)
    page.visibilityState = 'visible'
    page.dispatchEvent(new Event('visibilitychange'))
    expect(vi.getTimerCount()).toBe(1)
    cleanup?.()
    cleanup = undefined
    expect(vi.getTimerCount()).toBe(0)
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    page.dispatchEvent(new Event('visibilitychange'))
    expect(vi.getTimerCount()).toBe(0)
  })
})
