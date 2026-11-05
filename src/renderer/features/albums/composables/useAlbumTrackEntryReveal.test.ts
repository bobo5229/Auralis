import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { useAlbumTrackEntryReveal } from './useAlbumTrackEntryReveal'
import type { ForegroundReadiness } from '@renderer/shared/color/foregroundReadiness'

const renderer = createRenderer({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert: () => {},
  remove: () => {},
  setText: () => {},
  setElementText: () => {},
  parentNode: () => null,
  nextSibling: () => null,
  patchProp: () => {},
})
const mounted: Array<() => void> = []
afterEach(() => {
  mounted.splice(0).forEach((unmount) => unmount())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function mountReveal(options: {
  target: string
  background: string
  delay?: number
  artwork?: string | null
}) {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 16),
  )
  vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id))
  vi.stubGlobal('getComputedStyle', () => ({ backgroundColor: options.background }))
  const color = ref(options.target)
  const entering = ref(true)
  const artwork = ref(options.artwork === undefined ? 'cover' : options.artwork)
  const main = new EventTarget() as HTMLElement
  const readiness = ref<ForegroundReadiness | null>(
    options.delay === undefined
      ? null
      : {
          target: options.target.includes('240')
            ? { r: 240, g: 240, b: 240 }
            : { r: 60, g: 60, b: 60 },
          readyAt: performance.now() + options.delay,
        },
  )
  const root = ref({ closest: () => main } as unknown as HTMLElement)
  const state: { pending?: Ref<boolean> } = {}
  const app = renderer.createApp(
    defineComponent({
      setup() {
        state.pending = useAlbumTrackEntryReveal(root, {
          entering: () => entering.value,
          textColor: () => color.value,
          artworkKey: () => artwork.value,
          readiness: () => readiness.value,
        }).pending
        return () => h('div')
      },
    }),
  )
  app.mount({})
  mounted.push(() => app.unmount())
  return { pending: state.pending!, color, entering, readiness }
}

describe('album track entry reveal', () => {
  it('waits for the explicit dark foreground readiness', async () => {
    const { pending } = mountReveal({
      target: 'rgb(60 60 60)',
      background: 'rgb(20, 20, 20)',
      delay: 277,
    })
    await nextTick()
    await vi.advanceTimersByTimeAsync(16)
    expect(pending.value).toBe(true)
    await vi.advanceTimersByTimeAsync(260)
    expect(pending.value).toBe(true)
    await vi.advanceTimersByTimeAsync(2)
    expect(pending.value).toBe(false)
  })
  it('also waits for light text when entering a dark album from a light surface', async () => {
    const { pending } = mountReveal({
      target: 'rgb(240 240 240)',
      background: 'rgb(235, 235, 235)',
      delay: 212,
    })
    await nextTick()
    await vi.advanceTimersByTimeAsync(16)
    expect(pending.value).toBe(true)
    await vi.advanceTimersByTimeAsync(197)
    expect(pending.value).toBe(false)
  })
  it('ignores a readiness result for a different target color', async () => {
    const { pending, readiness } = mountReveal({
      target: 'rgb(60 60 60)',
      background: 'rgb(20, 20, 20)',
    })
    readiness.value = { target: { r: 20, g: 20, b: 20 }, readyAt: performance.now() }
    await nextTick()
    await vi.advanceTimersByTimeAsync(80)
    expect(pending.value).toBe(true)
    readiness.value = { target: { r: 60, g: 60, b: 60 }, readyAt: performance.now() + 80 }
    await nextTick()
    await vi.advanceTimersByTimeAsync(64)
    expect(pending.value).toBe(true)
    await vi.advanceTimersByTimeAsync(20)
    expect(pending.value).toBe(false)
  })
  it('reveals immediately when reduced motion leaves a readable final background', async () => {
    const { pending } = mountReveal({ target: 'rgb(40 40 40)', background: 'rgb(220, 240, 220)' })
    await nextTick()
    await vi.advanceTimersByTimeAsync(16)
    expect(pending.value).toBe(false)
  })
  it('releases missing artwork after the entry, and does not wait indefinitely for a palette', async () => {
    const missing = mountReveal({ target: '', background: 'rgb(20, 20, 20)', artwork: null })
    await nextTick()
    missing.entering.value = false
    await nextTick()
    expect(missing.pending.value).toBe(false)
    const failed = mountReveal({ target: '', background: 'rgb(20, 20, 20)' })
    await vi.advanceTimersByTimeAsync(1200)
    expect(failed.pending.value).toBe(false)
  })
})
