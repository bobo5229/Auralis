import {
  ShaderMount,
  liquidMetalFragmentShader,
  getShaderColorFromString,
} from './vendor/paper-shaders.js'
import {
  vertexSource,
  fragmentSource,
} from '../../../src/renderer/features/playback/runtime/liquidMetalShader.ts'
import { DEFAULT_LIQUID_METAL_SETTINGS } from '../../../src/renderer/features/playback/runtime/liquidMetalSettings.ts'
import { makePalette, paletteFromFile } from '../liquid-metal/palette.js'

const $ = (selector) => document.querySelector(selector)
const presets = {
  silver: [{ color: '#ffffff', weight: 1 }],
  purple: [
    { color: '#7c22bc', weight: 0.55 },
    { color: '#300954', weight: 0.3 },
    { color: '#bcabc8', weight: 0.15 },
  ],
  gold: [
    { color: '#d9c653', weight: 0.5 },
    { color: '#849747', weight: 0.35 },
    { color: '#e7e2c6', weight: 0.15 },
  ],
  blue: [
    { color: '#2969a0', weight: 0.5 },
    { color: '#172e4a', weight: 0.3 },
    { color: '#b9d7e4', weight: 0.2 },
  ],
  white: [{ color: '#ffffff', weight: 1 }],
  dark: [{ color: '#25282d', weight: 1 }],
}
const paperDefaults = {
  repetition: 1.5,
  softness: 0.05,
  distortion: 0.1,
  contour: 0.4,
  dispersion: 0.3,
  angle: 90,
  scale: 1,
}
const paperParams = { ...paperDefaults }
const material = { ...DEFAULT_LIQUID_METAL_SETTINGS }
let paper,
  gl,
  program,
  buffer,
  raf = 0,
  time = 0,
  previous = 0,
  draws = 0,
  palette = makePalette(presets.silver),
  uploadToken = 0,
  pixelCap = 0
let paletteColors = new Float32Array(18),
  paletteWeights = new Float32Array(6)
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches
const uniforms = {}
const canvas = $('#auralis-canvas')

function showError(error) {
  $('#error').textContent = error instanceof Error ? error.message : String(error)
  $('#error').hidden = false
}
function compile(type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(shader))
  return shader
}
function initializeAuralis() {
  gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true })
  if (!gl) throw new Error('当前环境不支持 WebGL2。请在启用硬件加速的 Chrome / Edge 中打开。')
  program = gl.createProgram()
  const shaders = [
    compile(gl.VERTEX_SHADER, vertexSource),
    compile(gl.FRAGMENT_SHADER, fragmentSource),
  ]
  shaders.forEach((shader) => gl.attachShader(program, shader))
  gl.linkProgram(program)
  shaders.forEach((shader) => gl.deleteShader(shader))
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program))
  gl.useProgram(program)
  buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const location = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(location)
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
  for (const name of ['resolution', 'time', 'folds', 'roughness', 'colors[0]', 'weights[0]'])
    uniforms[name] = gl.getUniformLocation(program, `u_${name}`)
}
function paperUniforms() {
  return {
    u_colorBack: getShaderColorFromString('#AAAAAC'),
    u_colorTint: getShaderColorFromString(palette[0].color),
    u_isImage: false,
    u_shape: 0,
    u_repetition: paperParams.repetition,
    u_softness: paperParams.softness,
    u_distortion: paperParams.distortion,
    u_contour: paperParams.contour,
    u_shiftRed: paperParams.dispersion,
    u_shiftBlue: paperParams.dispersion,
    u_angle: paperParams.angle,
    u_fit: 1,
    u_scale: paperParams.scale,
    u_rotation: 0,
    u_originX: 0.5,
    u_originY: 0.5,
    u_offsetX: 0,
    u_offsetY: 0,
    u_worldWidth: 0,
    u_worldHeight: 0,
  }
}
function draw() {
  if (!gl || !paper) return
  // CSS pixels, 1x on both sides: isolate algorithm differences from sampling density.
  const paperBounds = $('#paper-surface').getBoundingClientRect()
  const nextCap = Math.round(paperBounds.width) * Math.round(paperBounds.height)
  if (nextCap > 0 && nextCap !== pixelCap) {
    pixelCap = nextCap
    paper.setMaxPixelCount(nextCap)
  }
  const bounds = canvas.getBoundingClientRect()
  if (bounds.width && bounds.height) {
    const width = Math.round(bounds.width),
      height = Math.round(bounds.height)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    gl.viewport(0, 0, width, height)
    gl.useProgram(program)
    gl.uniform2f(uniforms.resolution, width, height)
    gl.uniform1f(uniforms.time, time)
    gl.uniform1f(uniforms.folds, material.folds)
    gl.uniform1f(uniforms.roughness, material.roughness)
    gl.uniform3fv(uniforms['colors[0]'], paletteColors)
    gl.uniform1fv(uniforms['weights[0]'], paletteWeights)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  paper.setFrame(time * 1000)
  draws++
  $('#time').textContent = `${time.toFixed(2)} s`
  const pc = paper.canvasElement
  $('#resolution').textContent =
    `渲染尺寸：Paper ${pc.width} × ${pc.height} / Auralis ${canvas.width} × ${canvas.height} · 1× CSS 像素 · WebGL2`
}
function tick(now) {
  raf = 0
  if (previous) time += Math.min((now - previous) / 1000, 0.05) * material.speed
  previous = now
  draw()
  if (!paused && !document.hidden) raf = requestAnimationFrame(tick)
}
function sync() {
  cancelAnimationFrame(raf)
  raf = previous = 0
  $('#pause').textContent = paused ? '继续' : '暂停'
  $('#pause').setAttribute('aria-pressed', String(paused))
  draw()
  if (!paused && !document.hidden) raf = requestAnimationFrame(tick)
}
function applyPalette(next, source) {
  palette = next
  paletteColors = new Float32Array(18)
  paletteWeights = new Float32Array(6)
  palette.forEach((entry, index) => {
    paletteColors.set(entry.linear, index * 3)
    paletteWeights[index] = entry.weight
  })
  $('#tint').value = palette[0].color
  $('#swatches').replaceChildren(
    ...palette.map((entry) => {
      const swatch = document.createElement('span')
      swatch.className = 'swatch'
      swatch.style.background = entry.color
      swatch.title = `${entry.color} · ${(entry.weight * 100).toFixed(0)}%`
      return swatch
    }),
  )
  $('#palette-note').textContent =
    palette.length === 1
      ? `${source}：两侧使用 ${palette[0].color} 单色输入，保留各自亮度映射。`
      : `${source}：Auralis 使用全部 ${palette.length} 色；Paper 使用主色 ${palette[0].color} 染色。`
  paper.setUniforms(paperUniforms())
  draw()
}
async function loadCover(file) {
  const token = ++uploadToken
  if (!file) return
  $('#palette-note').textContent = '正在提取本地封面配色…'
  try {
    const next = await paletteFromFile(file)
    if (token !== uploadToken) return
    if (!next.length) throw new Error('无法从图片提取配色')
    $('#preset').value = ''
    $('#error').hidden = true
    applyPalette(next, `封面「${file.name}」`)
  } catch {
    if (token === uploadToken) {
      showError('无法解码这张图片，请选择其他封面。')
      applyPalette(palette, '保留上次配色')
    }
  }
}
function setView(view) {
  $('#comparison').dataset.view = view
  document.querySelectorAll('[data-view]').forEach((button) => {
    if (button.tagName === 'BUTTON')
      button.setAttribute('aria-pressed', String(button.dataset.view === view))
  })
  requestAnimationFrame(draw)
}
try {
  initializeAuralis()
  paper = new ShaderMount(
    $('#paper-surface'),
    liquidMetalFragmentShader,
    paperUniforms(),
    { alpha: false, antialias: false, preserveDrawingBuffer: true },
    0,
    0,
    1,
    8192 * 8192,
  )
  // draw() caps Paper to the CSS pixel area through its public sizing API.
  applyPalette(palette, '银色对照')
  $('#preset').addEventListener('change', (event) => {
    uploadToken++
    applyPalette(
      makePalette(presets[event.target.value]),
      event.target.selectedOptions[0].textContent,
    )
  })
  $('#tint').addEventListener('input', (event) => {
    uploadToken++
    $('#preset').value = ''
    applyPalette(makePalette([{ color: event.target.value, weight: 1 }]), '自定义单色')
  })
  $('#cover').addEventListener('change', (event) => {
    void loadCover(event.target.files[0])
    event.target.value = ''
  })
  $('#speed').addEventListener('input', (event) => {
    material.speed = Number(event.target.value)
    $('#speed-value').textContent = `${material.speed.toFixed(2)}×`
  })
  $('#pause').addEventListener('click', () => {
    paused = !paused
    sync()
  })
  $('#lyrics').addEventListener('change', (event) => {
    document.body.classList.toggle('show-lyrics', event.target.checked)
    document
      .querySelectorAll('.sample')
      .forEach((sample) => sample.setAttribute('aria-hidden', String(!event.target.checked)))
  })
  document
    .querySelectorAll('button[data-view]')
    .forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)))
  document.querySelectorAll('[data-paper], [data-auralis]').forEach((input) =>
    input.addEventListener('input', () => {
      input.nextElementSibling.textContent = Number(input.value).toFixed(2)
      if (input.dataset.paper) {
        paperParams[input.dataset.paper] = Number(input.value)
        paper.setUniforms(paperUniforms())
      } else material[input.dataset.auralis] = Number(input.value)
      draw()
    }),
  )
  $('#reset').addEventListener('click', () => {
    uploadToken++
    time = 0
    Object.assign(material, DEFAULT_LIQUID_METAL_SETTINGS)
    Object.assign(paperParams, paperDefaults)
    $('#speed').value = String(material.speed)
    $('#speed-value').textContent = `${material.speed.toFixed(2)}×`
    document.querySelectorAll('[data-paper], [data-auralis]').forEach((input) => {
      input.value = String(
        input.dataset.paper ? paperParams[input.dataset.paper] : material[input.dataset.auralis],
      )
      input.nextElementSibling.textContent = Number(input.value).toFixed(2)
    })
    $('#preset').value = 'silver'
    $('#error').hidden = true
    applyPalette(makePalette(presets.silver), '银色对照')
    sync()
  })
  const resize = new ResizeObserver(() => draw())
  resize.observe($('#auralis-surface'))
  resize.observe($('#paper-surface'))
  document.addEventListener('visibilitychange', sync)
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(raf)
    resize.disconnect()
    paper.dispose()
    gl.deleteBuffer(buffer)
    gl.deleteProgram(program)
  })
  canvas.addEventListener('webglcontextlost', () => {
    paused = true
    sync()
    showError('WebGL 上下文已丢失，请刷新页面恢复。')
  })
  paper.canvasElement.addEventListener('webglcontextlost', () => {
    paused = true
    sync()
    showError('WebGL 上下文已丢失，请刷新页面恢复。')
  })
  window.metalComparison = {
    ready: true,
    loadCover,
    renderAt(seconds) {
      paused = true
      time = seconds
      sync()
    },
    getState() {
      return {
        time,
        paused,
        draws,
        material: { ...material },
        paper: { ...paperParams },
        palette,
        error: gl.getError(),
        sizes: [
          [paper.canvasElement.width, paper.canvasElement.height],
          [canvas.width, canvas.height],
        ],
      }
    },
  }
  sync()
} catch (error) {
  cancelAnimationFrame(raf)
  paper?.dispose()
  showError(error)
  document.querySelectorAll('button, input, select').forEach((control) => {
    control.disabled = true
  })
}
