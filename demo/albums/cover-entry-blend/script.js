const list = document.querySelector('.list')
const detail = document.querySelector('.detail')
const destination = document.querySelector('.destination')
const destinationImage = destination.querySelector('img')
const back = document.querySelector('.back')
const replay = document.querySelector('.replay')
const speed = document.querySelector('.speed')
const modeButtons = [...document.querySelectorAll('[data-mode]')]
const albumButtons = [...document.querySelectorAll('button.album')]
const modeLabel = document.querySelector('.mode-label')
const description = document.querySelector('.description')
let mode = 'blend'
let slow = false
let running = false
let selected = albumButtons[0]

function restoreList() {
  if (running) return
  detail.style.visibility = 'hidden'
  detail.style.opacity = '0'
  detail.setAttribute('aria-hidden', 'true')
  list.style.opacity = '1'
  list.style.visibility = 'visible'
  list.removeAttribute('aria-hidden')
  selected.focus({ preventScroll: true })
}
function openAlbum(button) {
  if (running) return
  running = true
  selected = button
  const source = button.querySelector('.cover')
  const sourceImage = source.querySelector('img')
  const start = source.getBoundingClientRect()
  destinationImage.src = sourceImage.src
  detail.querySelector('.hero-content h2').textContent = button.querySelector('strong').textContent
  detail.querySelector('.artist').textContent = button.querySelector('small').textContent
  detail.style.visibility = 'visible'
  detail.style.opacity = '0'
  destination.style.opacity = '0'
  detail.removeAttribute('aria-hidden')
  if (mode === 'blend') {
    revealDetail()
    return
  }
  const end = destination.getBoundingClientRect()
  const fly = document.createElement('div')
  fly.className = 'fly'
  Object.assign(fly.style, {left: `${end.left}px`, top: `${end.top}px`, width: `${end.width}px`, height: `${end.height}px`})
  const faded = document.createElement('img')
  faded.className = 'blend-layer'
  faded.src = sourceImage.src
  faded.alt = ''
  const full = document.createElement('img')
  full.className = 'full-layer'
  full.src = sourceImage.src
  full.alt = ''
  fly.append(faded, full)
  document.body.append(fly)
  const scale = `translate(${start.left - end.left}px, ${start.top - end.top}px) scale(${start.width / end.width}, ${start.height / end.height})`
  const duration = slow ? 1050 : 420
  const options = {duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards'}
  source.style.opacity = '0'
  list.setAttribute('aria-hidden', 'true')
  const movement = fly.animate([{transform: scale, borderRadius: '7px', opacity: 1, offset: 0}, {transform: 'none', borderRadius: '0px', opacity: 1, offset: .78}, {transform: 'none', borderRadius: '0px', opacity: 0, offset: 1}], options)
  const fadeFull = full.animate(mode === 'blend' ? [{opacity: 1, offset: 0}, {opacity: 1, offset: .25}, {opacity: 0, offset: .78}, {opacity: 0, offset: 1}] : [{opacity: 1}, {opacity: 1}], {...options, easing: 'linear'})
  const reveal = destination.animate([{opacity: 0, offset: 0}, {opacity: 0, offset: .78}, {opacity: 1, offset: 1}], options)
  const pageOptions = {duration: duration * 260 / 420, easing: 'ease-out', fill: 'forwards'}
  const listFade = list.animate([{opacity: 1}, {opacity: 0}], pageOptions)
  const detailFade = detail.animate([{opacity: 0}, {opacity: 1}], pageOptions)
  Promise.allSettled([movement.finished, fadeFull.finished, reveal.finished, listFade.finished, detailFade.finished]).then(() => {
    detail.style.opacity = '1'
    destination.style.opacity = '1'
    list.style.visibility = 'hidden'
    source.style.opacity = ''
    fly.remove()
    ;[movement, fadeFull, reveal, listFade, detailFade].forEach(animation => animation.cancel())
    running = false
    back.focus({preventScroll: true})
  })
}
function revealDetail() {
  const factor = slow ? 2.5 : 1
  const content = detail.querySelector('.hero-content')
  const tracks = detail.querySelector('.tracklist')
  destination.style.opacity = '1'
  list.setAttribute('aria-hidden', 'true')
  // Keep the list opaque beneath the incoming page to avoid a dim flash.
  const dissolve = { duration: 650 * factor, easing: 'ease-in-out', fill: 'forwards' }
  const detailFade = detail.animate([{ opacity: 0 }, { opacity: 1 }], dissolve)
  const contentReveal = [content, tracks, back].map(element => element.animate(
    [{ opacity: 0 }, { opacity: 1 }],
    { delay: 80 * factor, duration: 570 * factor, easing: 'ease-in-out', fill: 'both' },
  ))
  const animations = [detailFade, ...contentReveal]
  Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
    detail.style.opacity = '1'
    list.style.visibility = 'hidden'
    animations.forEach(animation => animation.cancel())
    running = false
    back.focus({ preventScroll: true })
  })
}
albumButtons.forEach(button => button.addEventListener('click', () => openAlbum(button)))
back.addEventListener('click', restoreList)
replay.addEventListener('click', () => { if (running) return; restoreList(); requestAnimationFrame(() => openAlbum(selected)) })
speed.addEventListener('click', () => { slow = !slow; speed.setAttribute('aria-pressed', String(slow)) })
modeButtons.forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode
  modeButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)))
  modeLabel.textContent = mode === 'blend' ? '优化方案' : '当前效果'
  description.textContent = mode === 'blend' ? '页面缓慢叠化，渐隐封面静静显现。' : '完整封面移动到位后，再切换为渐隐封面。'
}))
