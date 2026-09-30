import { reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computeLyricsTargetWidth,
  subscribeLyricsBreakpoint,
  useLyricsPanelLayout,
} from './useLyricsPanelLayout'

const mockRoute = reactive({ name: 'songs' })
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
}))

const mockDisplayMode = ref<'normal' | 'fullscreen'>('normal')
vi.mock('@renderer/features/playback/composables/usePlayerDisplayMode', () => ({
  usePlayerDisplayMode: () => ({
    displayMode: mockDisplayMode,
  }),
}))

describe('useLyricsPanelLayout', () => {
  let listeners: Array<(event: { matches: boolean }) => void> = []
  let matchesState = true

  beforeEach(() => {
    listeners = []
    matchesState = true
    mockRoute.name = 'songs'
    mockDisplayMode.value = 'normal'

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: matchesState,
      media: query,
      addEventListener: (_type: string, cb: (e: { matches: boolean }) => void) => {
        listeners.push(cb)
      },
      removeEventListener: (_type: string, cb: (e: { matches: boolean }) => void) => {
        listeners = listeners.filter((item) => item !== cb)
      },
    }))
  })

  it('computes 20% target width correctly', () => {
    expect(computeLyricsTargetWidth(1000)).toBe(200)
    expect(computeLyricsTargetWidth(1500)).toBe(300)
  })

  it('coordinates availability based on wide screen, normal mode, and route', () => {
    const layout = useLyricsPanelLayout({ autoSubscribe: false })
    const unsub = subscribeLyricsBreakpoint()

    expect(layout.canDisplayLyricsPanel.value).toBe(true)

    // CD canvas hides it
    mockRoute.name = 'cd-albums'
    expect(layout.canDisplayLyricsPanel.value).toBe(false)
    mockRoute.name = 'songs'
    expect(layout.canDisplayLyricsPanel.value).toBe(true)

    // Archive canvas hides lyrics and restores availability on return.
    mockRoute.name = 'archive'
    expect(layout.canDisplayLyricsPanel.value).toBe(false)
    mockRoute.name = 'songs'
    expect(layout.canDisplayLyricsPanel.value).toBe(true)

    // Fullscreen hides it
    mockDisplayMode.value = 'fullscreen'
    expect(layout.canDisplayLyricsPanel.value).toBe(false)
    mockDisplayMode.value = 'normal'
    expect(layout.canDisplayLyricsPanel.value).toBe(true)

    // Narrow window hides it
    matchesState = false
    listeners.forEach((cb) => cb({ matches: false }))
    expect(layout.canDisplayLyricsPanel.value).toBe(false)

    unsub()
  })

  it('only attaches a single listener across multiple subscribers and cleans up', () => {
    const unsub1 = subscribeLyricsBreakpoint()
    const unsub2 = subscribeLyricsBreakpoint()
    expect(listeners.length).toBe(1)

    unsub1()
    expect(listeners.length).toBe(1)

    unsub2()
    expect(listeners.length).toBe(0)
  })
})
