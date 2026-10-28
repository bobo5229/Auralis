/* global SILENCE_DEMO_REPORT, createSilenceSequence, silenceSequencePlan */
;(() => {
  const find = (id) => document.getElementById(id)
  const theme = find('theme')
  theme.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark'
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    theme.textContent = dark ? '切换浅色' : '切换深色'
  })
  if (typeof SILENCE_DEMO_REPORT === 'undefined') return
  const report = SILENCE_DEMO_REPORT
  const seconds = (value) => `${value.toFixed(2)} 秒`
  const media = (name) => `../../../.electron-home/silence-detection-demo/${name}`
  find('missing').hidden = true
  find('demo').hidden = false
  find('threshold').textContent = `${report.parameters.noiseDb} dBFS`
  find('minimum').textContent = `${report.parameters.minimumSeconds} 秒`
  find('padding').textContent = `${report.parameters.paddingSeconds} 秒`
  find('test-status').textContent =
    `${report.passed} 项检测 · ${report.sequencePassed} 项衔接验证通过`

  const original = find('original')
  const preview = find('preview')
  const pair = report.sequence
  let sequence = null
  let gain = null
  let animation = 0
  const modeInputs = [...document.querySelectorAll('[name="sequence-mode"]')]
  const selectedMode = () => modeInputs.find((input) => input.checked).value
  const selectedPlan = () =>
    silenceSequencePlan({
      mode: selectedMode(),
      firstDuration: pair.first.duration,
      secondDuration: pair.second.duration,
      cutEnd: pair.cutEnd,
      fadeSeconds: pair.fadeSeconds,
    })
  function updateSequence(snapshot) {
    const active = snapshot.state === 'playing' || snapshot.state === 'preparing'
    find('sequence-play').disabled = active
    find('sequence-stop').disabled = !active
    modeInputs.forEach((input) => {
      input.disabled = active
    })
    const total = snapshot.totalDuration || selectedPlan().totalDuration
    find('sequence-progress').max = total
    find('sequence-progress').value = snapshot.time
    find('sequence-time').textContent = `${seconds(snapshot.time)} / ${seconds(total)}`
    const status =
      snapshot.state === 'playing'
        ? snapshot.track === 'A+B'
          ? '交叉淡化：A 渐弱，B 渐强'
          : `正在播放片段 ${snapshot.track}`
        : snapshot.state === 'preparing'
          ? '准备播放…'
          : snapshot.state === 'ended'
            ? '两段播放完成'
            : '等待播放'
    if (find('sequence-status').textContent !== status) find('sequence-status').textContent = status
    find('sequence-a').classList.toggle(
      'is-playing',
      snapshot.state === 'playing' && snapshot.track.includes('A'),
    )
    find('sequence-b').classList.toggle(
      'is-playing',
      snapshot.state === 'playing' && snapshot.track.includes('B'),
    )
    cancelAnimationFrame(animation)
    if (snapshot.state === 'playing')
      animation = requestAnimationFrame(() => updateSequence(sequence.snapshot()))
  }
  function resetSequenceDisplay() {
    const plan = selectedPlan()
    find('sequence-summary').textContent =
      selectedMode() === 'crossfade'
        ? `跳过 ${seconds(pair.removed)} 尾部静音；A 的最后 ${seconds(plan.overlap)} 与 B 的开头重叠，总长 ${seconds(plan.totalDuration)}。`
        : selectedMode() === 'skip'
          ? `A 的声音结束后直接进入 B，跳过 ${seconds(pair.removed)} 尾部静音。`
          : '完整播放 A，等待末尾 3 秒静音后再进入 B。'
    updateSequence({ state: 'idle', time: 0, totalDuration: 0 })
  }
  function bufferFromPcm(context, entry) {
    const bytes = Uint8Array.from(atob(entry.pcmBase64), (char) => char.charCodeAt(0))
    const view = new DataView(bytes.buffer)
    const frames = bytes.length / (pair.channels * 2)
    const buffer = context.createBuffer(pair.channels, frames, pair.sampleRate)
    for (let channel = 0; channel < pair.channels; channel++) {
      const samples = buffer.getChannelData(channel)
      for (let frame = 0; frame < frames; frame++)
        samples[frame] = view.getInt16((frame * pair.channels + channel) * 2, true) / 32768
    }
    return buffer
  }
  function initializeSequence() {
    const Context = window.AudioContext || window.webkitAudioContext
    const context = new Context({ sampleRate: pair.sampleRate })
    let nextGain = null
    try {
      nextGain = context.createGain()
      nextGain.gain.value = Number(find('sequence-volume').value)
      nextGain.connect(context.destination)
      const nextSequence = createSilenceSequence({
        context,
        destination: nextGain,
        first: bufferFromPcm(context, pair.first),
        second: bufferFromPcm(context, pair.second),
        cutEnd: pair.cutEnd,
        onChange: updateSequence,
      })
      gain = nextGain
      return nextSequence
    } catch (error) {
      nextGain?.disconnect()
      void context.close().catch((cause) => {
        console.warn('Could not close the failed demo audio context', cause)
      })
      throw error
    }
  }
  find('sequence-play').addEventListener('click', async () => {
    original.pause()
    preview.pause()
    try {
      if (!sequence) sequence = initializeSequence()
      await sequence.play(selectedMode(), pair.fadeSeconds)
    } catch (error) {
      sequence?.stop()
      find('sequence-status').textContent = `播放失败：${error.message}`
    }
  })
  find('sequence-stop').addEventListener('click', () => sequence?.stop())
  find('sequence-volume').addEventListener('input', (event) => {
    if (gain) gain.gain.value = Number(event.target.value)
  })
  modeInputs.forEach((input) => input.addEventListener('change', resetSequenceDisplay))
  resetSequenceDisplay()
  original.volume = 0.35
  preview.volume = 0.35
  original.addEventListener('play', () => {
    preview.pause()
    sequence?.stop()
  })
  preview.addEventListener('play', () => {
    original.pause()
    sequence?.stop()
  })
  const buttons = []
  function svgElement(tag, attributes) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag)
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
    return element
  }
  function select(sample) {
    sequence?.stop()
    original.pause()
    preview.pause()
    original.src = media(sample.source)
    preview.src = media(sample.preview)
    preview.hidden = sample.allSilent
    for (const [button, id] of buttons)
      button.setAttribute('aria-current', String(id === sample.id))
    find('sample-title').textContent = sample.name
    find('description').textContent = sample.description
    find('result').textContent = sample.allSilent
      ? '整段静音'
      : sample.removed > 0.01
        ? '已跳过首尾空白'
        : '保留原样'
    find('original-duration').textContent = seconds(sample.duration)
    find('kept-duration').textContent = seconds(sample.kept)
    find('removed-duration').textContent = seconds(sample.removed)
    find('end-time').textContent = seconds(sample.duration)
    find('boundary').textContent = sample.allSilent
      ? '整段保留供检查'
      : `保留 ${seconds(sample.start)} → ${seconds(sample.end)}`
    find('preview-note').textContent = sample.allSilent
      ? '没有音乐段落，保留原音频供检查。'
      : '试听保留首尾余量后的副本。'

    const graph = find('waveform')
    graph.replaceChildren()
    const maximum = Math.max(0.02, ...sample.waveform)
    const points = sample.waveform
      .map((peak, i) => {
        const x = ((i + 0.5) / sample.waveform.length) * 720
        const height = (peak / maximum) * 42
        return `${x},${60 - height} ${x},${60 + height}`
      })
      .join(' ')
    graph.append(svgElement('polyline', { points, class: 'wave-line' }))
    for (const [start, end] of [
      [0, sample.start],
      [sample.end, sample.duration],
    ]) {
      if (end <= start) continue
      graph.append(
        svgElement('rect', {
          x: (start / sample.duration) * 720,
          y: 0,
          width: ((end - start) / sample.duration) * 720,
          height: 120,
          class: 'skip-area',
        }),
      )
    }
    for (const time of [sample.start, sample.end]) {
      const x = (time / sample.duration) * 720
      graph.append(svgElement('line', { x1: x, x2: x, y1: 0, y2: 120, class: 'cut-line' }))
    }
    find('intervals').replaceChildren()
    const intervals = sample.intervals.length ? sample.intervals : [null]
    for (const interval of intervals) {
      const item = document.createElement('li')
      item.textContent = interval
        ? `${seconds(interval.start)} → ${seconds(interval.end)}，持续 ${seconds(interval.end - interval.start)}`
        : '没有达到最短持续时间的静音。'
      find('intervals').append(item)
    }
  }
  for (const sample of report.samples) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'sample'
    const title = document.createElement('span')
    title.textContent = sample.name
    const duration = document.createElement('small')
    duration.textContent = `${sample.duration.toFixed(1)} s`
    button.append(title, duration)
    button.addEventListener('click', () => select(sample))
    buttons.push([button, sample.id])
    find('samples').append(button)
  }
  select(report.samples[0])
})()
