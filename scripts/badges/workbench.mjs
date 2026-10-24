import { createBadgeMaterialRenderer } from '../../src/renderer/features/archive/runtime/badgeMaterialRenderer.ts'

const byId = (id) => document.getElementById(id)
const stage = byId('stage'),
  canvas = byId('live')
const manifest = await (await fetch('/materials/manifest.json')).json()
const entries = Object.values(manifest.badges)
const motion = matchMedia('(prefers-reduced-motion: reduce)')
let graphics,
  failed = false,
  loading = false,
  revision = 0,
  current,
  state = 'lit',
  frame = 0,
  previous = 0
const pose = { x: 0, y: 0, targetX: 0, targetY: 0 }
function fail(error) {
  failed = true
  byId('status').textContent = String(error)
  canvas.hidden = true
  graphics?.dispose()
}
try {
  if (new URLSearchParams(location.search).has('fallback')) throw new Error('Explicit fallback')
  graphics = createBadgeMaterialRenderer(canvas, fail)
} catch (error) {
  fail(error)
}
byId('badge').innerHTML = entries
  .map((entry) => `<option value="${entry.id}">${entry.name} · ${entry.id}</option>`)
  .join('')
function copySmall() {
  for (const size of [96, 70, 44]) {
    const target = byId(`small${size}`),
      dpr = Math.min(2, devicePixelRatio)
    target.width = Math.round(size * dpr)
    target.height = Math.round(((size * 370) / 330) * dpr)
    target.getContext('2d').drawImage(canvas, 0, 0, target.width, target.height)
  }
}
function draw(time) {
  frame = 0
  if (failed || loading || document.hidden) {
    previous = 0
    return
  }
  const alpha = motion.matches
    ? 1
    : 1 - Math.exp(-(previous ? Math.min(time - previous, 50) : 16.7) / 65)
  previous = time
  pose.x += (pose.targetX - pose.x) * alpha
  pose.y += (pose.targetY - pose.y) * alpha
  const moving = Math.abs(pose.x - pose.targetX) + Math.abs(pose.y - pose.targetY) > 0.01
  if (!moving) {
    pose.x = pose.targetX
    pose.y = pose.targetY
  }
  graphics.render(pose.x, pose.y)
  copySmall()
  if (moving) frame = requestAnimationFrame(draw)
  else previous = 0
}
function requestDraw() {
  if (!frame && !failed && !loading && !document.hidden) frame = requestAnimationFrame(draw)
}
function reset() {
  pose.targetX = pose.targetY = 0
  requestDraw()
}
function resize() {
  if (failed || !graphics) return
  graphics.resize(stage.clientWidth, stage.clientHeight)
  requestDraw()
}
function target(x, y) {
  pose.targetX = Math.max(-8, Math.min(8, x))
  pose.targetY = Math.max(-8, Math.min(8, y))
  requestDraw()
}
stage.addEventListener('pointermove', (event) => {
  if (motion.matches || event.pointerType === 'touch') return
  const box = stage.getBoundingClientRect()
  target(
    (-(event.clientY - box.top - box.height / 2) / (box.height / 2)) * 8,
    ((event.clientX - box.left - box.width / 2) / (box.width / 2)) * 8,
  )
})
stage.addEventListener('pointerleave', reset)
stage.addEventListener('keydown', (event) => {
  if (event.key === 'Home') {
    event.preventDefault()
    reset()
    return
  }
  const step = { ArrowLeft: [0, -2], ArrowRight: [0, 2], ArrowUp: [2, 0], ArrowDown: [-2, 0] }[
    event.key
  ]
  if (step) {
    event.preventDefault()
    target(pose.targetX + step[0], pose.targetY + step[1])
  }
})
async function select(id, nextState = 'lit') {
  const owner = ++revision
  current = manifest.badges[id]
  state = nextState
  loading = true
  if (!current) throw new Error(`Unknown badge ${id}`)
  byId('badge').value = id
  byId('state').value = state
  const original = `/original/${id.split('-')[0]}/assets/${id}${state === 'unlit' ? '-unlit' : ''}@2x.png`
  byId('original').src = original
  byId('fallback').src = original
  byId('base').src = `/materials/${current.states[state].base}`
  if (failed) {
    loading = false
    return false
  }
  try {
    const descriptor = {
      ...current,
      states: Object.fromEntries(
        Object.entries(current.states).map(([state, maps]) => [
          state,
          Object.fromEntries(
            Object.entries(maps).map(([key, path]) => [key, `/materials/${path}`]),
          ),
        ]),
      ),
    }
    const loaded = await graphics.load(descriptor, state)
    if (owner !== revision || !loaded) return false
    Object.assign(pose, { x: 0, y: 0, targetX: 0, targetY: 0 })
    loading = false
    resize()
    requestDraw()
    return true
  } catch (error) {
    loading = false
    fail(error)
    return false
  }
}
byId('badge').addEventListener('change', (event) => {
  void select(event.target.value, state)
})
byId('state').addEventListener('change', (event) => {
  void select(current.id, event.target.value)
})
byId('reflections').addEventListener('change', (event) => {
  graphics?.setReflections(event.target.checked)
  requestDraw()
})
byId('theme').addEventListener('click', () => {
  document.documentElement.dataset.theme =
    document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'
})
byId('reset').addEventListener('click', reset)
const observer = new ResizeObserver(resize)
observer.observe(stage)
let resolution
function watchResolution() {
  resolution?.removeEventListener('change', onResolution)
  resolution = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
  resolution.addEventListener('change', onResolution)
}
function onResolution() {
  resize()
  watchResolution()
}
watchResolution()
motion.addEventListener('change', reset)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(frame)
    frame = 0
    previous = 0
  } else requestDraw()
})
window.addEventListener(
  'pagehide',
  () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    resolution?.removeEventListener('change', onResolution)
    motion.removeEventListener('change', reset)
    graphics?.dispose()
  },
  { once: true },
)
window.badgeWorkbench = {
  entries: entries.map((entry) => ({ id: entry.id, catalogId: entry.catalogId, name: entry.name })),
  select,
  snapshot: () => ({
    ...graphics?.snapshot(),
    failed,
    loading,
    running: !!frame,
    target: { ...pose },
  }),
  capture: () => {
    graphics.resize(330, 370, 1)
    graphics.render(0, 0)
    const data = graphics.capture()
    resize()
    return data
  },
  forceContextLoss: () => graphics?.forceContextLoss(),
}
await select(new URLSearchParams(location.search).get('badge') || entries[0].id)
