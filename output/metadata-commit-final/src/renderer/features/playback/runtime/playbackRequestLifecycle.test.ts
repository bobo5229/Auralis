import { isReadonly } from 'vue'
import { describe, expect, it } from 'vitest'
import { createPlaybackRequestLifecycle } from './playbackRequestLifecycle'

describe('playback request lifecycle', () => {
  it('keeps one token pending through navigation and loading', () => {
    const requests = createPlaybackRequestLifecycle()
    expect(requests.phase.value).toBeNull()
    expect(requests.pending.value).toBe(false)
    expect(isReadonly(requests.pending)).toBe(true)
    const token = requests.begin('planning')
    expect(requests.phase.value).toBe('planning')
    expect(requests.transition(token, 'loading')).toBe(true)
    requests.invalidatePlanning()
    expect(requests.isCurrent(token)).toBe(true)
    expect(requests.phase.value).toBe('loading')
    expect(requests.pending.value).toBe(true)
    requests.finish(token)
    expect(requests.pending.value).toBe(false)
    expect(requests.phase.value).toBeNull()
  })

  it.each(['planning', 'loading', 'resuming'] as const)(
    'invalidates only navigation decisions during %s',
    (phase) => {
      const requests = createPlaybackRequestLifecycle()
      const token = requests.begin(phase)
      requests.invalidatePlanning()
      expect(requests.isCurrent(token)).toBe(phase !== 'planning')
      expect(requests.pending.value).toBe(phase !== 'planning')
      requests.invalidate()
      expect(requests.isCurrent(token)).toBe(false)
      expect(requests.pending.value).toBe(false)
    },
  )

  it.each(['old-first', 'new-first'] as const)(
    'isolates completion and phase changes when finishing %s',
    (order) => {
      const requests = createPlaybackRequestLifecycle()
      const old = requests.begin('planning')
      const current = requests.begin('resuming')
      expect(requests.transition(old, 'loading')).toBe(false)
      expect(requests.phase.value).toBe('resuming')
      if (order === 'new-first') requests.finish(current)
      requests.finish(old)
      expect(requests.pending.value).toBe(order === 'old-first')
      requests.finish(current)
      expect(requests.phase.value).toBeNull()
    },
  )

  it('rejects a stale failure and its finally while a newer request remains pending', async () => {
    const requests = createPlaybackRequestLifecycle()
    let reject!: (error: Error) => void
    const failed = new Promise<void>((_resolve, fail) => (reject = fail))
    let error: unknown = null
    const old = requests.begin('loading')
    const completion = failed
      .catch((cause: unknown) => {
        if (requests.isCurrent(old)) error = cause
      })
      .finally(() => requests.finish(old))
    const current = requests.begin('resuming')
    reject(new Error('superseded'))
    await completion
    expect(error).toBeNull()
    expect(requests.isCurrent(current)).toBe(true)
    expect(requests.pending.value).toBe(true)
  })
})
