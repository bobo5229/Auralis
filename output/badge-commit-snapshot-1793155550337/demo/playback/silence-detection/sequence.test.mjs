import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import './sequence.js'

const { sequence } = JSON.parse(
  await readFile(
    new URL('../../../.electron-home/silence-detection-demo/report.json', import.meta.url),
    'utf8',
  ),
)
function setup(resume = async () => {}) {
  const nodes = []
  const gains = []
  const context = {
    currentTime: 5,
    resume,
    createGain() {
      const gain = {
        values: [],
        curves: [],
        disconnected: false,
        connect() {},
        disconnect() {
          this.disconnected = true
        },
      }
      gain.gain = {
        setValueAtTime: (value, time) => gain.values.push({ value, time }),
        setValueCurveAtTime: (curve, time, duration) => gain.curves.push({ curve, time, duration }),
      }
      gains.push(gain)
      return gain
    },
    createBufferSource() {
      const node = {
        onended: null,
        started: null,
        stopped: false,
        disconnected: false,
        connect() {},
        start(...args) {
          this.started = args
        },
        stop() {
          this.stopped = true
        },
        disconnect() {
          this.disconnected = true
        },
      }
      nodes.push(node)
      return node
    },
  }
  const changes = []
  const player = globalThis.createSilenceSequence({
    context,
    destination: {},
    first: { duration: sequence.first.duration },
    second: { duration: sequence.second.duration },
    cutEnd: sequence.cutEnd,
    onChange: (state) => changes.push(state),
  })
  return { player, nodes, gains, context, changes }
}

for (const skip of [false, true]) {
  test(`schedules A and B together with an exact boundary, skip=${skip}`, async () => {
    const t = setup()
    await t.player.play(skip ? 'skip' : 'original')
    const aDuration = skip ? sequence.cutEnd : sequence.first.duration
    assert.equal(t.nodes.length, 2)
    assert.deepEqual(t.nodes[0].started, [5.05, 0, aDuration])
    assert.deepEqual(t.nodes[1].started, [5.05 + aDuration])
    assert.equal(t.player.snapshot().totalDuration, aDuration + sequence.second.duration)
    t.context.currentTime = 5.05 + aDuration - 1 / 48000
    assert.equal(t.player.snapshot().track, 'A')
    t.context.currentTime = 5.05 + aDuration + 1 / 48000
    assert.equal(t.player.snapshot().track, 'B')
  })
}

test('stopping before resume finishes does not start either source', async () => {
  let finish
  const t = setup(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = t.player.play('skip')
  assert.equal(t.player.snapshot().state, 'preparing')
  t.player.stop()
  finish()
  assert.equal(await pending, false)
  assert.equal(t.nodes.length, 0)
  assert.equal(t.player.snapshot().state, 'idle')
})

test('stopping cancels both scheduled sources and ignores a late end event', async () => {
  const t = setup()
  await t.player.play('skip')
  const oldEnded = t.nodes[1].onended
  t.player.stop()
  assert(t.nodes.every((node) => node.stopped && node.disconnected))
  assert(t.gains.every((gain) => gain.disconnected))
  oldEnded()
  assert.equal(t.player.snapshot().state, 'idle')
})

test('replaying replaces both old sources and keeps stale events out of the new run', async () => {
  const t = setup()
  await t.player.play('original')
  const oldEnded = t.nodes[1].onended
  await t.player.play('skip')
  oldEnded()
  assert.equal(t.player.snapshot().state, 'playing')
  assert(t.nodes.slice(0, 2).every((node) => node.stopped && node.disconnected))
  assert.equal(t.nodes[3].started[0], t.nodes[2].started[0] + sequence.cutEnd)
})

test('completion belongs to B and leaves the position at the sequence end', async () => {
  const t = setup()
  await t.player.play('skip')
  t.nodes[1].onended()
  assert.equal(t.player.snapshot().state, 'ended')
  assert.equal(t.player.snapshot().time, sequence.cutEnd + sequence.second.duration)
  assert(t.nodes.every((node) => node.disconnected))
})

test('a rejected audio resume returns the player to idle', async () => {
  const t = setup(async () => {
    throw new Error('resume denied')
  })
  await assert.rejects(t.player.play('skip'), /resume denied/)
  assert.equal(t.player.snapshot().state, 'idle')
  assert.equal(t.nodes.length, 0)
})

test('a cancelled resume failure cannot interrupt a newer run', async () => {
  let reject
  const t = setup(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  const old = t.player.play('original')
  t.player.stop()
  t.context.resume = async () => {}
  await t.player.play('skip')
  reject(new Error('stale failure'))
  assert.equal(await old, false)
  assert.equal(t.player.snapshot().state, 'playing')
})

test('crossfade overlaps the musical endpoints and schedules complementary gain envelopes', async () => {
  const t = setup()
  await t.player.play('crossfade', 2)
  const plan = globalThis.silenceSequencePlan({
    mode: 'crossfade',
    firstDuration: sequence.first.duration,
    secondDuration: sequence.second.duration,
    cutEnd: sequence.cutEnd,
    fadeSeconds: 2,
  })
  assert(plan.overlap > 1.99 && plan.overlap <= 2)
  assert.equal(t.nodes[1].started[0], t.nodes[0].started[0] + plan.secondStart)
  assert.equal(t.nodes[0].started[2], sequence.cutEnd)
  assert.equal(t.player.snapshot().totalDuration, plan.totalDuration)
  const outgoing = t.gains[0].curves[0]
  const incoming = t.gains[1].curves[0]
  assert.equal(outgoing.time, t.nodes[1].started[0])
  assert.equal(incoming.time, outgoing.time)
  assert.equal(outgoing.duration, plan.overlap)
  assert.equal(incoming.duration, plan.overlap)
  assert.equal(outgoing.curve[0], 1)
  assert.equal(incoming.curve[0], 0)
  assert.equal(outgoing.curve.at(-1), 0)
  assert.equal(incoming.curve.at(-1), 1)
  for (let i = 0; i < incoming.curve.length; i++) {
    assert(Math.abs(outgoing.curve[i] + incoming.curve[i] - 1) < 0.000001)
    if (i) {
      assert(incoming.curve[i] >= incoming.curve[i - 1])
      assert(outgoing.curve[i] <= outgoing.curve[i - 1])
    }
  }
  t.context.currentTime = t.nodes[1].started[0] + plan.overlap / 2
  assert.equal(t.player.snapshot().track, 'A+B')
  t.context.currentTime = t.nodes[0].started[0] + sequence.cutEnd + 1 / 48000
  assert.equal(t.player.snapshot().track, 'B')
  t.player.stop()
  assert(t.nodes.every((node) => node.stopped))
  assert(t.gains.every((gain) => gain.disconnected))
})

test('direct and original modes leave both volume gains at one', async () => {
  for (const mode of ['skip', 'original']) {
    const t = setup()
    await t.player.play(mode)
    assert(t.gains.every((gain) => gain.curves.length === 0 && gain.values[0].value === 1))
  }
})

test('short clips limit overlap so both clips retain a non-overlapping portion', () => {
  const plan = globalThis.silenceSequencePlan({
    mode: 'crossfade',
    firstDuration: 4,
    secondDuration: 1,
    cutEnd: 2,
    fadeSeconds: 6,
  })
  assert.equal(plan.overlap, 0.5)
  assert.equal(plan.secondStart, 1.5)
  assert.equal(plan.totalDuration, 2.5)
})

test('rejects unsupported modes and invalid crossfade durations before scheduling audio', async () => {
  for (const seconds of [0, -1, NaN, Infinity]) {
    const t = setup()
    await assert.rejects(t.player.play('crossfade', seconds), /Invalid crossfade duration/)
    assert.equal(t.nodes.length, 0)
    assert.equal(t.player.snapshot().state, 'idle')
  }
  await assert.rejects(setup().player.play('unknown'), /Unknown playback mode/)
})
