import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLyricLineSeek } from './useLyricLineSeek'
import type { LyricLine } from '../types'

const { seekTo } = vi.hoisted(() => ({ seekTo: vi.fn() }))
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({ seekTo }),
}))

beforeEach(() => vi.clearAllMocks())

describe('shared lyric line seeking', () => {
  it('seeks the latest line timestamp before resuming follow', () => {
    let lines: LyricLine[] = [{ id: 'a', text: 'First', timeSeconds: 12.5 }]
    const onSeek = vi.fn(() => expect(seekTo).toHaveBeenLastCalledWith(lines[0].timeSeconds))
    const handler = useLyricLineSeek({ lines: () => lines, onSeek })
    handler.activate(0)
    lines = [{ id: 'b', text: 'New track', timeSeconds: 0 }]
    handler.activate(0)
    expect(seekTo.mock.calls).toEqual([[12.5], [0]])
    expect(onSeek).toHaveBeenCalledTimes(2)
  })

  it('does not seek plain lyrics, missing lines or invalid timestamps', () => {
    let enabled = false
    const onSeek = vi.fn()
    const handler = useLyricLineSeek({
      lines: () => [
        { id: 'a', text: 'Plain text', timeSeconds: 0 },
        { id: 'b', text: 'Invalid', timeSeconds: NaN },
      ],
      enabled: () => enabled,
      onSeek,
    })
    handler.activate(0)
    enabled = true
    handler.activate(1)
    handler.activate(2)
    expect(seekTo).not.toHaveBeenCalled()
    expect(onSeek).not.toHaveBeenCalled()
  })

  it.each(['Enter', ' '])('activates with %j and prevents bubbling or native scrolling', (key) => {
    const handler = useLyricLineSeek({
      lines: () => [{ id: 'a', text: 'Lyric', timeSeconds: 8 }],
      onSeek: vi.fn(),
    })
    const event = { key, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    handler.onKeydown(event as unknown as KeyboardEvent, 0)
    expect(seekTo).toHaveBeenCalledWith(8)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
  })

  it('leaves navigation and plain-text keys untouched', () => {
    const handler = useLyricLineSeek({ lines: () => [], enabled: () => false, onSeek: vi.fn() })
    const event = { key: ' ', preventDefault: vi.fn(), stopPropagation: vi.fn() }
    handler.onKeydown(event as unknown as KeyboardEvent, 0)
    const timed = useLyricLineSeek({ lines: () => [], onSeek: vi.fn() })
    timed.onKeydown({ ...event, key: 'ArrowDown' } as unknown as KeyboardEvent, 0)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })
})
