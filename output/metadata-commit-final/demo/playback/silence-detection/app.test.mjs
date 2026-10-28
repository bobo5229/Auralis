import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
const root = new URL('../../../', import.meta.url)
const text = async (path) => readFile(new URL(path, root), 'utf8')
const [app, sequence, html, json] = await Promise.all([
  text('demo/playback/silence-detection/app.js'),
  text('demo/playback/silence-detection/sequence.js'),
  text('demo/playback/silence-detection/index.html'),
  text('.electron-home/silence-detection-demo/report.json'),
])
const report = JSON.parse(json)
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function setup({
  resume = async () => {},
  failStart = false,
  failBuffer = false,
  failGain = false,
} = {}) {
  class Element {
    constructor(id) {
      this.id = id
      this.listeners = new Map()
      this.children = []
      this.dataset = {}
      this.textContent = ''
      this.pauseCount = 0
      this.disabled = false
      this.classes = new Set()
      this.classList = {
        toggle: (name, enabled) => (enabled ? this.classes.add(name) : this.classes.delete(name)),
      }
    }
    addEventListener(name, fn) {
      this.listeners.set(name, [...(this.listeners.get(name) || []), fn])
    }
    emit(name, event = { target: this }) {
      return Promise.all((this.listeners.get(name) || []).map((fn) => fn(event)))
    }
    append(...nodes) {
      this.children.push(...nodes)
    }
    replaceChildren(...nodes) {
      this.children = nodes
    }
    setAttribute(name, value) {
      this[name] = value
    }
    pause() {
      this.pauseCount++
    }
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
  const elements = new Map(ids.map((id) => [id, new Element(id)]))
  const modes = ['crossfade', 'skip', 'original'].map((value, i) =>
    Object.assign(new Element(value), { value, checked: !i }),
  )
  elements.get('sequence-volume').value = '0.35'
  const contexts = []
  class Context {
    constructor() {
      this.currentTime = 5
      this.sources = []
      this.gains = []
      this.destination = {}
      this.closed = false
      contexts.push(this)
    }
    resume() {
      return resume()
    }
    async close() {
      this.closed = true
    }
    createBuffer(channels, frames, sampleRate) {
      this.bufferCalls = (this.bufferCalls || 0) + 1
      if (typeof failBuffer === 'function' ? failBuffer(this.bufferCalls) : failBuffer)
        throw new Error('buffer allocation failed')
      return { duration: frames / sampleRate, getChannelData: () => new Float32Array(frames) }
    }
    createGain() {
      if (failGain) throw new Error('gain allocation failed')
      const gain = {
        connected: false,
        disconnected: false,
        gain: { value: 1, setValueAtTime() {}, setValueCurveAtTime() {} },
        connect() {
          this.connected = true
        },
        disconnect() {
          this.disconnected = true
        },
      }
      this.gains.push(gain)
      return gain
    }
    createBufferSource() {
      const source = {
        onended: null,
        started: null,
        stopped: false,
        disconnected: false,
        connect() {},
        disconnect() {
          this.disconnected = true
        },
        start(...args) {
          if (failStart) throw new Error('start failed')
          this.started = args
        },
        stop() {
          this.stopped = true
        },
      }
      this.sources.push(source)
      return source
    }
  }
  const frames = new Map()
  let next = 0
  const sandbox = vm.createContext({
    SILENCE_DEMO_REPORT: report,
    document: {
      getElementById: (id) => elements.get(id),
      querySelectorAll: () => modes,
      documentElement: { dataset: {} },
      createElement: (tag) => new Element(tag),
      createElementNS: (_ns, tag) => new Element(tag),
    },
    window: { AudioContext: Context },
    atob,
    requestAnimationFrame: (fn) => {
      frames.set(++next, fn)
      return next
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    console,
  })
  vm.runInContext(sequence, sandbox)
  vm.runInContext(app, sandbox)
  return {
    elements,
    modes,
    contexts,
    frames,
    sandbox,
    async click(id) {
      await elements.get(id).emit('click')
    },
    frame() {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((fn) => fn())
    },
  }
}

test('app: loading the real scripts creates no audio context or scheduled frame', () => {
  const t = setup()
  assert.equal(t.contexts.length, 0)
  assert.equal(t.frames.size, 0)
  assert.equal(t.elements.get('sequence-play').disabled, false)
  assert.equal(t.elements.get('sequence-stop').disabled, true)
})
for (const cancel of ['stop', 'original', 'preview', 'sample']) {
  test(`app: ${cancel} cancels preparation without allowing resumed sources`, async () => {
    const gate = deferred()
    const t = setup({ resume: () => gate.promise })
    const play = t.click('sequence-play')
    assert.equal(t.elements.get('sequence-play').disabled, true)
    assert.equal(t.elements.get('sequence-stop').disabled, false)
    assert(t.modes.every((mode) => mode.disabled))
    if (cancel === 'stop') await t.click('sequence-stop')
    else if (cancel === 'sample') await t.elements.get('samples').children[1].emit('click')
    else await t.elements.get(cancel).emit('play')
    gate.resolve()
    await play
    assert.equal(t.contexts[0].sources.length, 0)
    assert.equal(t.frames.size, 0)
    assert.equal(t.elements.get('sequence-play').disabled, false)
    assert.equal(t.elements.get('sequence-stop').disabled, true)
    assert(t.modes.every((mode) => !mode.disabled))
  })
}

test('app: completion/replay/stop use one context, ignore stale callbacks, and release sequence nodes', async () => {
  const t = setup()
  await t.click('sequence-play')
  const context = t.contexts[0]
  assert.equal(context.sources.length, 2)
  assert.equal(t.frames.size, 1)
  context.currentTime = context.sources[1].started[0] + 0.5
  t.frame()
  assert(t.elements.get('sequence-a').classes.has('is-playing'))
  assert(t.elements.get('sequence-b').classes.has('is-playing'))
  const stale = context.sources[1].onended
  stale()
  assert.equal(t.elements.get('sequence-status').textContent, '两段播放完成')
  assert.equal(t.frames.size, 0)
  assert(context.sources.every((node) => node.disconnected))
  assert(context.gains.slice(1).every((node) => node.disconnected))
  await t.click('sequence-play')
  stale()
  assert.equal(t.contexts.length, 1)
  assert.equal(t.elements.get('sequence-play').disabled, true)
  await t.click('sequence-stop')
  assert.equal(t.frames.size, 0)
  assert(context.sources.slice(2).every((node) => node.stopped && node.disconnected))
  assert(context.gains.slice(3).every((node) => node.disconnected))
})

test('app: resume failure restores controls and permits a later retry', async () => {
  let denied = true
  const t = setup({
    resume: async () => {
      if (denied) throw new Error('resume denied')
    },
  })
  await t.click('sequence-play')
  assert.match(t.elements.get('sequence-status').textContent, /播放失败：resume denied/)
  assert.equal(t.elements.get('sequence-play').disabled, false)
  assert(t.modes.every((mode) => !mode.disabled))
  denied = false
  await t.click('sequence-play')
  assert.equal(t.contexts[0].sources.length, 2)
  assert.equal(t.elements.get('sequence-play').disabled, true)
  await t.click('sequence-stop')
})

test('app: start failure stops/disconnects all sources and restores controls', async () => {
  const t = setup({ failStart: true })
  await t.click('sequence-play')
  assert.match(t.elements.get('sequence-status').textContent, /start failed/)
  assert(t.contexts[0].sources.every((node) => node.stopped && node.disconnected))
  assert(t.contexts[0].gains.slice(1).every((node) => node.disconnected))
  assert.equal(t.frames.size, 0)
  assert.equal(t.elements.get('sequence-play').disabled, false)
})

test('app: selecting media while playing stops the sequence, source cleanup, and animation', async () => {
  for (const media of ['original', 'preview']) {
    const t = setup()
    await t.click('sequence-play')
    const other = media === 'original' ? 'preview' : 'original'
    const pauses = t.elements.get(other).pauseCount
    await t.elements.get(media).emit('play')
    assert(t.elements.get(other).pauseCount > pauses)
    assert(t.contexts[0].sources.every((node) => node.stopped && node.disconnected))
    assert.equal(t.frames.size, 0)
  }
})

test('app: repeated buffer failures close contexts and disconnect unpublished gains', async () => {
  const t = setup({ failBuffer: true })
  await t.click('sequence-play')
  await t.click('sequence-play')
  assert.equal(t.contexts.length, 2)
  assert(t.contexts.every((context) => context.closed && context.gains[0].disconnected))
  assert(t.contexts.every((context) => context.sources.length === 0))
  assert.match(t.elements.get('sequence-status').textContent, /buffer allocation failed/)
  assert.equal(t.elements.get('sequence-play').disabled, false)
  const volume = t.elements.get('sequence-volume')
  volume.value = '0.8'
  await volume.emit('input')
  assert(t.contexts.every((context) => context.gains[0].gain.value === 0.35))
})

test('app: failure on the second buffer cleans up and permits a successful retry', async () => {
  let fail = true
  const t = setup({ failBuffer: (call) => fail && call === 2 })
  await t.click('sequence-play')
  assert.equal(t.contexts[0].bufferCalls, 2)
  assert.equal(t.contexts[0].closed, true)
  assert.equal(t.contexts[0].gains[0].disconnected, true)
  fail = false
  await t.click('sequence-play')
  assert.equal(t.contexts.length, 2)
  assert.equal(t.contexts[1].closed, false)
  assert.equal(t.contexts[1].sources.length, 2)
  assert.equal(t.elements.get('sequence-play').disabled, true)
  const volume = t.elements.get('sequence-volume')
  volume.value = '0.8'
  await volume.emit('input')
  assert.equal(t.contexts[0].gains[0].gain.value, 0.35)
  assert.equal(t.contexts[1].gains[0].gain.value, 0.8)
  await t.click('sequence-stop')
  await t.click('sequence-play')
  assert.equal(t.contexts.length, 2)
  assert.equal(t.contexts[1].closed, false)
  await t.click('sequence-stop')
})

test('app: gain creation failure still closes the newly created context', async () => {
  const t = setup({ failGain: true })
  await t.click('sequence-play')
  assert.equal(t.contexts.length, 1)
  assert.equal(t.contexts[0].closed, true)
  assert.equal(t.contexts[0].sources.length, 0)
  assert.match(t.elements.get('sequence-status').textContent, /gain allocation failed/)
  assert.equal(t.elements.get('sequence-play').disabled, false)
})
