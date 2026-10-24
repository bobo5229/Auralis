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
const seriesNames = { hours: '小时', days: '天数', albums: '专辑' }

function pocket(badge) {
  const id = badge.id
  // Geometry comes from the badge master, including its rounded corners.
  return `<svg class="badge-pocket" viewBox="0 0 330 370" aria-hidden="true">
    <defs>
      <clipPath id="${id}-cut"><path d="${badge.contour}"/></clipPath>
      <pattern id="${id}-floor" width="688" height="688" patternUnits="userSpaceOnUse"><image href="/assets/foam.png" width="688" height="688"/></pattern>
      <linearGradient id="${id}-wall" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#010202"/><stop offset=".45" stop-color="#0d0e0e"/><stop offset="1" stop-color="#54554e"/></linearGradient>
      <filter id="${id}-inset" x="-.2" y="-.2" width="1.4" height="1.4" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation="7" result="blur"/>
        <feOffset in="blur" dx="3" dy="8" result="offset"/>
        <feComposite in="SourceAlpha" in2="offset" operator="out" result="edge"/>
        <feFlood flood-color="#000" flood-opacity=".95"/>
        <feComposite in2="edge" operator="in" result="shadow"/>
        <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="shadow"/></feMerge>
      </filter>
    </defs>
    <path d="${badge.contour}" fill="#070908" stroke="#020303" stroke-width="5"/>
    <g clip-path="url(#${id}-cut)" filter="url(#${id}-inset)">
      <path d="${badge.contour}" fill="url(#${id}-floor)"/>
      <path d="${badge.contour}" fill="#000" opacity=".52"/>
    </g>
    <path d="${badge.contour}" fill="none" stroke="url(#${id}-wall)" stroke-width="4"/>
  </svg>`
}

function updateArrows() {
  previous.disabled = viewport.scrollLeft < 2
  next.disabled = viewport.scrollLeft >= viewport.scrollWidth - viewport.clientWidth - 2
}
function refreshRemoved() {
  const visible = catalog.filter((badge) => badge.series === series)
  for (const button of row.querySelectorAll('.badge-button')) {
    const isRemoved = removed.has(button.dataset.badge)
    button.setAttribute('aria-pressed', String(isRemoved))
    button.setAttribute('aria-label', `${isRemoved ? '放回' : '取出'}${button.dataset.name}`)
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
    button.innerHTML = pocket(badge)
    const image = new Image()
    image.className = 'badge-image'
    image.src = badge.preview
    image.alt = ''
    image.draggable = false
    image.width = 330
    image.height = 370
    button.append(image)
    button.addEventListener('click', () => {
      if (removed.has(badge.id)) removed.delete(badge.id)
      else removed.add(badge.id)
      refreshRemoved()
      status.textContent = `${badge.name}已${removed.has(badge.id) ? '取出，可查看空槽' : '放回'}`
    })
    const label = document.createElement('span')
    label.className = 'badge-name'
    label.textContent = badge.name
    item.append(button, label)
    row.append(item)
  }
  viewport.scrollTo({ left: 0, behavior: 'instant' })
  refreshRemoved()
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
  status.textContent = all ? '本组徽章已全部放回' : '本组徽章已取出，展示海绵凹槽'
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
  select('hours')
  document.documentElement.dataset.ready = 'true'
} catch (error) {
  document.querySelector('#hint').textContent = `${error.message}，请刷新重试。`
  for (const button of document.querySelectorAll('button')) button.disabled = true
}
