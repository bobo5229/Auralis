import { createPressureSurface } from './pressureSurface.js'
import { createBadgeInspector } from '/inspector.bundle.js'

const row = document.querySelector('.badge-row')
const viewport = document.querySelector('.foam-viewport')
const previous = document.querySelector('.scroll-arrow--previous')
const next = document.querySelector('.scroll-arrow--next')
const emptyToggle = document.querySelector('#empty-toggle')
const environmentToggle = document.querySelector('#environment-toggle')
const status = document.querySelector('#status')
const categories = [...document.querySelectorAll('[data-series]')]
const removed = new Set()
let catalog = [],
  series = 'hours'
let surface
const inspector = createBadgeInspector({
  onLift(badge, button) {
    button.dataset.inspected = 'true'
    removed.add(badge.id)
    refreshRemoved()
    status.textContent = `${badge.name}正在检视`
  },
  onReturn(badge, button) {
    delete button.dataset.inspected
    removed.delete(badge.id)
    refreshRemoved()
    status.textContent = `${badge.name}已放回`
  },
  onError() {
    status.textContent = '暂时无法打开徽章检视，请重试。'
  },
})
const seriesNames = { hours: '小时', days: '天数', albums: '专辑' }

function updateArrows() {
  previous.disabled = viewport.scrollLeft < 2
  next.disabled = viewport.scrollLeft >= viewport.scrollWidth - viewport.clientWidth - 2
}
function refreshRemoved() {
  const visible = catalog.filter((badge) => badge.series === series)
  for (const button of row.querySelectorAll('.badge-button')) {
    const isRemoved = removed.has(button.dataset.badge)
    button.setAttribute('aria-pressed', String(isRemoved))
    button.setAttribute('aria-label', `${isRemoved ? '放回' : '检视'}${button.dataset.name}`)
    button.setAttribute('aria-haspopup', isRemoved ? 'false' : 'dialog')
    surface?.setRemoved(button.dataset.badge, isRemoved)
  }
  const all = visible.every((badge) => removed.has(badge.id))
  emptyToggle.textContent = all ? '全部放回' : '全部取出'
  emptyToggle.setAttribute('aria-pressed', String(all))
}
function select(value) {
  series = value
  for (const category of categories)
    category.setAttribute('aria-pressed', String(category.dataset.series === series))
  row.setAttribute('aria-label', `${seriesNames[series]}徽章`)
  row.replaceChildren()
  for (const badge of catalog.filter((badge) => badge.series === series)) {
    const item = document.createElement('li')
    item.className = 'badge-item'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'badge-button'
    button.dataset.badge = badge.id
    button.dataset.name = badge.name
    const image = new Image()
    image.className = 'badge-image'
    image.src = badge.preview
    image.alt = ''
    image.draggable = false
    image.width = 330
    image.height = 370
    button.append(image)
    button.addEventListener('click', () => {
      if (removed.has(badge.id)) {
        removed.delete(badge.id)
        refreshRemoved()
        status.textContent = `${badge.name}已放回，轻压海绵`
      } else void inspector.open(badge, button)
    })
    const label = document.createElement('span')
    label.className = 'badge-name'
    label.textContent = badge.name
    item.append(button, label)
    row.append(item)
  }
  viewport.scrollTo({ left: 0, behavior: 'instant' })
  refreshRemoved()
  surface?.setBadges(catalog.filter((badge) => badge.series === series))
  requestAnimationFrame(updateArrows)
}
for (const category of categories)
  category.addEventListener('click', () => select(category.dataset.series))
viewport.addEventListener('scroll', updateArrows, { passive: true })
viewport.addEventListener(
  'wheel',
  (event) => {
    if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
    const movement =
      event.deltaY * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? viewport.clientWidth : 1)
    const canScroll = movement > 0 ? !next.disabled : !previous.disabled
    if (!canScroll) return
    event.preventDefault()
    viewport.scrollLeft += movement
  },
  { passive: false },
)
previous.addEventListener('click', () =>
  viewport.scrollBy({
    left: -222,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  }),
)
next.addEventListener('click', () =>
  viewport.scrollBy({
    left: 222,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  }),
)
new ResizeObserver(updateArrows).observe(viewport)
emptyToggle.addEventListener('click', () => {
  const visible = catalog.filter((badge) => badge.series === series)
  const all = visible.every((badge) => removed.has(badge.id))
  for (const badge of visible) {
    if (all) removed.delete(badge.id)
    else removed.add(badge.id)
  }
  refreshRemoved()
  status.textContent = all ? '本组徽章已放回，轻压海绵' : '本组徽章已拿起，海绵保留压痕'
})
environmentToggle.addEventListener('click', () => {
  const light = document.documentElement.dataset.environment !== 'light'
  document.documentElement.dataset.environment = light ? 'light' : 'dark'
  environmentToggle.setAttribute('aria-pressed', String(light))
  environmentToggle.setAttribute('aria-label', `切换为${light ? '深' : '浅'}色环境`)
})
try {
  const response = await fetch('/catalog.json')
  if (!response.ok) throw new Error('徽章素材加载失败')
  catalog = await response.json()
  surface = await createPressureSurface(document.querySelector('.foam-sheet'), row)
  select('hours')
  window.foamMaterial = { snapshot: () => surface.snapshot() }
  window.badgeInspector = { snapshot: () => inspector.snapshot() }
  document.documentElement.dataset.ready = 'true'
} catch (error) {
  document.querySelector('#hint').textContent = `${error.message}，请刷新重试。`
  for (const button of document.querySelectorAll('button')) button.disabled = true
}
window.addEventListener(
  'pagehide',
  () => {
    inspector.dispose()
    surface?.dispose()
  },
  { once: true },
)
