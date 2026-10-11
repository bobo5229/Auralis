import { fragmentSource } from '../../../src/renderer/features/playback/runtime/liquidMetalShader.ts'
import { DEFAULT_LIQUID_METAL_SETTINGS } from '../../../src/renderer/features/playback/runtime/liquidMetalSettings.ts'
import { makePalette, paletteFromFile } from '../liquid-metal/palette.js'
import { refinedFragmentSource } from './shader.js'
import { createSurface } from './renderer.js'

const $ = (selector) => document.querySelector(selector)
const presets = {
  alloy: [
    ['#91a9c4', 0.4],
    ['#c99142', 0.32],
    ['#633c14', 0.12],
    ['#dce8f2', 0.1],
    ['#1e324d', 0.06],
  ],
  espresso: [
    ['#234d88', 0.48],
    ['#b48a64', 0.32],
    ['#d9c7b5', 0.12],
    ['#241e2c', 0.08],
  ],
  silver: [['#ffffff', 1]],
  rose: [
    ['#b45e67', 0.45],
    ['#cd9c77', 0.3],
    ['#6f304c', 0.17],
    ['#f1d8bc', 0.08],
  ],
  dark: [['#25282d', 1]],
}
const defaults = { ...DEFAULT_LIQUID_METAL_SETTINGS, mirror: 1, depth: 0.85, detail: 0.32 }
const material = { ...defaults }
const motion = matchMedia('(prefers-reduced-motion: reduce)')
let palette, colors, weights, baseline, refined, observer
let time = 9,
  previous = 0,
  raf = 0,
  paused = motion.matches,
  disposed = false
let uploadToken = 0,
  view = 'both',
  clean = false
const sourceName = (key) => $('#preset').querySelector(`option[value="${key}"]`).textContent
const presetPalette = (key) =>
  makePalette(presets[key].map(([color, weight]) => ({ color, weight })))

function showError(message) {
  $('#error').textContent = message instanceof Error ? message.message : String(message)
  $('#error').hidden = false
}
function clearError() {
  $('#error').hidden = true
}
function draw() {
  if (disposed || !baseline || !refined || !colors) return
  if (view === 'both' && !clean) baseline.draw(time, material, colors, weights)
  refined.draw(time, material, colors, weights)
  $('#clock').textContent = `同步时间 ${time.toFixed(2)} s · ${paused ? '流动已暂停' : '实时流动'}`
}
function tick(now) {
  raf = 0
  if (disposed || paused || document.hidden || baseline.getState().lost || refined.getState().lost)
    return
  if (previous) time += Math.min((now - previous) / 1000, 0.05) * material.speed
  previous = now
  draw()
  raf = requestAnimationFrame(tick)
}
function sync() {
  cancelAnimationFrame(raf)
  raf = previous = 0
  $('#pause').textContent = paused ? '继续流动' : '暂停流动'
  $('#pause').setAttribute('aria-pressed', String(paused))
  draw()
  if (
    !disposed &&
    !paused &&
    !document.hidden &&
    !baseline.getState().lost &&
    !refined.getState().lost
  )
    raf = requestAnimationFrame(tick)
}
function onAvailability(available, error) {
  if (!available) showError(error || '图形上下文暂时不可用，正在等待恢复。')
  else if (!baseline.getState().lost && !refined.getState().lost) clearError()
  sync()
}
function updateControls() {
  document.querySelectorAll('[data-setting]').forEach((input) => {
    input.value = String(material[input.dataset.setting])
    $(`#${input.id}-value`).textContent = material[input.dataset.setting].toFixed(2)
  })
}
function applyPalette(next, name) {
  palette = next
  colors = new Float32Array(18)
  weights = new Float32Array(6)
  next.slice(0, 6).forEach((entry, i) => {
    colors.set(entry.linear, i * 3)
    weights[i] = entry.weight
  })
  $('#tint').value = next[0].color
  $('#swatches').replaceChildren(
    ...next.map((entry) => {
      const swatch = document.createElement('span')
      swatch.className = 'swatch'
      swatch.style.background = entry.color
      swatch.title = `${entry.color} · ${(entry.weight * 100).toFixed(0)}%`
      return swatch
    }),
  )
  $('#palette-note').textContent = `${name} · 两侧共用 ${next.length} 色及其占比`
  draw()
}
async function loadCover(file) {
  if (!file || disposed) return
  const token = ++uploadToken
  $('#palette-note').textContent = '正在提取本地封面配色…'
  try {
    const next = await paletteFromFile(file)
    if (token !== uploadToken || disposed) return
    if (!next.length) throw new Error('图片没有可用颜色。')
    clearError()
    $('#preset').value = ''
    applyPalette(next, `封面「${file.name}」`)
  } catch {
    if (token !== uploadToken || disposed) return
    showError('无法解码这张图片，请选择其他封面。')
    applyPalette(palette, '保留上次配色')
  }
}
function setView(next) {
  view = next
  $('#comparison').dataset.view = next
  document
    .querySelectorAll('button[data-view]')
    .forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === next)))
  draw()
}
function setClean(value) {
  clean = value
  document.body.classList.toggle('clean', value)
  $('#restore').hidden = !value
  draw()
  if (value) $('#restore').focus()
  else $('#clean').focus()
}
function onVisibility() {
  sync()
}
function onMotion(event) {
  if (event.matches) paused = true
  sync()
}
function dispose() {
  if (disposed) return
  disposed = true
  uploadToken++
  cancelAnimationFrame(raf)
  observer?.disconnect()
  baseline?.dispose()
  refined?.dispose()
  motion.removeEventListener('change', onMotion)
  document.removeEventListener('visibilitychange', onVisibility)
}

try {
  baseline = createSurface($('#baseline'), fragmentSource, onAvailability)
  refined = createSurface($('#refined'), refinedFragmentSource, onAvailability)
  applyPalette(presetPalette('alloy'), sourceName('alloy'))
  $('#preset').addEventListener('change', (event) => {
    uploadToken++
    clearError()
    applyPalette(presetPalette(event.target.value), sourceName(event.target.value))
  })
  $('#tint').addEventListener('input', (event) => {
    uploadToken++
    clearError()
    $('#preset').value = ''
    applyPalette(makePalette([{ color: event.target.value, weight: 1 }]), '自定义单色')
  })
  $('#cover').addEventListener('change', (event) => {
    void loadCover(event.target.files[0])
    event.target.value = ''
  })
  document.querySelectorAll('[data-setting]').forEach((input) =>
    input.addEventListener('input', () => {
      material[input.dataset.setting] = Number(input.value)
      updateControls()
      draw()
    }),
  )
  $('#pause').addEventListener('click', () => {
    paused = !paused
    sync()
  })
  $('#reset').addEventListener('click', () => {
    uploadToken++
    time = 9
    Object.assign(material, defaults)
    updateControls()
    $('#preset').value = 'alloy'
    clearError()
    applyPalette(presetPalette('alloy'), sourceName('alloy'))
    sync()
  })
  document
    .querySelectorAll('button[data-view]')
    .forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)))
  $('#lyrics').addEventListener('change', (event) => {
    document.querySelectorAll('.sample').forEach((sample) => {
      sample.hidden = !event.target.checked
    })
  })
  $('#clean').addEventListener('click', () => setClean(true))
  $('#restore').addEventListener('click', () => setClean(false))
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && clean) setClean(false)
  })
  observer = new ResizeObserver(draw)
  document.querySelectorAll('.surface').forEach((element) => observer.observe(element))
  document.addEventListener('visibilitychange', onVisibility)
  motion.addEventListener('change', onMotion)
  window.addEventListener('pagehide', dispose, { once: true })
  // Only the isolated prototype exposes deterministic time and raw frame data.
  window.metalRefinement = {
    ready: true,
    loadCover,
    renderAt(value) {
      time = value
      paused = true
      sync()
    },
    getState: () => ({
      time,
      paused,
      view,
      clean,
      material: { ...material },
      palette,
      surfaces: [baseline.getState(), refined.getState()],
    }),
    readFrames: () => [baseline.readPixels(), refined.readPixels()],
  }
  sync()
} catch (error) {
  dispose()
  showError(error)
  document.querySelectorAll('button,input,select').forEach((input) => {
    input.disabled = true
  })
}
