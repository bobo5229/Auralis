import 'virtual:disc-baseline.css'
import './style.css'
import artworkUrl from '../assets/album-sleeve-cover.webp'
import { createMaterial } from './material.js'

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)')
const state = {
  angle: 0,
  x: 0,
  y: 0,
  gloss: 0.8,
  grooves: 0.8,
  surface: 'vinyl',
  dark: false,
  sample: 'artwork',
  spin: true,
  autoTilt: true,
  reduced: reducedQuery.matches,
}
let material,
  ready = false,
  frame = 0,
  lastTime = 0,
  elapsed = 0,
  size = 400,
  disposed = false,
  pointerActive = false
let target = { x: 0, y: 0 }
const status = $('#status')

function updateControls() {
  $('#theme').setAttribute('aria-pressed', String(state.dark))
  $('#theme').textContent = state.dark ? '浅色背景' : '深色背景'
  $('#spin').textContent = state.spin && !state.reduced ? '暂停旋转' : '开始旋转'
  $('#spin').setAttribute('aria-pressed', String(state.spin && !state.reduced))
  $('#auto-tilt').textContent = state.autoTilt && !state.reduced ? '停止自动倾斜' : '自动倾斜'
  $('#auto-tilt').setAttribute('aria-pressed', String(state.autoTilt && !state.reduced))
  $('#spin').disabled = $('#auto-tilt').disabled = state.reduced
  $('#reduce').checked = state.reduced
  $('#grooves').disabled = state.surface !== 'vinyl'
  for (const key of ['gloss', 'grooves']) {
    $(`#${key}`).value = state[key]
    $(`#${key}-value`).value = state[key].toFixed(2)
  }
  for (const button of $$('[data-surface]'))
    button.setAttribute('aria-pressed', String(button.dataset.surface === state.surface))
  for (const button of $$('button[data-sample]'))
    button.setAttribute('aria-pressed', String(button.dataset.sample === state.sample))
}

function paint() {
  document.body.dataset.theme = state.dark ? 'dark' : 'light'
  document.body.dataset.sample = state.sample
  for (const disc of $$('.cd-position')) {
    disc.style.transform = `scale(${size / 400})`
    disc.style.setProperty('--cd-vinyl', state.surface === 'vinyl' ? '1' : '0')
  }
  for (const plane of $$('.cd-hover'))
    plane.style.transform = `perspective(1100px) rotateX(${state.x}deg) rotateY(${state.y}deg)`
  for (const art of $$('.cd-art')) art.style.transform = `rotate(${state.angle}deg)`
  for (const shadow of $$('.cast-shadow'))
    shadow.style.transform = `translate(${4 - state.y * 0.28}px, ${16 + state.x * 0.25}px) scale(${1 - Math.abs(state.y) * 0.001})`
  material?.draw(state, size * 0.98)
}
function requestPaint() {
  if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(tick)
}
function tick(now) {
  frame = 0
  const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0
  lastTime = now
  if (!state.reduced) {
    elapsed += dt
    if (state.spin) state.angle = (state.angle + dt * 18) % 360
    if (state.autoTilt && !pointerActive)
      target = { x: Math.sin(elapsed * 0.62) * 15, y: Math.sin(elapsed * 0.44 + 0.3) * 22 }
  }
  const blend = state.reduced ? 1 : 1 - Math.exp(-dt * 10)
  state.x += (target.x - state.x) * blend
  state.y += (target.y - state.y) * blend
  if (Math.abs(target.x - state.x) < 0.005) state.x = target.x
  if (Math.abs(target.y - state.y) < 0.005) state.y = target.y
  paint()
  if (
    (!state.reduced && (state.spin || state.autoTilt)) ||
    state.x !== target.x ||
    state.y !== target.y
  )
    requestPaint()
  else lastTime = 0
}
function change(patch) {
  Object.assign(state, patch)
  updateControls()
  requestPaint()
}
function front() {
  target = { x: 0, y: 0 }
  pointerActive = false
  change({ autoTilt: false, spin: false, angle: 0 })
}
$('#theme').addEventListener('click', () => change({ dark: !state.dark }))
$('#spin').addEventListener('click', () => change({ spin: !state.spin }))
$('#auto-tilt').addEventListener('click', () => change({ autoTilt: !state.autoTilt }))
$('#front').addEventListener('click', front)
$('#reduce').addEventListener('change', (event) => {
  target = { x: 0, y: 0 }
  change({ reduced: event.target.checked })
})
for (const key of ['gloss', 'grooves'])
  $(`#${key}`).addEventListener('input', (event) => change({ [key]: Number(event.target.value) }))
for (const button of $$('[data-surface]'))
  button.addEventListener('click', () => change({ surface: button.dataset.surface }))
for (const button of $$('button[data-sample]'))
  button.addEventListener('click', () => change({ sample: button.dataset.sample }))
for (const stage of $$('.cd-stage')) {
  stage.addEventListener('pointermove', (event) => {
    if (state.reduced) return
    const bounds = stage.getBoundingClientRect()
    pointerActive = true
    target = {
      x: -((event.clientY - bounds.top) / bounds.height - 0.5) * 40,
      y: ((event.clientX - bounds.left) / bounds.width - 0.5) * 48,
    }
    requestPaint()
  })
  stage.addEventListener('pointerleave', () => {
    pointerActive = false
    if (!state.autoTilt) target = { x: 0, y: 0 }
    requestPaint()
  })
}
function visibility() {
  cancelAnimationFrame(frame)
  frame = 0
  lastTime = 0
  if (!document.hidden) requestPaint()
}
document.addEventListener('visibilitychange', visibility)
function motionChanged(event) {
  target = { x: 0, y: 0 }
  change({ reduced: event.matches })
}
reducedQuery.addEventListener('change', motionChanged)
const resize = new ResizeObserver(() => {
  size = $('.disc-size').clientWidth
  requestPaint()
})
resize.observe($('.disc-size'))

function materialStatus(available, message) {
  ready = available
  $('[data-renderer="glsl"]').classList.toggle('ready', available)
  status.textContent = message ?? '左右同步 · 移动指针或自动倾斜以比较反光'
  requestPaint()
}
async function initialize() {
  try {
    await Promise.all(
      $$('.cd-art img').map(async (image) => {
        image.src = artworkUrl
        await image.decode()
      }),
    )
    material = createMaterial($('.material'), materialStatus)
    materialStatus(true)
  } catch (error) {
    materialStatus(false, `材质未启用，右侧显示当前 CSS 效果。${error.message}`)
    console.error(error)
  }
  updateControls()
  requestPaint()
}
window.discMaterialDemo = {
  snapshot: () => ({
    ...state,
    ready,
    framePending: !!frame,
    hidden: document.hidden,
    size,
    gl: material?.stats(),
    imagesLoaded: $$('.cd-art img').every((image) => image.complete && image.naturalWidth > 0),
  }),
  // Deterministic comparison pose for capture and interactive verification.
  pose(x, y, angle = 0) {
    target = { x, y }
    change({ x, y, angle, autoTilt: false, spin: false })
    paint()
  },
}
window.addEventListener(
  'pagehide',
  () => {
    disposed = true
    cancelAnimationFrame(frame)
    resize.disconnect()
    document.removeEventListener('visibilitychange', visibility)
    reducedQuery.removeEventListener('change', motionChanged)
    material?.dispose()
  },
  { once: true },
)
void initialize()
