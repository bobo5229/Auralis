import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref, type Ref } from 'vue'
import type { PlaybackState } from '@renderer/features/playback/types'
import PlayerBarProgress from './PlayerBarProgress.vue'
import {
  shellTestDocument as doc,
  shellTestRenderer as renderer,
  type ShellTestElement,
} from '@renderer/testUtils/rendererTestHost'

const fixture = vi.hoisted(() => ({
  state: null as PlaybackState | null,
  displayMode: null as Ref<string> | null,
  seekByRatio: vi.fn(),
  seekTo: vi.fn(),
  unsubscribe: vi.fn(),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({
    state: fixture.state!,
    seekByRatio: fixture.seekByRatio,
    seekTo: fixture.seekTo,
  }),
}))
vi.mock('@renderer/features/playback/composables/usePlayerDisplayMode', () => ({
  usePlayerDisplayMode: () => ({ displayMode: fixture.displayMode! }),
}))
vi.mock('@renderer/shared/animation/windowVisibility', () => ({
  observeWindowVisibility: (notify: (visible: boolean) => void) => {
    notify(true)
    return fixture.unsubscribe
  },
}))

let app: ReturnType<typeof renderer.createApp> | null = null
let windowEvents: EventTarget
beforeEach(() => {
  vi.clearAllMocks()
  doc.body.replaceChildren()
  doc.hidden = false
  windowEvents = new EventTarget()
  vi.stubGlobal('window', Object.assign(windowEvents, { devicePixelRatio: 1 }))
  vi.stubGlobal('document', doc)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  fixture.displayMode = ref('normal')
  fixture.state = reactive<PlaybackState>({
    queue: [],
    currentIndex: 0,
    currentTrack: {
      id: 1,
      title: 'One',
      artist: null,
      album: null,
      albumArtist: null,
      durationSeconds: 180,
      artworkCacheKey: null,
    },
    selectedTrackId: 1,
    currentTrackId: 1,
    playbackMode: 'sequential',
    isPlaying: false,
    isMuted: false,
    currentTime: 20,
    duration: 180,
    volume: 0.8,
    error: null,
  })
})
afterEach(() => {
  app?.unmount()
  app = null
  doc.body.replaceChildren()
  doc.hidden = false
  vi.unstubAllGlobals()
})

async function mount(): Promise<ShellTestElement> {
  app = renderer.createApp(PlayerBarProgress)
  app.mount(doc.body)
  await nextTick()
  return doc.body.querySelector('.track-progress')!
}
function pointer(node: ShellTestElement, type: string, clientX: number, pointerId = 7): void {
  const handler = node.props[`on${type[0].toUpperCase()}${type.slice(1)}`] as (
    event: PointerEvent,
  ) => void
  handler({
    currentTarget: node,
    clientX,
    pointerId,
    button: 0,
    preventDefault: vi.fn(),
  } as unknown as PointerEvent)
}

describe('PlayerBarProgress component events with the real progress interaction', () => {
  it.each(['track', 'hidden', 'unseekable', 'blur', 'document-hidden', 'lostpointercapture'])(
    'cancels capture on %s and allows the next drag',
    async (change) => {
      const node = await mount()
      pointer(node, 'pointerdown', 80)
      expect(node.captures.has(7)).toBe(true)
      if (change === 'track') fixture.state!.currentTrackId = 2
      if (change === 'hidden') fixture.displayMode!.value = 'fullscreen'
      if (change === 'unseekable') fixture.state!.duration = 0
      if (change === 'blur') windowEvents.dispatchEvent(new Event('blur'))
      if (change === 'document-hidden') {
        doc.hidden = true
        doc.dispatchEvent(new Event('visibilitychange'))
      }
      if (change === 'lostpointercapture') {
        node.captures.clear()
        pointer(node, change, 80)
      }
      pointer(node, 'pointerup', 240)
      expect(fixture.seekByRatio).not.toHaveBeenCalled()
      expect(node.captures.size).toBe(0)
      fixture.displayMode!.value = 'normal'
      fixture.state!.duration = 180
      doc.hidden = false
      doc.dispatchEvent(new Event('visibilitychange'))
      await nextTick()
      pointer(node, 'pointerdown', 80, 8)
      pointer(node, 'pointerup', 240, 8)
      expect(fixture.seekByRatio).toHaveBeenCalledExactlyOnceWith(0.75)
    },
  )

  it('releases capture on unmount and ignores detached pointer handlers', async () => {
    const node = await mount()
    pointer(node, 'pointerdown', 80)
    app!.unmount()
    app = null
    expect(node.captures.size).toBe(0)
    pointer(node, 'pointerdown', 80, 8)
    pointer(node, 'pointerup', 240, 8)
    expect(fixture.seekByRatio).not.toHaveBeenCalled()
    expect(fixture.unsubscribe).toHaveBeenCalledOnce()
  })
})
