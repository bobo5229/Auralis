import { BackgroundRender, MeshGradientRenderer } from '@applemusic-like-lyrics/core'
import { createArtworkBackgroundSession } from '../../../src/renderer/features/playback/components/artworkBackgroundSession.ts'
import { extractArtworkPalette } from '../../../src/renderer/features/playback/utils/extractArtworkPalette.ts'
import { toLiquidMetalPalette } from '../../../src/renderer/features/playback/runtime/liquidMetalPalette.ts'
import { DEFAULT_LIQUID_METAL_SETTINGS } from '../../../src/renderer/features/playback/runtime/liquidMetalSettings.ts'
import { createMorphRenderer } from './renderer.mjs'

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]
const canvas = $('#background')
const motion = matchMedia('(prefers-reduced-motion: reduce)')
const samples = {
  dusk: { name: '暮色', colors: ['#202e42', '#b69575', '#bd6648', '#403b54'] },
  tide: { name: '海潮', colors: ['#152c3b', '#3d8b99', '#b6b6a3', '#355566'] },
  ember: { name: '余烬', colors: ['#301c28', '#d58145', '#a83639', '#98706b'] },
}
let renderer, flow, session
let ready = false,
  disposed = false,
  frozen = false,
  slow = false,
  cycling = false
let frame = 0,
  time = 9,
  previousTick = 0,
  phase = 0,
  target = 0
let transition = null,
  cycleAfter = 0,
  artworkToken = 0
let duration = 0.95,
  objectUrl = null,
  sampleName = '暮色'
let uploadedFrame = false,
  dirty = true
let flowFrameCount = 0
let previousFrameContinuous = false
const intervals = [],
  renderTimes = []

function showError(error) {
  $('#error').hidden = false
  $('#error').textContent = error instanceof Error ? error.message : String(error)
  $('#status').textContent = '演示无法继续'
  ready = false
  cycling = false
  $$('button, input:not([type="file"])').forEach((element) => (element.disabled = true))
  flow?.pause()
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  console.error(error)
}

function coverSvg(colors) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><defs><linearGradient id="g" x2=".7" y2="1"><stop stop-color="${colors[0]}"/><stop offset=".55" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></linearGradient><radialGradient id="r"><stop stop-color="${colors[3]}"/><stop offset="1" stop-color="${colors[3]}" stop-opacity="0"/></radialGradient></defs><rect width="640" height="640" fill="url(#g)"/><circle cx="430" cy="190" r="280" fill="url(#r)"/><path d="M-80 400 Q240 110 520 420 T840 360" fill="none" stroke="${colors[0]}" stroke-opacity=".48" stroke-width="120"/><path d="M-80 520 Q300 310 730 520" fill="none" stroke="${colors[1]}" stroke-opacity=".38" stroke-width="90"/><circle cx="310" cy="296" r="78" fill="none" stroke="#fff" stroke-opacity=".48" stroke-width="1"/><circle cx="310" cy="296" r="3" fill="#fff" fill-opacity=".65"/><path d="M310 186v220M200 296h220" stroke="#fff" stroke-opacity=".25" stroke-width="1"/></svg>`
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('封面无法加载，请选择另一张图片。'))
    image.src = url
  })
}

async function setArtwork(url, name, key) {
  const token = ++artworkToken
  const image = await loadImage(url)
  if (disposed || token !== artworkToken) return
  const sampler = document.createElement('canvas')
  sampler.width = sampler.height = 48
  const context = sampler.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0, 48, 48)
  const palette = extractArtworkPalette(key, context.getImageData(0, 0, 48, 48).data)
  await session.setAlbum(image)
  if (disposed || token !== artworkToken) return
  renderer.setPalette(toLiquidMetalPalette(palette))
  $('#artwork').src = url
  $('#artwork').alt = `${name}演示封面`
  $('#artwork-title').textContent = name
  sampleName = name
  $$('[data-sample]').forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset.sample === key)),
  )
  dirty = true
  syncFlow()
  requestFrame()
}

async function setSample(key) {
  const sample = samples[key]
  await setArtwork(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(coverSvg(sample.colors))}`,
    sample.name,
    key,
  )
}

function syncFlow() {
  if (!flow) return
  flow.setStaticMode(frozen || motion.matches)
  if (document.hidden || disposed || (phase === 1 && !transition && !cycling)) flow.pause()
  else flow.resume()
}

function updateUi() {
  $('#cycle').disabled = !ready || motion.matches
  $('#phase').value = String(phase)
  $('#phase-value').textContent = `${Math.round(phase * 100)}%`
  $$('[data-mode]').forEach((button) =>
    button.setAttribute('aria-pressed', String(Number(button.dataset.mode) === target)),
  )
  $('#status').textContent = motion.matches
    ? '已减少动态效果'
    : transition
      ? target === 1
        ? '色彩正在凝结'
        : '金属正在柔化'
      : phase === 0
        ? '流光'
        : phase === 1
          ? '液态金属'
          : '停留在演化中间'
}

function requestFrame() {
  if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(tick)
}

function goTo(value) {
  if (!ready) return
  target = value
  cycleAfter = 0
  if (motion.matches) {
    phase = target
    transition = null
  } else
    transition = {
      from: phase,
      to: target,
      started: performance.now(),
      ms: duration * 1000 * (slow ? 3 : 1) * Math.max(0.08, Math.abs(target - phase)),
    }
  dirty = true
  syncFlow()
  updateUi()
  requestFrame()
}

function tick(now) {
  frame = 0
  if (disposed || document.hidden) return
  const elapsed = previousTick ? now - previousTick : 0
  if (elapsed > 0 && previousFrameContinuous) {
    intervals.push(elapsed)
    if (intervals.length > 180) intervals.shift()
  }
  if (!frozen && !motion.matches)
    time += Math.min(elapsed / 1000, 0.05) * DEFAULT_LIQUID_METAL_SETTINGS.speed
  previousTick = now
  previousFrameContinuous = !!transition || (!frozen && !motion.matches)
  if (transition) {
    const ratio = Math.min(1, (now - transition.started) / transition.ms)
    const eased = ratio * ratio * ratio * (ratio * (ratio * 6 - 15) + 10)
    phase = transition.from + (transition.to - transition.from) * eased
    dirty = true
    if (ratio === 1) {
      phase = target
      transition = null
      cycleAfter = now + 1800
      syncFlow()
    }
  } else if (cycling && !motion.matches && now >= cycleAfter) goTo(target === 1 ? 0 : 1)
  if (dirty || uploadedFrame || (!frozen && !motion.matches)) {
    const started = performance.now()
    renderer.render({ phase, time })
    renderTimes.push(performance.now() - started)
    if (renderTimes.length > 180) renderTimes.shift()
    dirty = uploadedFrame = false
  }
  updateUi()
  if (transition || cycling || (!frozen && !motion.matches)) requestFrame()
}

function setFrozen(value) {
  frozen = value
  $('#freeze').setAttribute('aria-pressed', String(frozen))
  $('#freeze').textContent = frozen ? '继续背景' : '停住背景'
  previousTick = 0
  syncFlow()
  requestFrame()
}

function setPhase(value) {
  cycling = false
  $('#cycle').setAttribute('aria-pressed', 'false')
  transition = null
  phase = Math.max(0, Math.min(1, value))
  target = phase >= 0.5 ? 1 : 0
  dirty = true
  syncFlow()
  updateUi()
  requestFrame()
}

async function initialize() {
  renderer = createMorphRenderer(canvas)
  canvas.addEventListener('morph-error', (event) => showError(event.detail))
  // Capture the real flow renderer synchronously after its draw, avoiding the
  // empty canvas that can occur when copying a cleared WebGL framebuffer.
  class CapturedMeshGradientRenderer extends MeshGradientRenderer {
    onRedraw(...args) {
      const result = super.onRedraw(...args)
      if (renderer.uploadFlow(this.canvas)) {
        flowFrameCount++
        uploadedFrame = true
        requestFrame()
      }
      return result
    }
  }
  flow = BackgroundRender.new(CapturedMeshGradientRenderer)
  const source = flow.getElement()
  source.style.zIndex = '0'
  $('#flow-source').append(source)
  flow.setRenderScale(0.5)
  flow.setFlowSpeed(1.6)
  flow.setFPS(60)
  flow.setLowFreqVolume(0)
  session = createArtworkBackgroundSession(flow)
  await setSample('dusk')
  // Wait for an actual source frame; no black frame is shown as a ready state.
  const started = performance.now()
  while (flowFrameCount === 0) {
    if (performance.now() - started > 10000) throw new Error('背景准备超时，请重新打开演示。')
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  ready = true
  $$('button, input:not([type="file"])').forEach((element) => (element.disabled = false))
  $('#cycle').disabled = motion.matches
  requestFrame()
  window.morphDemo = {
    get ready() {
      return ready
    },
    goTo,
    setPhase,
    setFrozen,
    setSample,
    diagnostics() {
      return {
        phase,
        target,
        frozen,
        transitioning: !!transition,
        sample: sampleName,
        reducedMotion: motion.matches,
        time,
        ...renderer.diagnostics(),
        frameIntervalP95: percentile(intervals, 0.95),
        renderCpuP95: percentile(renderTimes, 0.95),
      }
    },
    verifyMetalEndpoint: () => renderer.verifyMetalEndpoint(),
  }
}

function percentile(values, ratio) {
  return [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * ratio)] ?? 0
}

$$('[data-mode]').forEach((button) =>
  button.addEventListener('click', () => goTo(Number(button.dataset.mode))),
)
$$('[data-sample]').forEach((button) =>
  button.addEventListener('click', () => setSample(button.dataset.sample).catch(showError)),
)
$('#phase').addEventListener('input', (event) => setPhase(Number(event.target.value)))
$('#duration').addEventListener('input', (event) => {
  duration = Number(event.target.value)
  $('#duration-value').textContent = `${duration.toFixed(2)}s`
})
$('#freeze').addEventListener('click', () => setFrozen(!frozen))
$('#slow').addEventListener('click', () => {
  slow = !slow
  $('#slow').setAttribute('aria-pressed', String(slow))
})
$('#cycle').addEventListener('click', () => {
  cycling = !cycling
  $('#cycle').setAttribute('aria-pressed', String(cycling))
  if (cycling) goTo(target === 1 ? 0 : 1)
})
$('#choose-artwork').addEventListener('click', () => $('#artwork-file').click())
$('#artwork-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  const url = URL.createObjectURL(file)
  try {
    await setArtwork(url, '本地封面', 'local')
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = url
  } catch (error) {
    URL.revokeObjectURL(url)
    showError(error)
  }
  event.target.value = ''
})
addEventListener('resize', () => {
  renderer?.resize()
  dirty = true
  requestFrame()
})
document.addEventListener('visibilitychange', () => {
  previousTick = 0
  // Finish an interrupted demonstration when returning; no elapsed hidden time
  // is applied to the evolving surface or used to trigger a burst of cycles.
  if (transition) {
    phase = target
    transition = null
    dirty = true
  }
  cycleAfter = performance.now() + 1800
  if (document.hidden && frame) {
    cancelAnimationFrame(frame)
    frame = 0
  }
  syncFlow()
  requestFrame()
})
motion.addEventListener('change', () => {
  transition = null
  phase = target
  cycling = false
  dirty = true
  $('#cycle').disabled = motion.matches
  $('#cycle').setAttribute('aria-pressed', 'false')
  syncFlow()
  requestFrame()
})
addEventListener('pagehide', () => {
  disposed = true
  artworkToken++
  cancelAnimationFrame(frame)
  session?.dispose()
  renderer?.dispose()
  if (objectUrl) URL.revokeObjectURL(objectUrl)
})
initialize().catch(showError)
