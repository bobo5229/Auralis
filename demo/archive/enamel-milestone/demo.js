const badge = document.querySelector('#badge')
const stage = document.querySelector('#stage')
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const outline =
  'M165 12 Q172 12 179 16 L306 89 Q316 95 316 107 L316 263 Q316 275 306 281 L179 354 Q165 362 151 354 L24 281 Q14 275 14 263 L14 107 Q14 95 24 89 L151 16 Q158 12 165 12Z'
const inner =
  'M165 30 Q169 30 174 33 L297 104 Q301 107 301 113 L301 257 Q301 263 297 266 L174 337 Q165 342 156 337 L33 266 Q29 263 29 257 L29 113 Q29 107 33 104 L156 33 Q161 30 165 30Z'
function svg(content, id) {
  return `<svg viewBox="0 0 330 370" aria-hidden="true"><defs>
  <linearGradient id="metal${id}" x1=".15" y1="0" x2=".8" y2="1"><stop stop-color="#f9f4dc"/><stop offset=".14" stop-color="#e1f1f3"/><stop offset=".25" stop-color="#657881"/><stop offset=".32" stop-color="#c0ccd0"/><stop offset=".37" stop-color="#fff9e7"/><stop offset=".43" stop-color="#71838d"/><stop offset=".58" stop-color="#283945"/><stop offset=".7" stop-color="#becdd0"/><stop offset=".76" stop-color="#fff5d2"/><stop offset=".84" stop-color="#b7bbaa"/><stop offset="1" stop-color="#536677"/></linearGradient>
  <linearGradient id="bevel${id}" x1="0" y1="0" x2="1" y2=".7"><stop stop-color="#fffced"/><stop offset=".28" stop-color="#9badb4"/><stop offset=".48" stop-color="#243b4b"/><stop offset=".62" stop-color="#ecf7f7"/><stop offset="1" stop-color="#7c8b91"/></linearGradient>
  <radialGradient id="enamel${id}" cx=".28" cy=".19" r=".89"><stop stop-color="var(--light)"/><stop offset=".25" stop-color="var(--enamel)"/><stop offset=".65" stop-color="var(--deep)"/><stop offset=".86" stop-color="var(--enamel)"/><stop offset="1" stop-color="var(--deep)"/></radialGradient>
  <linearGradient id="opal${id}" x1=".1" y1="0" x2=".85" y2="1"><stop stop-color="#efffe5"/><stop offset=".18" stop-color="#8ac7ed"/><stop offset=".4" stop-color="#9aade5"/><stop offset=".58" stop-color="#e2b1d1"/><stop offset=".76" stop-color="#8cddd3"/><stop offset="1" stop-color="#dffaf0"/></linearGradient>
  <radialGradient id="gloss${id}" cx=".23" cy=".13" r=".72"><stop stop-color="#fff" stop-opacity=".38"/><stop offset=".3" stop-color="#d8f8ff" stop-opacity=".13"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <radialGradient id="pool${id}" cx=".5" cy=".5" r=".5"><stop stop-color="var(--light)" stop-opacity=".45"/><stop offset="1" stop-color="var(--light)" stop-opacity="0"/></radialGradient>
  <filter id="soft${id}" x="-.2" y="-.2" width="1.4" height="1.4"><feGaussianBlur stdDeviation="3.5"/></filter>
  <filter id="contact${id}" x="-.2" y="-.2" width="1.4" height="1.4"><feGaussianBlur stdDeviation="1.15"/></filter>
  <clipPath id="clip${id}"><path d="${inner}"/></clipPath></defs>${content.replaceAll('$m', `url(#metal${id})`).replaceAll('$b', `url(#bevel${id})`).replaceAll('$e', `url(#enamel${id})`).replaceAll('$o', `url(#opal${id})`).replaceAll('$g', `url(#gloss${id})`).replaceAll('$p', `url(#pool${id})`).replaceAll('$s', `url(#soft${id})`).replaceAll('$a', `url(#contact${id})`).replaceAll('$c', `url(#clip${id})`)}</svg>`
}
for (let i = 0; i < 9; i++) {
  const slice = document.createElement('div')
  slice.className = 'slice'
  slice.style.setProperty('--z', `${i}px`)
  slice.innerHTML = svg(
    `<path d="${outline}" fill="${i % 3 === 0 ? '#87979d' : '#3e4d55'}" stroke="#25333b" stroke-width="1"/>`,
    `s${i}`,
  )
  badge.append(slice)
}
// Geometry and material detail stay deterministic across palettes and reloads.
const ornament = '<circle cx="165" cy="181" r="101"/><circle cx="165" cy="181" r="90"/>'
const rim = `<path d="${inner}" transform="translate(165 185) scale(.927) translate(-165 -185)"/>`
const completionRing =
  'M266 181a101 101 0 1 0-202 0a101 101 0 1 0 202 0Z M255 181a90 90 0 1 0-180 0a90 90 0 1 0 180 0Z'
// Explicit contours avoid SVG text compositing drift during the 3D award entrance.
const numeral =
  '<path fill-rule="evenodd" d="M106 162 119 156H130V209H118V170L106 175Z M158 156C143 156 137 165 137 183C137 201 143 210 158 210C173 210 179 201 179 183C179 165 173 156 158 156Z M158 167C165 167 167 172 167 183C167 194 165 199 158 199C151 199 149 194 149 183C149 172 151 167 158 167Z M207 156C192 156 186 165 186 183C186 201 192 210 207 210C222 210 228 201 228 183C228 165 222 156 207 156Z M207 167C214 167 216 172 216 183C216 194 214 199 207 199C200 199 198 194 198 183C198 172 200 167 207 167Z"/>'
// Irregular translucent facets suggest foil below the enamel, not surface glitter.
let seed = 731
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 4294967296
}
const foilColors = ['#d6ffeb', '#85dcec', '#b6a3ed', '#f3bbdb', '#90e3cf', '#c4d1fa']
let facets = ''
for (let row = 0; row < 21; row++) {
  for (let col = 0; col < 20; col++) {
    const x = 58 + col * 11 + random() * 7,
      y = 75 + row * 10 + random() * 6
    const w = 7 + random() * 8,
      h = 6 + random() * 9
    facets += `<path d="M${x} ${y}l${w * 0.8} -2 ${w * 0.3} ${h * 0.6} ${-w * 0.5} ${h * 0.5} ${-w * 0.7} ${-h * 0.2}Z" fill="${foilColors[Math.floor(random() * foilColors.length)]}" opacity="${0.17 + random() * 0.39}"/>`
  }
}
const inlays = `<defs><clipPath id="completion-ring"><path d="${completionRing}" clip-rule="evenodd"/></clipPath></defs><path d="${completionRing}" fill-rule="evenodd" fill="$o"/><g clip-path="url(#completion-ring)">${facets}<g fill="none" stroke="#173366" stroke-width="5" opacity=".4" filter="$a">${ornament}</g><ellipse cx="122" cy="94" rx="40" ry="12" fill="#f0fff4" opacity=".4" filter="$s"/></g>`
const grooves = [83, 78, 73].map((radius) => `<circle cx="165" cy="181" r="${radius}"/>`).join('')
const record = `<circle cx="165" cy="181" r="89" fill="var(--deep)"/><circle cx="165" cy="181" r="88" fill="$e"/><g fill="none" stroke="#00172d" stroke-width="1.6" opacity=".75">${grooves}</g><g fill="none" stroke="var(--light)" stroke-width=".55" opacity=".5" transform="translate(-.3 -.5)">${grooves}</g><circle cx="165" cy="181" r="68" fill="var(--deep)"/><circle cx="165" cy="181" r="68" fill="$g"/><circle cx="165" cy="181" r="68" fill="none" stroke="var(--light)" stroke-width=".65" stroke-opacity=".3"/>`
let engraving = ''
for (let i = 0; i < 96; i++) {
  const angle = (i * Math.PI) / 48
  const x = 165 + Math.cos(angle) * 155,
    y = 190 + Math.sin(angle) * 165
  engraving += `<path d="M165 190Q${165 + Math.cos(angle + 0.14) * 95} ${190 + Math.sin(angle + 0.14) * 95} ${x} ${y}"/>`
}
const layers = [
  `<path d="${outline}" fill="$m" stroke="#182936" stroke-width="2"/><path d="${outline}" fill="none" stroke="$b" stroke-width="2.2"/><path d="${outline}" transform="translate(165 185) scale(.979) translate(-165 -185)" fill="none" stroke="#e6f5f1" stroke-width=".65"/><path d="${outline}" transform="translate(165 185) scale(.952) translate(-165 -185)" fill="none" stroke="#233743" stroke-width="3"/><path d="${outline}" transform="translate(165 185) scale(.942) translate(-165 -185)" fill="none" stroke="$b" stroke-width="1.2"/><path d="${inner}" fill="#091e38" stroke="#071424" stroke-width="3"/>`,
  `<path d="${inner}" fill="$e"/><g clip-path="$c"><g fill="none" stroke="var(--light)" stroke-width=".5" opacity=".13">${engraving}</g><ellipse cx="90" cy="105" rx="86" ry="46" fill="$p" transform="rotate(-35 90 105)"/><ellipse cx="241" cy="273" rx="88" ry="27" fill="$p" transform="rotate(-32 241 273)"/><path d="${inner}" fill="none" stroke="var(--deep)" stroke-width="13" opacity=".85" filter="$s"/><g fill="none" stroke="#001124" stroke-width="6" opacity=".65" transform="translate(1 2)" filter="$a">${ornament}${rim}</g></g><path d="${inner}" fill="none" stroke="$b" stroke-width="1.4"/><path d="${inner}" transform="translate(165 185) scale(.984) translate(-165 -185)" fill="none" stroke="var(--light)" stroke-opacity=".45" stroke-width=".9"/>`,
  `${record}${inlays}`,
  `<g fill="none" stroke="#081828" stroke-width="4.8" stroke-linejoin="round">${rim}${ornament}</g><g fill="none" stroke="$m" stroke-width="3.2" stroke-linejoin="round">${rim}${ornament}</g><g fill="none" stroke="$b" stroke-width="1.25" transform="translate(-.45 -.6)">${rim}${ornament}</g><g transform="translate(0 2)" fill="#071523" stroke="#071523" stroke-width="2" filter="$a">${numeral}</g><g fill="#526471" stroke="#172735" stroke-width="1.5" transform="translate(0 1.3)">${numeral}</g><g fill="$m" stroke="$b" stroke-width=".65" paint-order="stroke fill">${numeral}</g><circle cx="165" cy="139" r="5" fill="$m" stroke="#0a2234" stroke-width="1"/><circle cx="165" cy="139" r="2" fill="#082131"/><text x="165" y="230" fill="#d6e5df" text-anchor="middle" font-family="Jakarta,sans-serif" font-size="10" font-weight="500" letter-spacing="3">HOURS</text><path d="m165 61 3 5-3 5-3-5Z" fill="$m"/><path d="M144 300h12m18 0h12" stroke="$m" stroke-width=".8"/><circle cx="165" cy="300" r="2.2" fill="$o" stroke="$b" stroke-width=".7"/>`,
  `<g clip-path="$c"><g class="sheen"><path d="${inner}" fill="$g"/><ellipse cx="97" cy="73" rx="73" ry="12" fill="#e6ffff" opacity=".19" transform="rotate(-30 97 73)" filter="$s"/></g><path d="M39 159V115Q39 112 44 109L154 45" fill="none" stroke="#d0faff" stroke-width="1.6" opacity=".62"/><path d="M291 219V256L206 306" fill="none" stroke="var(--light)" stroke-width="1.2" opacity=".48"/></g>`,
]
layers.forEach((content, i) => {
  const el = document.createElement('div')
  el.className = 'layer'
  el.style.setProperty('--z', `${[9, 10, 10.6, 11.3, 12][i]}px`)
  el.style.setProperty('--order', i)
  el.innerHTML = svg(content, i)
  badge.append(el)
})
let rx = -9,
  ry = -13,
  drag = null
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
function pose() {
  badge.style.setProperty('--rx', `${rx}deg`)
  badge.style.setProperty('--ry', `${ry}deg`)
}
function reset() {
  rx = -9
  ry = -13
  pose()
  badge.style.setProperty('--hx', '0px')
  badge.style.setProperty('--hy', '0px')
}
stage.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || e.isPrimary) {
    drag = { x: e.clientX, y: e.clientY, rx, ry }
    stage.setPointerCapture(e.pointerId)
  }
})
stage.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width - 0.5,
    y = (e.clientY - r.top) / r.height - 0.5
  if (drag) {
    rx = clamp(drag.rx - (e.clientY - drag.y) * 0.15, -24, 24)
    ry = clamp(drag.ry + (e.clientX - drag.x) * 0.15, -30, 30)
    pose()
  } else if (!reduced.matches && e.pointerType === 'mouse') {
    rx = -9 - y * 10
    ry = -13 + x * 16
    pose()
  }
  if (!reduced.matches) {
    badge.style.setProperty('--hx', `${x * 45}px`)
    badge.style.setProperty('--hy', `${y * 35}px`)
  }
})
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
  stage.addEventListener(name, () => {
    drag = null
  })
stage.addEventListener('pointerleave', () => {
  if (!drag) reset()
})
stage.addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return
  e.preventDefault()
  if (e.key === 'Home') reset()
  else {
    rx = clamp(rx + (e.key === 'ArrowDown' ? 3 : e.key === 'ArrowUp' ? -3 : 0), -24, 24)
    ry = clamp(ry + (e.key === 'ArrowRight' ? 3 : e.key === 'ArrowLeft' ? -3 : 0), -30, 30)
    pose()
  }
})
document.querySelectorAll('[data-view]').forEach((button) =>
  button.addEventListener('click', () => {
    document
      .querySelectorAll('[data-view]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b === button)))
    badge.classList.toggle('exploded', button.dataset.view === 'exploded')
    document.querySelector('#view-label').textContent =
      button.dataset.view === 'exploded' ? '五层结构 · 从底座到光泽' : '珐琅 · 银色包边'
  }),
)
document.querySelectorAll('[data-color]').forEach((button) =>
  button.addEventListener('click', () => {
    document.body.dataset.color = button.dataset.color
    document
      .querySelectorAll('[data-color]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b === button)))
    document.querySelector('#color-name').textContent = button.getAttribute('aria-label')
  }),
)
document.querySelector('#reset').addEventListener('click', reset)
