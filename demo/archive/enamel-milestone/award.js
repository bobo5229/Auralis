// This isolated demo does not listen to playback or persist achievements.
const awardDialog = document.querySelector('#award')
const awardObject = document.querySelector('#award-object')
const awardCopy = document.querySelector('#award-copy')
const awardCollect = document.querySelector('#award-collect')
const awardReplay = document.querySelector('#replay')
let awardTimers = []
let awardAnimations = []
let awardPreviousOverflow = ''
const awardTiming = { ink: 2500, ready: 3400 }

function clearAwardTimers() {
  awardTimers.forEach(clearTimeout)
  awardTimers = []
}

function clearAwardMotion() {
  awardAnimations.forEach((animation) => animation.cancel())
  awardAnimations = []
}

function addAwardShell(copy) {
  // Close the perimeter with actual CSS faces: stacked flat silhouettes disappear edge-on.
  const contour = copy.querySelector('.slice path')
  const perimeter = contour.getTotalLength()
  const faceCount = 96
  const shell = document.createDocumentFragment()
  for (let i = 0; i < faceCount; i++) {
    const a = contour.getPointAtLength((perimeter * i) / faceCount)
    const b = contour.getPointAtLength((perimeter * (i + 1)) / faceCount)
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    const light = 0.65 + 0.25 * Math.cos(angle + Math.PI / 4)
    const metal = (shade) =>
      `rgb(${Math.round(shade * light)} ${Math.round((shade + 9) * light)} ${Math.round((shade + 15) * light)})`
    const face = document.createElement('div')
    face.className = 'award-side'
    face.style.cssText = `left:${(a.x / 330) * 100}%;top:${(a.y / 370) * 100}%;width:calc(var(--award-size) * ${length / 330} + .4px);transform:translateZ(-1px) rotateZ(${angle}rad) rotateX(90deg);background:linear-gradient(${metal(160)},${metal(80)} 20%,${metal(210)} 45%,${metal(65)} 75%,${metal(155)})`
    shell.append(face)
  }
  copy.querySelectorAll('.slice').forEach((slice) => slice.remove())
  const back = document.createElement('div')
  back.className = 'award-back'
  back.innerHTML = svg(
    `<path d="${outline}" fill="$m" stroke="#ced9d9" stroke-width="1.5"/>
    <path d="${inner}" fill="$b" stroke="#334955" stroke-width="2"/>
    <path d="${inner}" transform="translate(165 185) scale(.94) translate(-165 -185)" fill="none" stroke="#e3ece7" stroke-width=".8" opacity=".5"/>
    <circle cx="165" cy="177" r="61" fill="#102633" fill-opacity=".12" stroke="#344a56" stroke-width="1.5"/>
    <circle cx="165" cy="176" r="59.5" fill="none" stroke="#e6f1eb" stroke-width=".7" opacity=".6"/>
    <g fill="none" stroke="#304955" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M140 198 165 143 190 198M150 179H180"/></g>
    <path d="M140 197 165 142 190 197M150 178H180" fill="none" stroke="#e0e9e4" stroke-width="1" opacity=".65"/>
    <circle cx="165" cy="215" r="2" fill="#334b57"/>
    <text x="165" y="265" text-anchor="middle" font-family="Jakarta,sans-serif" font-size="13" font-weight="600" letter-spacing="4" fill="#293f4a">AURALIS</text>
    <text x="165" y="282" text-anchor="middle" font-family="Jakarta,sans-serif" font-size="7" letter-spacing="1.3" fill="#344b55">LISTENING ARCHIVE</text>
    <g clip-path="$c"><rect class="award-back-sweep" x="-110" y="0" width="120" height="370" fill="url(#award-metal-stripe)"/></g>`,
    'award-reverse',
  )
  shell.append(back)
  copy.append(shell)
}

function createAwardBadge() {
  const copy = badge.cloneNode(true)
  copy.removeAttribute('id')
  copy.removeAttribute('style')
  copy.className = 'badge award-badge'
  // SVG definitions must remain unique while the observation badge is still mounted.
  const ids = new Map()
  copy.querySelectorAll('[id]').forEach((element) => {
    const original = element.id
    ids.set(original, `award-copy-${original}`)
    element.id = ids.get(original)
  })
  copy.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (attribute.value.includes('url(#')) {
        element.setAttribute(
          attribute.name,
          attribute.value.replace(/url\(#([^)]+)\)/g, (match, id) =>
            ids.has(id) ? `url(#${ids.get(id)})` : match,
          ),
        )
      }
    }
  })
  addAwardShell(copy)
  copy.insertAdjacentHTML(
    'beforeend',
    `<svg class="award-light" viewBox="0 0 330 370" aria-hidden="true">
      <defs>
        <clipPath id="award-light-rim"><path d="${outline} ${inner}" clip-rule="evenodd"/></clipPath>
        <clipPath id="award-light-enamel"><path d="${inner}"/></clipPath>
        <clipPath id="award-light-foil"><path d="${completionRing}" clip-rule="evenodd"/></clipPath>
        <clipPath id="award-light-number">${numeral}</clipPath>
        <linearGradient id="award-metal-stripe"><stop stop-color="#edffff" stop-opacity="0"/><stop offset=".44" stop-color="#d1eeff" stop-opacity=".12"/><stop offset=".5" stop-color="#fffbe5" stop-opacity=".95"/><stop offset=".58" stop-color="#edffff" stop-opacity=".2"/><stop offset="1" stop-color="#edffff" stop-opacity="0"/></linearGradient>
        <radialGradient id="award-enamel-soft"><stop stop-color="#d9ffff" stop-opacity=".45"/><stop offset=".45" stop-color="#aadfff" stop-opacity=".16"/><stop offset="1" stop-color="#d9ffff" stop-opacity="0"/></radialGradient>
        <linearGradient id="award-foil-spectrum" x2="1" y2="1"><stop stop-color="#91ffff" stop-opacity="0"/><stop offset=".3" stop-color="#c5ffef" stop-opacity=".65"/><stop offset=".48" stop-color="#ddd4ff" stop-opacity=".8"/><stop offset=".65" stop-color="#ffccdd" stop-opacity=".6"/><stop offset="1" stop-color="#d5fff2" stop-opacity="0"/></linearGradient>
      </defs>
      <path class="award-edge-trace" d="${outline}" pathLength="1" fill="none" stroke="#efffff" stroke-width="1.6" stroke-linecap="round"/>
      <g clip-path="url(#award-light-rim)"><rect class="award-metal-sweep" x="-110" y="-30" width="120" height="450" fill="url(#award-metal-stripe)"/></g>
      <g clip-path="url(#award-light-enamel)"><ellipse class="award-enamel-sweep" cx="10" cy="100" rx="145" ry="75" fill="url(#award-enamel-soft)"/></g>
      <g clip-path="url(#award-light-foil)"><rect class="award-foil-sweep" x="-130" y="50" width="200" height="260" fill="url(#award-foil-spectrum)"/></g>
      <circle class="award-ring-trace" cx="165" cy="181" r="96" pathLength="1"/>
      <g clip-path="url(#award-light-number)"><rect class="award-number-sweep" x="45" y="145" width="80" height="80" fill="url(#award-metal-stripe)"/></g>
    </svg>`,
  )
  return copy
}

function animateAward(copy) {
  const play = (element, frames, duration, delay = 0, easing = 'cubic-bezier(.22,.7,.25,1)') => {
    awardAnimations.push(element.animate(frames, { duration, delay, easing, fill: 'both' }))
  }
  // Keep opacity off the preserve-3d body, so it cannot flatten the back and side faces.
  play(awardObject, [{ opacity: 0 }, { opacity: 1 }], 300)
  play(
    copy,
    [
      {
        transform:
          'translate(-10px, 22px) scale(.88) rotateX(10deg) rotateY(-180deg) rotateZ(-9deg)',
        offset: 0,
        easing: 'cubic-bezier(.2,.7,.3,1)',
      },
      {
        transform: 'translate(-6px, 3px) scale(.97) rotateX(13deg) rotateY(-168deg) rotateZ(-8deg)',
        offset: 0.2,
        easing: 'cubic-bezier(.5,0,.7,.4)',
      },
      {
        transform: 'translate(0, -6px) scale(1.025) rotateX(8deg) rotateY(-90deg) rotateZ(-3deg)',
        offset: 0.46,
        easing: 'cubic-bezier(.18,.65,.25,1)',
      },
      {
        transform: 'translate(3px, -3px) scale(1.015) rotateX(-3deg) rotateY(11deg) rotateZ(2deg)',
        offset: 0.72,
        easing: 'cubic-bezier(.25,.1,.25,1)',
      },
      {
        transform: 'translate(-1px, 0) scale(1) rotateX(1deg) rotateY(-3deg) rotateZ(-.5deg)',
        offset: 0.87,
        easing: 'ease-out',
      },
      {
        transform: 'translate(0, 0) scale(1) rotateX(0deg) rotateY(0deg) rotateZ(0deg)',
        offset: 1,
      },
    ],
    2200,
    0,
    'linear',
  )
  const surfaces = copy.querySelectorAll('.layer')
  const starts = [0, 650, 800, 950, 1200]
  surfaces.forEach((surface, index) => {
    play(surface, [{ opacity: 0.07 }, { opacity: 1 }], 650, starts[index])
  })
  const q = (selector) => copy.querySelector(selector)
  play(
    q('.award-back-sweep'),
    [
      { transform: 'translateX(0) skewX(-18deg)', opacity: 0 },
      { opacity: 0.7, offset: 0.4 },
      { transform: 'translateX(480px) skewX(-18deg)', opacity: 0 },
    ],
    800,
    100,
  )
  play(
    q('.award-edge-trace'),
    [
      { strokeDasharray: '.19 .81', strokeDashoffset: '.25', opacity: 0 },
      { strokeDasharray: '.19 .81', strokeDashoffset: '-.02', opacity: 0.95, offset: 0.3 },
      { strokeDasharray: '.19 .81', strokeDashoffset: '-.65', opacity: 0 },
    ],
    800,
    1000,
  )
  play(
    q('.award-metal-sweep'),
    [
      { transform: 'translateX(-30px) skewX(-18deg)', opacity: 0 },
      { opacity: 0.9, offset: 0.25 },
      { transform: 'translateX(500px) skewX(-18deg)', opacity: 0 },
    ],
    1000,
    1050,
  )
  play(
    q('.award-enamel-sweep'),
    [
      { transform: 'translate(-70px, -25px) rotate(-22deg)', opacity: 0 },
      { opacity: 0.8, offset: 0.45 },
      { transform: 'translate(280px, 190px) rotate(-22deg)', opacity: 0 },
    ],
    1100,
    1100,
  )
  play(
    q('.award-foil-sweep'),
    [
      { transform: 'translateX(0)', opacity: 0 },
      { opacity: 0.85, offset: 0.4 },
      { transform: 'translateX(480px)', opacity: 0 },
    ],
    1050,
    1200,
  )
  play(
    q('.award-ring-trace'),
    [
      { strokeDashoffset: 1, opacity: 0 },
      { opacity: 0.8, offset: 0.15 },
      { strokeDashoffset: 0, opacity: 0.6, offset: 0.8 },
      { strokeDashoffset: 0, opacity: 0 },
    ],
    1000,
    1250,
  )
  play(
    q('.award-number-sweep'),
    [
      { transform: 'translateX(0) skewX(-16deg)', opacity: 0 },
      { opacity: 0.9, offset: 0.4 },
      { transform: 'translateX(230px) skewX(-16deg)', opacity: 0 },
    ],
    650,
    1750,
  )
  play(
    document.querySelector('.award-object-shadow'),
    [
      { transform: 'translate(-50%, 22px) scale(1.4)', opacity: 0 },
      { opacity: 0.28, offset: 0.45 },
      { transform: 'translate(-50%, 0) scale(1)', opacity: 0.45 },
    ],
    2300,
  )
}

function readyAward() {
  clearAwardTimers()
  clearAwardMotion()
  if (!awardDialog.open) return
  awardDialog.dataset.phase = 'ready'
  awardCopy.inert = false
  awardCollect.focus({ preventScroll: true })
}

function startAward() {
  clearAwardTimers()
  clearAwardMotion()
  awardCopy.inert = true
  awardDialog.dataset.phase = 'enter'
  const awardBadge = createAwardBadge()
  const shadow = document.createElement('div')
  shadow.className = 'award-object-shadow'
  awardObject.replaceChildren(shadow, awardBadge)
  if (!awardDialog.open) {
    awardPreviousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    awardDialog.showModal()
  }
  awardDialog.focus({ preventScroll: true })
  if (reduced.matches) {
    readyAward()
    return
  }
  animateAward(awardBadge)
  awardTimers.push(
    setTimeout(() => {
      clearAwardMotion()
      awardDialog.dataset.phase = 'ink'
    }, awardTiming.ink),
  )
  awardTimers.push(setTimeout(readyAward, awardTiming.ready))
}

function closeAward(collected = false) {
  if (!awardDialog.open) return
  clearAwardTimers()
  clearAwardMotion()
  awardDialog.close()
  document.querySelector('#status').textContent = collected
    ? '已收下「百小时聆听」· 仅为演示'
    : '授章演示已关闭，可随时重播'
}

awardDialog.addEventListener('close', () => {
  clearAwardTimers()
  clearAwardMotion()
  awardObject.replaceChildren()
  awardDialog.removeAttribute('data-phase')
  awardCopy.inert = true
  document.body.style.overflow = awardPreviousOverflow
  awardReplay.focus({ preventScroll: true })
})
awardDialog.addEventListener('cancel', (event) => {
  event.preventDefault()
  closeAward()
})
awardDialog.addEventListener('click', (event) => {
  if (event.target === awardDialog) closeAward()
})
awardCollect.addEventListener('click', () => closeAward(true))
document.querySelector('#award-again').addEventListener('click', startAward)
awardReplay.addEventListener('click', startAward)
reduced.addEventListener('change', () => {
  if (reduced.matches && awardDialog.open) readyAward()
})
