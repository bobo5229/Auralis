// Classic script so the demo also works when opened directly with file://.
globalThis.silenceSequencePlan = function ({
  mode,
  firstDuration,
  secondDuration,
  cutEnd,
  fadeSeconds = 2,
}) {
  if (!['original', 'skip', 'crossfade'].includes(mode)) throw new Error('Unknown playback mode')
  const end = mode === 'original' ? firstDuration : cutEnd
  if (mode === 'crossfade' && (!Number.isFinite(fadeSeconds) || fadeSeconds <= 0))
    throw new Error('Invalid crossfade duration')
  const overlap =
    mode === 'crossfade'
      ? Math.floor(Math.min(fadeSeconds, end / 2, secondDuration / 2) * 48000) / 48000
      : 0
  return {
    firstDuration: end,
    secondStart: end - overlap,
    overlap,
    totalDuration: end + secondDuration - overlap,
  }
}

globalThis.silenceFadeCurves = function () {
  const incoming = Float32Array.from(
    { length: 513 },
    (_, i) => (1 - Math.cos((Math.PI * i) / 512)) / 2,
  )
  const outgoing = Float32Array.from(incoming, (gain) => 1 - gain)
  return { incoming, outgoing }
}

globalThis.createSilenceSequence = function ({
  context,
  destination,
  first,
  second,
  cutEnd,
  onChange = () => {},
}) {
  let generation = 0
  let sources = []
  let outputs = []
  let state = 'idle'
  let anchor = 0
  let firstDuration = 0
  let totalDuration = 0
  let secondStart = 0
  let overlap = 0

  function snapshot() {
    const time =
      state === 'playing'
        ? Math.max(0, Math.min(totalDuration, context.currentTime - anchor))
        : state === 'ended'
          ? totalDuration
          : 0
    const track = time < secondStart ? 'A' : overlap > 0 && time < firstDuration ? 'A+B' : 'B'
    return { state, time, firstDuration, secondStart, overlap, totalDuration, track }
  }
  function stop() {
    generation++
    const previous = sources
    const previousOutputs = outputs
    sources = []
    outputs = []
    state = 'idle'
    for (const source of previous) {
      source.onended = null
      try {
        source.stop()
      } catch (error) {
        if (error.name !== 'InvalidStateError') throw error
      } finally {
        source.disconnect()
      }
    }
    previousOutputs.forEach((output) => output.disconnect())
    onChange(snapshot())
  }
  async function play(mode = 'crossfade', fadeSeconds = 2) {
    stop()
    const plan = globalThis.silenceSequencePlan({
      mode,
      firstDuration: first.duration,
      secondDuration: second.duration,
      cutEnd,
      fadeSeconds,
    })
    const token = generation
    state = 'preparing'
    onChange(snapshot())
    try {
      await context.resume()
    } catch (error) {
      if (token !== generation) return false
      stop()
      throw error
    }
    if (token !== generation) return false
    const a = context.createBufferSource()
    const b = context.createBufferSource()
    a.buffer = first
    b.buffer = second
    const aGain = context.createGain()
    const bGain = context.createGain()
    a.connect(aGain)
    b.connect(bGain)
    aGain.connect(destination)
    bGain.connect(destination)
    sources = [a, b]
    outputs = [aGain, bGain]
    // Schedule both sources on the audio clock; no timeupdate/ended hand-off.
    ;({ firstDuration, secondStart, overlap, totalDuration } = plan)
    anchor = context.currentTime + 0.05
    state = 'playing'
    b.onended = () => {
      if (token !== generation) return
      sources = []
      outputs = []
      a.disconnect()
      b.disconnect()
      aGain.disconnect()
      bGain.disconnect()
      state = 'ended'
      onChange(snapshot())
    }
    try {
      aGain.gain.setValueAtTime(1, anchor)
      bGain.gain.setValueAtTime(overlap ? 0 : 1, anchor)
      if (overlap) {
        const { incoming, outgoing } = globalThis.silenceFadeCurves()
        aGain.gain.setValueCurveAtTime(outgoing, anchor + secondStart, overlap)
        bGain.gain.setValueCurveAtTime(incoming, anchor + secondStart, overlap)
      }
      a.start(anchor, 0, firstDuration)
      b.start(anchor + secondStart)
    } catch (error) {
      stop()
      throw error
    }
    onChange(snapshot())
    return true
  }
  return { play, stop, snapshot }
}
