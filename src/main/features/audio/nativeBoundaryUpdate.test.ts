import { describe, expect, it, vi } from 'vitest'
import type { MpvClient } from './mpvClient'
import { NativeBoundaryUpdater } from './nativeBoundaryUpdate'
import { NativePlaybackSession } from './nativePlaybackSession'
import type { SoftTransition } from './softTransition'

type Command = { name: string; args: unknown[]; index: number }
type Entry = { path: string; start: string }
const ordinary = (): Entry[] => [
  { path: 'a.flac', start: '0' },
  { path: 'b.flac', start: '0' },
]

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function setup() {
  const runtime = new NativePlaybackSession()
  runtime.begin(1)
  const state = {
    playlist: ordinary(),
    position: 0,
    time: 0,
    end: 'none',
    loaded: true,
    duration: 120,
    decodeOffset: 0,
    enteringNext: false,
    current: true,
    before: (async () => {}) as (command: Command) => Promise<void>,
    after: (async () => {}) as (command: Command) => Promise<void>,
  }
  let transition: SoftTransition | null = null
  let count = 0
  const command = vi.fn(async (name: string, ...args: unknown[]) => {
    const call = { name, args, index: ++count }
    await state.before(call)
    let value: unknown
    const active = state.playlist[state.position]
    if (name === 'get_property') {
      if (args[0] === 'playlist-pos') value = state.position
      if (args[0] === 'time-pos') value = state.time
      if (args[0] === 'path') value = active?.path
    }
    if (name === 'loadfile') {
      const entry = { path: String(args[0]), start: (args[3] as { start?: string }).start ?? '0' }
      if (args[1] === 'replace') {
        state.playlist = [entry]
        state.position = 0
      } else state.playlist.push(entry)
    }
    if (name === 'playlist-move') {
      const [entry] = state.playlist.splice(Number(args[0]), 1)
      if (!entry) throw new Error('Missing playlist move source')
      state.playlist.splice(Number(args[1]), 0, entry)
      state.position = state.playlist.indexOf(active)
    }
    if (name === 'playlist-remove') {
      // Removing the decoder's active entry would stop playback in real mpv.
      expect(state.playlist[Number(args[0])]).not.toBe(active)
      state.playlist.splice(Number(args[0]), 1)
      state.position = state.playlist.indexOf(active)
    }
    if (name === 'playlist-clear') {
      state.playlist = [active]
      state.position = 0
    }
    if (name === 'set_property') state.end = String(args[1])
    await state.after(call)
    return value
  })
  const client = { command, close: vi.fn() } as MpvClient
  runtime.client = client
  const publish = vi.fn((plan: SoftTransition, continuationPath: string) => {
    expect(continuationPath).toBe('b.flac')
    transition = plan
    return () => {
      if (transition === plan) transition = null
    }
  })
  const updater = new NativeBoundaryUpdater({
    enqueue: (work) => runtime.enqueue(work),
    isCurrent: (session, transport) => runtime.isCurrent(session, transport),
    read: () => ({ ...state, hasTransition: transition !== null }),
    publishTransition: publish,
  })
  const plan: SoftTransition = {
    path: 'bridge.wav',
    outgoingEnd: 119,
    incomingStart: 0.1,
    incomingResume: 1.1,
    incomingDuration: 100,
    duration: 2,
    dispose: vi.fn(async () => {}),
  }
  const isCurrent = () => state.current && runtime.isCurrent(1, client)
  const run = (kind: 'silence' | 'soft') =>
    kind === 'silence'
      ? updater.updateBoundary(client, 'b.flac', { start: 0.1, end: 119 }, isCurrent)
      : updater.installSoftTransition(client, 'b.flac', plan, isCurrent)
  const idle = () => {
    expect(updater.isUpdating).toBe(false)
    expect(updater.isInstalling).toBe(false)
    expect(plan.dispose).not.toHaveBeenCalled()
  }
  const pause = (index: number, phase: 'before' | 'after' = 'after') => {
    const entered = deferred()
    const release = deferred()
    state[phase] = async (call) => {
      if (call.index !== index) return
      entered.resolve()
      await release.promise
    }
    return { entered: entered.promise, release: release.resolve }
  }
  let cleanup: Promise<void> | null = null
  const advance = () => {
    state.position++
    state.enteringNext = true
    state.current = false
    cleanup = updater.onStartFile(1, client)
    return state.playlist[state.position]
  }
  return {
    runtime,
    state,
    client,
    command,
    updater,
    plan,
    publish,
    run,
    idle,
    pause,
    advance,
    cleanup: () => cleanup,
    transition: () => transition,
  }
}

describe('NativeBoundaryUpdater playlist transactions', () => {
  it.each(['silence', 'soft'] as const)(
    'applies %s with a nonzero decoder offset',
    async (kind) => {
      const t = setup()
      t.state.decodeOffset = 10
      await expect(t.run(kind)).resolves.toBe(kind === 'silence' ? 'applied' : true)
      expect(t.state.end).toBe('109')
      expect(t.state.playlist).toEqual(
        kind === 'silence'
          ? [ordinary()[0], { path: 'b.flac', start: '0.1' }]
          : [ordinary()[0], { path: 'bridge.wav', start: '0' }, { path: 'b.flac', start: '1.1' }],
      )
      t.idle()
    },
  )

  it('trims only the incoming head without setting the outgoing end', async () => {
    const t = setup()
    await expect(
      t.updater.updateBoundary(t.client, 'b.flac', { start: 0.2, end: null }, () => true),
    ).resolves.toBe('applied')
    expect(t.state.playlist).toEqual([ordinary()[0], { path: 'b.flac', start: '0.2' }])
    expect(t.command.mock.calls.some(([name]) => name === 'set_property')).toBe(false)
    t.idle()
  })

  it.each(['silence', 'soft'] as const)('keeps the two-second margin for %s', async (kind) => {
    const t = setup()
    t.state.time = 107.01
    t.state.decodeOffset = 10
    await expect(t.run(kind)).resolves.toBe(kind === 'silence' ? 'too-late' : false)
    expect(t.state.playlist).toEqual(ordinary())
    expect(t.state.end).toBe('none')
    t.state.time = 107
    await expect(t.run(kind)).resolves.toBe(kind === 'silence' ? 'applied' : true)
    t.idle()
  })

  it.each([-1, 0.5, NaN])(
    'rejects invalid playlist position %s without mutations',
    async (position) => {
      for (const kind of ['silence', 'soft'] as const) {
        const t = setup()
        t.state.position = position
        if (kind === 'silence')
          await expect(t.run(kind)).rejects.toThrow('Invalid mpv playlist position')
        else await expect(t.run(kind)).resolves.toBe(false)
        expect(t.state.playlist).toEqual(ordinary())
        t.idle()
      }
    },
  )

  it('rechecks the position after querying live time', async () => {
    const t = setup()
    t.state.after = async ({ index }) => {
      if (index === 2) t.state.position = 1
    }
    await expect(t.run('silence')).resolves.toBe('too-late')
    expect(t.state.playlist).toEqual(ordinary())
    t.idle()
  })

  for (const [kind, commands] of [
    ['silence', 13],
    ['soft', 11],
  ] as const) {
    it.each(Array.from({ length: commands }, (_, i) => i + 1))(
      `${kind}: restores the ordinary queue when command %i rejects`,
      async (index) => {
        const t = setup()
        const failure = new Error(`command ${index} failed`)
        t.state.before = async (call) => {
          if (call.index === index) throw failure
        }
        await expect(t.run(kind)).rejects.toBe(failure)
        expect(t.state.playlist).toEqual(ordinary())
        expect(t.state.end).toBe('none')
        expect(t.transition()).toBeNull()
        t.idle()
      },
    )
  }

  it.each([4, 7, 10])(
    'silence: restores after successful mutation %i when time runs out',
    async (index) => {
      const t = setup()
      t.state.after = async (call) => {
        if (call.index === index) t.state.time = 119
      }
      await expect(t.run('silence')).resolves.toBe('too-late')
      expect(t.state.playlist).toEqual(ordinary())
      expect(t.state.end).toBe('none')
      t.idle()
    },
  )

  it('publishes the bridge before setting end and leaves its file with the caller', async () => {
    const t = setup()
    const gate = t.pause(11, 'before')
    const work = t.run('soft')
    await gate.entered
    expect(t.publish).toHaveBeenCalledWith(t.plan, 'b.flac')
    expect(t.updater.isInstalling).toBe(true)
    expect(t.updater.onStartFile(1, t.client)).toBeNull()
    expect(t.updater.hasInterruptedLoad).toBe(false)
    gate.release()
    await expect(work).resolves.toBe(true)
    expect(t.transition()).toBe(t.plan)
    t.idle()
  })
})

describe('NativeBoundaryUpdater interruption and compensation', () => {
  for (const [kind, points] of [
    ['silence', [4, 7, 10]],
    ['soft', [3, 4, 6, 7, 9]],
  ] as const) {
    it.each(points)(
      `${kind}: cancellation at mutation %i lets the shared queue perform subsequent cleanup`,
      async (index) => {
        const t = setup()
        const gate = t.pause(index)
        const work = t.run(kind)
        await gate.entered
        t.state.current = false
        const cleanup = t.runtime.enqueue(async () => {
          await t.client.command('playlist-clear')
          await t.client.command('set_property', 'file-local-options/end', 'none')
        })
        gate.release()
        await expect(work).resolves.toBe(kind === 'silence' ? 'cancelled' : false)
        await cleanup
        expect(t.state.playlist).toEqual([ordinary()[0]])
        expect(t.state.end).toBe('none')
        t.idle()
      },
    )

    it.each(points)(
      `${kind}: natural advance at mutation %i preserves the active entry`,
      async (index) => {
        const t = setup()
        const gate = t.pause(index)
        const work = t.run(kind)
        await gate.entered
        const active = t.advance()
        expect(t.cleanup()).not.toBeNull()
        gate.release()
        await expect(work).resolves.toBe(kind === 'silence' ? 'cancelled' : false)
        await t.cleanup()
        expect(t.state.playlist).toEqual([active])
        expect(t.state.end).toBe('none')
        if (kind === 'soft') {
          expect(t.updater.hasInterruptedLoad).toBe(true)
          await expect(t.updater.recoverInterruptedLoad(1, t.client)).resolves.toBe(
            active.path === 'bridge.wav',
          )
          expect(t.updater.hasInterruptedLoad).toBe(false)
          expect(t.state.playlist).toEqual([{ path: 'b.flac', start: '0' }])
        }
        t.idle()
      },
    )

    it.each(points)(
      `${kind}: session replacement and reset at mutation %i retain busy state until exit`,
      async (index) => {
        const t = setup()
        const gate = t.pause(index)
        const work = t.run(kind)
        await gate.entered
        t.runtime.begin(2)
        t.updater.reset()
        expect(t.updater.isUpdating).toBe(true)
        expect(t.updater.isInstalling).toBe(kind === 'soft')
        const next = t.runtime.enqueue(async () => {
          expect(t.updater.isUpdating).toBe(false)
          await t.client.command('loadfile', 'new-session.flac', 'replace', -1, {})
        })
        gate.release()
        await expect(work).resolves.toBe(kind === 'silence' ? 'cancelled' : false)
        await next
        expect(t.state.playlist).toEqual([{ path: 'new-session.flac', start: '0' }])
        expect(t.updater.hasInterruptedLoad).toBe(false)
        t.idle()
      },
    )
  }

  it.each([14, 15, 16])(
    'silence: stops compensation when ownership is lost after command %i',
    async (index) => {
      const t = setup()
      const failure = new Error('end failed')
      t.state.before = async (call) => {
        if (call.index === 13) throw failure
      }
      const gate = t.pause(index)
      const work = expect(t.run('silence')).rejects.toBe(failure)
      await gate.entered
      t.state.current = false
      const calls = t.command.mock.calls.length
      gate.release()
      await work
      expect(t.command.mock.calls).toHaveLength(calls)
      expect(t.state.playlist[0]).toEqual(ordinary()[0])
      t.idle()
    },
  )

  for (const [kind, failureIndex, cleanupPoints] of [
    ['silence', 13, [14, 15, 16, 17]],
    ['soft', 11, [12, 13, 14]],
  ] as const) {
    it.each(cleanupPoints)(
      `${kind}: preserves compensation error precedence at command %i and releases markers`,
      async (index) => {
        const t = setup()
        const cleanupFailure = new Error('compensation failed')
        t.state.before = async (call) => {
          if (call.index === failureIndex) throw new Error('end failed')
          if (call.index === index) throw cleanupFailure
        }
        await expect(t.run(kind)).rejects.toBe(cleanupFailure)
        const trimmed = { path: 'b.flac', start: '0.1' }
        const expected =
          kind === 'silence'
            ? {
                14: [ordinary()[0], trimmed],
                15: [...ordinary().slice(0, 1), trimmed, ordinary()[1]],
                16: [...ordinary(), trimmed],
                17: ordinary(),
              }[index]
            : index === 12
              ? [
                  ordinary()[0],
                  { path: 'bridge.wav', start: '0' },
                  { path: 'b.flac', start: '1.1' },
                ]
              : [ordinary()[0]]
        expect(t.state.playlist).toEqual(expected)
        expect(t.state.end).toBe('none')
        expect(t.transition()).toBeNull()
        t.idle()
      },
    )
  }

  it.each([12, 13])(
    'soft: finishes the existing compensation sequence after cancellation at command %i',
    async (index) => {
      const t = setup()
      const failure = new Error('end failed')
      t.state.before = async (call) => {
        if (call.index === 11) throw failure
      }
      const gate = t.pause(index)
      const work = expect(t.run('soft')).rejects.toBe(failure)
      await gate.entered
      t.state.current = false
      // A new request uses the same queue, so its replacement follows the old
      // clear/end/append compensation sequence even if cancellation arrives here.
      const next = t.runtime.enqueue(async () => {
        expect(t.state.playlist).toEqual(ordinary())
        expect(t.state.end).toBe('none')
        await t.client.command('loadfile', 'new.flac', 'replace', -1, {})
      })
      gate.release()
      await work
      await next
      expect(t.state.playlist).toEqual([{ path: 'new.flac', start: '0' }])
      t.idle()
    },
  )

  it.each(['get_property', 'loadfile'])(
    'propagates interrupted-load %s failure without taking file ownership',
    async (name) => {
      const t = setup()
      const gate = t.pause(7)
      const work = t.run('soft')
      await gate.entered
      t.advance()
      gate.release()
      await work
      await t.cleanup()
      const failure = new Error('recovery failed')
      t.state.before = async (call) => {
        if (call.name === name) throw failure
      }
      await expect(t.updater.recoverInterruptedLoad(1, t.client)).rejects.toBe(failure)
      expect(t.updater.hasInterruptedLoad).toBe(name === 'get_property')
      expect(t.state.playlist).toEqual([{ path: 'bridge.wav', start: '0' }])
      t.idle()
    },
  )

  it.each(['before-clear', 'after-clear'] as const)(
    'revalidates the session during start-file cleanup: %s',
    async (point) => {
      const t = setup()
      const gate = t.pause(4)
      const work = t.run('silence')
      await gate.entered
      t.advance()
      if (point === 'before-clear') t.runtime.begin(2)
      else
        t.state.after = async ({ name }) => {
          if (name === 'playlist-clear') t.runtime.begin(2)
        }
      gate.release()
      await work
      await t.cleanup()
      expect(t.command.mock.calls.some(([name]) => name === 'set_property')).toBe(false)
      expect(t.command.mock.calls.some(([name]) => name === 'playlist-clear')).toBe(
        point === 'after-clear',
      )
      t.idle()
    },
  )

  it('propagates start-file compensation failure and releases update markers', async () => {
    const t = setup()
    const gate = t.pause(4)
    const work = t.run('silence')
    await gate.entered
    t.advance()
    const failure = new Error('clear failed')
    t.state.before = async ({ name }) => {
      if (name === 'playlist-clear') throw failure
    }
    const cleanup = expect(t.cleanup()).rejects.toBe(failure)
    gate.release()
    await work
    await cleanup
    t.idle()
  })

  it('does not restore an interrupted bridge into a replacement session', async () => {
    const t = setup()
    const gate = t.pause(7)
    const work = t.run('soft')
    await gate.entered
    t.advance()
    gate.release()
    await work
    await t.cleanup()
    const entered = deferred()
    const release = deferred()
    t.state.after = async ({ name, args }) => {
      if (name === 'get_property' && args[0] === 'path') {
        entered.resolve()
        await release.promise
      }
    }
    const recover = t.updater.recoverInterruptedLoad(1, t.client)
    await entered.promise
    t.runtime.begin(2)
    t.updater.reset()
    t.state.playlist = [{ path: 'new-session.flac', start: '0' }]
    release.resolve()
    await expect(recover).resolves.toBe(true)
    expect(t.state.playlist).toEqual([{ path: 'new-session.flac', start: '0' }])
    expect(t.updater.hasInterruptedLoad).toBe(false)
    t.idle()
  })
})
