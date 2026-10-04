const albums = [
  ['Windswept Adan', 'Ichiko Aoba', 'windswept-adan', 'ambient', '#527271'],
  ['Endlessness', 'Nala Sinephro', 'endlessness', 'jazz', '#596b5c'],
  ['async', 'Ryuichi Sakamoto', 'async', 'ambient', '#536367'],
  ['A LA SALA', 'Khruangbin', 'a-la-sala', 'indie', '#736657'],
  ['Waltz for Debby', 'Bill Evans', 'waltz-for-debby', 'jazz', '#635b68'],
  ['Untourable Album', 'Men I Trust', 'untourable-album', 'indie', '#58696a'],
]
const $ = (s) => document.querySelector(s),
  scene = $('#scene'),
  reduce = matchMedia('(prefers-reduced-motion: reduce)')
let selected = 0,
  taken = false,
  opened = true,
  group = 'all',
  animation = null
const disks = albums.map(([title, artist, file, category, color], i) => {
  const b = document.createElement('button')
  b.className = 'disk'
  b.style.setProperty('--shell', color)
  b.style.setProperty('--y', `${-i * 27}px`)
  b.style.zIndex = String(10 - i)
  b.setAttribute('aria-label', `${title}，${artist}`)
  const tab = document.createElement('span')
  tab.className = 'tab'
  const num = document.createElement('b')
  num.textContent = String(i + 1).padStart(2, '0')
  tab.append(num, document.createTextNode(title))
  const shutter = document.createElement('span')
  shutter.className = 'shutter'
  const label = document.createElement('span')
  label.className = 'label'
  const img = document.createElement('img')
  img.src = `../listening-journal/assets/${file}.jpg`
  img.alt = ''
  img.draggable = false
  const name = document.createElement('span')
  name.textContent = `${title} / ${artist}`
  label.append(img, name)
  b.append(tab, shutter, label)
  b.onclick = () => {
    if (!opened) return
    if (selected === i) toggleTake()
    else select(i)
  }
  $('#disks').append(b)
  return b
})
function cancel() {
  animation?.cancel()
  animation = null
}
function render() {
  scene.classList.toggle('closed', !opened)
  disks.forEach((b, i) => {
    b.classList.toggle('taken', taken && i === selected)
    b.setAttribute('aria-pressed', String(i === selected))
    b.disabled = !opened
    b.tabIndex = opened ? 0 : -1
  })
  $('#title').textContent = albums[selected][0]
  $('#artist').textContent = albums[selected][1]
  $('#position').textContent = `${String(selected + 1).padStart(2, '0')} / 06`
  $('#take').textContent = taken ? '放回盒中' : '取出软盘'
  $('#take').disabled = !opened
  $('#prev').disabled = $('#next').disabled = !opened
  $('#lid').textContent = opened ? '合上盒盖' : '打开盒盖'
  $('#lid').setAttribute('aria-expanded', String(opened))
  document
    .querySelectorAll('[data-group]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.group === group)))
}
function select(i) {
  cancel()
  taken = false
  selected = i
  opened = true
  render()
  $('#status').textContent = `已选 ${albums[i][0]}`
}
function toggleTake() {
  if (!opened) return
  const b = disks[selected]
  const start = getComputedStyle(b).transform
  cancel()
  taken = !taken
  render()
  const end = taken
    ? `translate(${getComputedStyle(scene).getPropertyValue('--take-x')},${getComputedStyle(scene).getPropertyValue('--take-y')}) rotate(7deg) scale(1.17)`
    : `translate(0,${-selected * 27 - 6}px) rotate(-3deg)`
  if (!reduce.matches) {
    animation = b.animate(
      [
        { transform: start },
        {
          transform: `translate(0,${-selected * 27 - 170}px) rotate(-3deg)`,
          offset: taken ? 0.45 : 0.65,
        },
        { transform: end },
      ],
      { duration: 850, easing: 'cubic-bezier(.45,0,.2,1)' },
    )
    animation.onfinish = () => {
      animation = null
    }
  }
  $('#status').textContent = taken ? '已取出 · 再次点击放回' : '已放回盒中'
}
function step(d) {
  const list = albums.map((a, i) => i).filter((i) => group === 'all' || albums[i][3] === group)
  select(list[(Math.max(0, list.indexOf(selected)) + d + list.length) % list.length])
}
$('#take').onclick = toggleTake
$('#prev').onclick = () => step(-1)
$('#next').onclick = () => step(1)
$('#lid').onclick = () => {
  cancel()
  taken = false
  opened = !opened
  render()
  $('#status').textContent = opened ? '盒盖已打开' : '软盘已收好'
}
document.querySelectorAll('[data-group]').forEach(
  (b) =>
    (b.onclick = () => {
      group = b.dataset.group
      select(group === 'all' ? 0 : albums.findIndex((a) => a[3] === group))
    }),
)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (taken) toggleTake()
    return
  }
  if (!opened) return
  if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault()
    step(e.key === 'ArrowLeft' ? -1 : 1)
  }
  if (e.key === 'Enter' && e.target === document.body) {
    e.preventDefault()
    toggleTake()
  }
})
function resize() {
  cancel()
  scene.style.setProperty(
    '--scene-scale',
    String(Math.min(1, innerWidth < 650 ? (innerWidth - 40) / 540 : (innerWidth - 80) / 900)),
  )
}
window.addEventListener('resize', resize)
reduce.addEventListener('change', cancel)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancel()
})
resize()
render()
