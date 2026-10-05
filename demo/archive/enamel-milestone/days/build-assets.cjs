// Offline authoring: retain the established silver hexagon across consecutive-day motifs.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')

const source = fs.readFileSync(path.join(__dirname, '../demo.js'), 'utf8')
const boundary = source.indexOf('layers.forEach(')
assert(boundary > 0, 'Existing badge material layers must be available')
const original = vm.runInNewContext(
  source.slice(0, boundary) + '\n;({ layers, svg, outline, inner, rim })',
  {
    document: {
      querySelector: () => ({ append() {} }),
      createElement: () => ({ style: { setProperty() {} } }),
    },
    matchMedia: () => ({ matches: true }),
  },
)

function seven(y = 190, scale = 1.2) {
  return `<g transform="translate(${165 - 21 * scale} ${y}) scale(${scale})"><path d="M0 0H42V10L21 54H7L28 11H0Z"/></g>`
}

function days(y = 268, color = '#c5d8ec') {
  return `<g transform="translate(147 ${y})" fill="none" stroke="${color}" stroke-width=".95" stroke-linecap="square" stroke-linejoin="round"><path d="M0 7V0H2Q6 0 6 3.5Q6 7 2 7Z M10 7 13 0H14L17 7M11.2 4.5H15.8 M21 0 24 3.5 27 0M24 3.5V7 M36 .5Q35 0 33.5 0Q31 0 31 2Q31 3.5 33.5 3.5Q36 3.5 36 5.3Q36 7 33.5 7Q32 7 31 6.5"/></g>`
}

function wire(shape, width = 2.6) {
  return `<g fill="none" stroke="#060e25" stroke-width="${width + 2}" transform="translate(.5 1)" filter="$a" opacity=".6">${shape}</g><g fill="none" stroke="$m" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${shape}</g><g fill="none" stroke="$b" stroke-width=".65" transform="translate(-.35 -.5)">${shape}</g>`
}

// Stylized sky orientation: a four-star bowl and a three-star bent handle.
// Sizes and positions are composed for the badge, rather than an observing chart.
const stars = [
  { name: 'Dubhe', x: 245, y: 104, radius: 8.3, opal: true },
  { name: 'Merak', x: 241, y: 149, radius: 6.8 },
  { name: 'Phecda', x: 183, y: 159, radius: 6.6 },
  { name: 'Megrez', x: 170, y: 120, radius: 5.2 },
  { name: 'Alioth', x: 132, y: 115, radius: 8.6, opal: true },
  { name: 'Mizar', x: 100, y: 125, radius: 7.1 },
  { name: 'Alkaid', x: 72, y: 153, radius: 7.6 },
]
const constellation = stars
  .map(({ name, x, y, radius: r, opal }) => {
    const tip = (r * 0.23).toFixed(3)
    const shape = `<path d="M0 ${-r} ${tip} ${-tip} ${r * 0.85} 0 ${tip} ${tip} 0 ${r} ${-tip} ${tip} ${-r * 0.85} 0 ${-tip} ${-tip}Z"/>`
    return `<g data-star="${name}" transform="translate(${x} ${y})">
    <g fill="#020819" stroke="#020819" stroke-width="1.6" transform="translate(.5 1.4)" filter="$a">${shape}</g>
    <g fill="#6c819b" stroke="#283c58" stroke-width=".75" transform="translate(0 .7)">${shape}</g>
    <g fill="$m" stroke="$b" stroke-width=".6">${shape}</g>
    <path d="M0 ${-r + 1} 0 0 ${-r * 0.85 + 1} 0Z" fill="#eff8ff" opacity=".48"/>
    <path d="M0 -2.1 2.1 0 0 2.1 -2.1 0Z" fill="${opal ? '$o' : '#e6f4fb'}"/>
  </g>`
  })
  .join('')

const surface = `<defs>
  <radialGradient id="north-enamel" cx=".27" cy=".16" r=".95"><stop stop-color="#6b90ba"/><stop offset=".25" stop-color="#264976"/><stop offset=".58" stop-color="#101e40"/><stop offset=".8" stop-color="#25416b"/><stop offset="1" stop-color="#0e1937"/></radialGradient>
  <linearGradient id="north-bowl" x1=".2" y1="0" x2=".8" y2="1"><stop stop-color="#a5c8e9" stop-opacity=".18"/><stop offset="1" stop-color="#5b72b2" stop-opacity=".04"/></linearGradient>
</defs>
<path d="${original.inner}" fill="url(#north-enamel)"/>
<g clip-path="$c">
  <path d="${original.inner}" fill="none" stroke="#030c22" stroke-width="11" opacity=".65" filter="$s"/>
  <ellipse cx="87" cy="93" rx="73" ry="28" transform="rotate(-31 87 93)" fill="#c8e0fa" opacity=".15" filter="$s"/>
  <ellipse cx="233" cy="279" rx="60" ry="15" transform="rotate(-31 233 279)" fill="#6586c2" opacity=".16" filter="$s"/>
</g>
<path d="${original.inner}" fill="none" stroke="$b" stroke-width="1.4"/>
${wire(original.rim, 2.8)}
<path d="M170 120 245 104 241 149 183 159Z" fill="url(#north-bowl)"/>
${wire('<path d="M72 153 100 125 132 115 170 120 245 104 241 149 183 159 170 120"/>', 1.05)}
${constellation}
<g fill="#060d23" stroke="#060d23" stroke-width="2" transform="translate(0 2)" filter="$a">${seven()}</g>
<g fill="#53677d" stroke="#203048" stroke-width="1.5" transform="translate(0 1.4)">${seven()}</g>
<g fill="$m" stroke="$b" stroke-width=".7" paint-order="stroke fill">${seven()}</g>
${days()}
<path d="M151 295H179" fill="none" stroke="$b" stroke-width=".65" opacity=".55"/>`

let lit = [original.layers[0], surface, original.layers[4]]
  .map((layer, index) => original.svg(layer, `week-${index}`))
  .join('')
  .replace(/<svg[^>]*>|<\/svg>/g, '')
  .replaceAll('var(--enamel)', '#264976')
  .replaceAll('var(--deep)', '#101e40')
  .replaceAll('var(--light)', '#a8c8e8')
  .replace(/id="([^"]+)"/g, 'id="days-7-$1"')
  .replace(/url\(#([^)]+)\)/g, 'url(#days-7-$1)')
lit = `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="370" viewBox="0 0 330 370" role="img" aria-labelledby="days-7-title"><title id="days-7-title">连续 7 天 · 一周相伴</title><desc>银色六边形徽章，午夜蓝珐琅，七枚银色星芒与细银线构成北斗七星，下方为金属浮雕 7 与 DAYS。</desc><path d="${original.outline}" transform="translate(0 4)" fill="#26364e" stroke="#526a88" stroke-width="2"/>${lit}</svg>\n`

// Derive the unlit face from the shared metal blank, retaining its exact frame and well.
const blank = fs.readFileSync(
  path.join(__dirname, '../hours/assets/hours-unlit-template.svg'),
  'utf8',
)
const stampStart = blank.indexOf('<g id="hours-unlit-template-value">')
const unitStart = blank.indexOf('<g transform="translate(144 223)"', stampStart)
assert(stampStart > 0 && unitStart > stampStart, 'Shared unlit template stamp contract')
assert(/^<g[^>]*>[\s\S]*<\/g>\s*<\/svg>\s*$/.test(blank.slice(unitStart)))
const stamp = seven(158, 0.91)
const unlit = (
  blank.slice(0, stampStart) +
  `<g id="days-7-unlit-value"><g fill="#1c262d" stroke="#1c262d" stroke-width="1.5" transform="translate(0 1.2)">${stamp}</g><g fill="url(#days-7-unlit-stamp)" stroke="#b9c1c3" stroke-opacity=".22" stroke-width=".45">${stamp}</g></g>${days(223, '#9ba7ad')}</svg>\n`
)
  .replaceAll('hours-unlit-template', 'days-7-unlit')
  .replace('未点亮徽章模板', '连续 7 天 · 未点亮')
  .replace('浅浮雕小时数', '浅浮雕天数与 DAYS')

// Match the hour-series outlined numerals; add a bespoke 2 with the same 42 × 54 grid.
const heartDigits = [
  'M3 0H40V11H14L13 21C17 19 20 19 24 19C36 19 42 26 42 36C42 48 34 54 21 54C12 54 5 51 0 47L6 37C10 41 15 43 21 43C27 43 30 40 30 36C30 31 27 29 22 29C17 29 13 30 9 33L1 28Z',
  'M1 13C3 4 10 0 21 0C34 0 41 7 41 17C41 26 36 31 28 37L19 43H42V54H0V44L20 27C26 22 29 20 29 16C29 12 26 10 21 10C16 10 13 13 12 18Z',
  'M21 0C6 0 0 9 0 27C0 45 6 54 21 54C36 54 42 45 42 27C42 9 36 0 21 0Z M21 11C28 11 30 16 30 27C30 38 28 43 21 43C14 43 12 38 12 27C12 16 14 11 21 11Z',
]
function fiveTwenty(y = 229, scale = 1) {
  return `<g transform="translate(${165 - 70 * scale} ${y}) scale(${scale})">${heartDigits.map((d, i) => `<path transform="translate(${i * 49} 0)" fill-rule="evenodd" d="${d}"/>`).join('')}</g>`
}
const heartContour =
  'M165 111C144 80 100 80 89 109C71 151 117 177 165 207C213 177 259 151 241 109C230 80 186 80 165 111Z'
const track = (scale) =>
  `<path d="${heartContour}" transform="translate(165 147) scale(${scale}) translate(-165 -147)"/>`
let inlayFacets = ''
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 8; col++) {
    const x = 88 + col * 9 + ((row * 7 + col * 3) % 5)
    const y = 87 + row * 10 + ((row * 3 + col * 7) % 5)
    const colors = ['#edcfdf', '#c6e9e2', '#abb5e6', '#f6e4c0']
    inlayFacets += `<path d="M${x} ${y}l7 -2 3 6-6 4-5-3Z" fill="${colors[(row + col) % colors.length]}" opacity=".42"/>`
  }
}
const heartSurface = `<defs>
  <radialGradient id="garnet-enamel" cx=".27" cy=".18" r=".92"><stop stop-color="#d491a2"/><stop offset=".2" stop-color="#9d3d58"/><stop offset=".48" stop-color="#53182e"/><stop offset=".72" stop-color="#350f23"/><stop offset=".89" stop-color="#792740"/><stop offset="1" stop-color="#310d20"/></radialGradient>
  <radialGradient id="heart-well" cx=".25" cy=".17" r=".86"><stop stop-color="#ac536a"/><stop offset=".35" stop-color="#71293f"/><stop offset=".76" stop-color="#3c1328"/><stop offset="1" stop-color="#612138"/></radialGradient>
  <clipPath id="inlay-sector"><path d="M75 82H145L158 115 126 164H75Z"/></clipPath>
  <mask id="inlay-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="330" height="370"><g fill="none" stroke="#fff" stroke-width="5.2" clip-path="url(#inlay-sector)">${track(0.86)}</g></mask>
</defs>
<path d="${original.inner}" fill="url(#garnet-enamel)"/>
<g clip-path="$c">
  <path d="${original.inner}" fill="none" stroke="#250918" stroke-width="12" opacity=".75" filter="$s"/>
  <ellipse cx="91" cy="98" rx="67" ry="24" transform="rotate(-31 91 98)" fill="#f5b9c4" opacity=".17" filter="$s"/>
  <ellipse cx="242" cy="275" rx="53" ry="19" transform="rotate(-31 242 275)" fill="#d6899e" opacity=".17" filter="$s"/>
</g>
<path d="${original.inner}" fill="none" stroke="$b" stroke-width="1.4"/>
${wire(original.rim, 2.8)}
<path d="${heartContour}" fill="url(#heart-well)"/>
<g data-heart-track="outer">${wire(track(1), 3.1)}</g>
<g data-heart-track="middle">${wire(track(0.86), 1.9)}</g>
<g clip-path="url(#inlay-sector)">
  <g fill="none" stroke="#210919" stroke-width="10" transform="translate(.5 1)" filter="$a">${track(0.86)}</g>
  <g fill="none" stroke="$m" stroke-width="7.8" stroke-linejoin="round">${track(0.86)}</g>
  <g fill="none" stroke="$o" stroke-width="5.2">${track(0.86)}</g>
</g>
<g mask="url(#inlay-mask)">${inlayFacets}</g>
<g data-heart-track="inner">${wire(track(0.72), 1.3)}</g>
<g fill="none" stroke="#f7d3d9" stroke-width=".6" opacity=".24" transform="translate(-.35 -.6)">${track(0.62)}</g>
<path d="M158 202Q165 209 174 202" fill="none" stroke="#220b1c" stroke-width="4" transform="translate(.5 1)" filter="$a"/>
<path d="M158 202Q165 209 174 202" fill="none" stroke="$m" stroke-width="2.2" stroke-linecap="round"/>
<g fill="#220919" stroke="#220919" stroke-width="2" transform="translate(0 2)" filter="$a">${fiveTwenty()}</g>
<g fill="#71626c" stroke="#382533" stroke-width="1.5" transform="translate(0 1.4)">${fiveTwenty()}</g>
<g fill="$m" stroke="$b" stroke-width=".7" paint-order="stroke fill">${fiveTwenty()}</g>
${days(299, '#e5c5d1')}
<path d="M151 318H179" fill="none" stroke="$b" stroke-width=".65" opacity=".5"/>`
let heartLit = [original.layers[0], heartSurface, original.layers[4]]
  .map((layer, index) => original.svg(layer, `heart-${index}`))
  .join('')
  .replace(/<svg[^>]*>|<\/svg>/g, '')
  .replaceAll('var(--enamel)', '#8b304c')
  .replaceAll('var(--deep)', '#350f23')
  .replaceAll('var(--light)', '#e9b9c7')
  .replace(/id="([^"]+)"/g, 'id="days-520-$1"')
  .replace(/url\(#([^)]+)\)/g, 'url(#days-520-$1)')
heartLit = `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="370" viewBox="0 0 330 370" role="img" aria-labelledby="days-520-title"><title id="days-520-title">连续 520 天 · 倾心相伴</title><desc>银色六边形徽章，深石榴红珐琅，三道心形银色音轨与局部虹彩嵌饰，下方为金属浮雕 520 与 DAYS。</desc><path d="${original.outline}" transform="translate(0 4)" fill="#3d2836" stroke="#7c6574" stroke-width="2"/>${heartLit}</svg>\n`
const heartStamp = fiveTwenty(158, 0.91)
const heartUnlit = (
  blank.slice(0, stampStart) +
  `<g id="days-520-unlit-value"><g fill="#1c262d" stroke="#1c262d" stroke-width="1.5" transform="translate(0 1.2)">${heartStamp}</g><g fill="url(#days-520-unlit-stamp)" stroke="#b9c1c3" stroke-opacity=".22" stroke-width=".45">${heartStamp}</g></g>${days(223, '#9ba7ad')}</svg>\n`
)
  .replaceAll('hours-unlit-template', 'days-520-unlit')
  .replace('未点亮徽章模板', '连续 520 天 · 未点亮')
  .replace('浅浮雕小时数', '浅浮雕天数与 DAYS')

// The lit numeral is the object itself: one tonearm and two annular vinyl records.
function hundredStamp(y = 158, scale = 0.91) {
  return `<g transform="translate(${165 - 61 * scale} ${y}) scale(${scale})"><path d="M0 6 13 0H24V53H12V14L0 19Z"/><path transform="translate(31 0)" fill-rule="evenodd" d="${heartDigits[2]}"/><path transform="translate(80 0)" fill-rule="evenodd" d="${heartDigits[2]}"/></g>`
}
function vinylZero(cx, inlay = false) {
  const groove = [
    [31, 50],
    [27, 44],
    [23, 39],
  ]
    .map(([rx, ry]) => `<ellipse cx="${cx}" cy="181" rx="${rx}" ry="${ry}"/>`)
    .join('')
  const annulus = `M${cx + 35} 181a35 56 0 1 0-70 0a35 56 0 1 0 70 0Z M${cx + 18} 181a18 34 0 1 0-36 0a18 34 0 1 0 36 0Z`
  const rim = `<ellipse cx="${cx}" cy="181" rx="35" ry="56"/>`
  const well = `<ellipse cx="${cx}" cy="181" rx="18" ry="34"/>`
  return `<g data-music-disc="${cx}">
    <ellipse cx="${cx + 0.6}" cy="183" rx="37" ry="57" fill="#051e27" filter="$a" opacity=".85"/>
    <path d="${annulus}" fill="url(#vinyl-enamel)" fill-rule="evenodd"/>
    <g fill="none" stroke="#061d27" stroke-width="1.35" opacity=".9">${groove}</g>
    <g fill="none" stroke="#9ecad0" stroke-width=".5" transform="translate(-.4 -.5)" opacity=".5">${groove}</g>
    ${wire(rim, 2.8)}
    <ellipse cx="${cx}" cy="181" rx="18" ry="34" fill="url(#vinyl-label)"/>
    ${wire(well, 1.6)}
    <ellipse cx="${cx - 13}" cy="151" rx="9" ry="20" fill="#d9f1e9" opacity=".1" transform="rotate(18 ${cx - 13} 151)" filter="$s"/>
    <circle cx="${cx}" cy="181" r="3.1" fill="$m" stroke="#08232d" stroke-width=".8"/>
    <circle cx="${cx}" cy="181" r="1.1" fill="#071e26"/>
    ${inlay ? `<path d="M${cx - 25} 148A31 50 0 0 1 ${cx - 9} 133" fill="none" stroke="$m" stroke-width="5.5" stroke-linecap="round"/><path d="M${cx - 25} 148A31 50 0 0 1 ${cx - 9} 133" fill="none" stroke="$o" stroke-width="3.2" stroke-linecap="round"/>` : ''}
  </g>`
}
const oneArm = '<path d="M58 138 77 123H89V237H75V143L58 153Z"/>'
const armRoute = '<path d="M82 151V190Q82 198 89 201L117 213"/>'
const recordSurface = `<defs>
  <radialGradient id="petrol-enamel" cx=".26" cy=".17" r=".92"><stop stop-color="#9ccbc8"/><stop offset=".22" stop-color="#387f88"/><stop offset=".55" stop-color="#0c3c49"/><stop offset=".76" stop-color="#092e36"/><stop offset=".89" stop-color="#24656f"/><stop offset="1" stop-color="#092c36"/></radialGradient>
  <radialGradient id="vinyl-enamel" cx=".25" cy=".12" r=".87"><stop stop-color="#648e9b"/><stop offset=".3" stop-color="#24505f"/><stop offset=".65" stop-color="#0a2631"/><stop offset=".86" stop-color="#386774"/><stop offset="1" stop-color="#102e3d"/></radialGradient>
  <radialGradient id="vinyl-label" cx=".27" cy=".15" r=".89"><stop stop-color="#143c47"/><stop offset="1" stop-color="#051d27"/></radialGradient>
</defs>
<path d="${original.inner}" fill="url(#petrol-enamel)"/>
<g clip-path="$c">
  <path d="${original.inner}" fill="none" stroke="#051f2a" stroke-width="12" opacity=".75" filter="$s"/>
  <ellipse cx="91" cy="98" rx="67" ry="25" transform="rotate(-31 91 98)" fill="#c6ece3" opacity=".16" filter="$s"/>
  <ellipse cx="241" cy="275" rx="60" ry="18" transform="rotate(-31 241 275)" fill="#86c8c7" opacity=".16" filter="$s"/>
</g>
<path d="${original.inner}" fill="none" stroke="$b" stroke-width="1.4"/>
${wire(original.rim, 2.8)}
<path d="m165 70 2.7 4.5-2.7 4.5-2.7-4.5Z" fill="$m"/>
${vinylZero(156, true)}
${vinylZero(236)}
<g data-music-stylus="one">
  <g fill="#051e27" stroke="#051e27" stroke-width="2" transform="translate(.5 2)" filter="$a">${oneArm}</g>
  <g fill="#526c74" stroke="#163944" stroke-width="1.5" transform="translate(0 1.3)">${oneArm}</g>
  <g fill="$m" stroke="$b" stroke-width=".7" paint-order="stroke fill">${oneArm}</g>
  <path d="M78 161V222" fill="none" stroke="#122f3b" stroke-width=".6" opacity=".6"/>
  <circle cx="82" cy="145" r="5.3" fill="$m" stroke="#11333d" stroke-width=".85"/>
  <circle cx="82" cy="145" r="2.6" fill="#0c3440" stroke="$b" stroke-width=".65"/>
  ${wire(armRoute, 4.3)}
  <path d="m112 207 13 6-5 9-13-6Z" fill="#071d27" transform="translate(.5 1.3)" filter="$a"/>
  <path d="m112 207 13 6-5 9-13-6Z" fill="$m" stroke="#143642" stroke-width="1.2"/>
  <path d="m121 216 13 2" fill="none" stroke="#edf4e8" stroke-width="1" stroke-linecap="round"/>
</g>
${days(265, '#c4dfdb')}
<path d="M144 291H156M174 291H186" fill="none" stroke="$b" stroke-width=".7" opacity=".65"/>
<circle cx="165" cy="291" r="2.2" fill="$o" stroke="$b" stroke-width=".6"/>`
let recordLit = [original.layers[0], recordSurface, original.layers[4]]
  .map((layer, index) => original.svg(layer, `record-${index}`))
  .join('')
  .replace(/<svg[^>]*>|<\/svg>/g, '')
  .replaceAll('var(--enamel)', '#206d72')
  .replaceAll('var(--deep)', '#092e36')
  .replaceAll('var(--light)', '#9ad6cf')
  .replace(/id="([^"]+)"/g, 'id="days-100-$1"')
  .replace(/url\(#([^)]+)\)/g, 'url(#days-100-$1)')
recordLit = `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="370" viewBox="0 0 330 370" role="img" aria-labelledby="days-100-title"><title id="days-100-title">连续 100 天 · 百日留声</title><desc>银色六边形徽章，深青珐琅，数字 1 化作银色唱针，两个 0 化作椭圆唱片音轨，整体读作 100，下方独立标注 DAYS。</desc><path d="${original.outline}" transform="translate(0 4)" fill="#213d47" stroke="#537985" stroke-width="2"/>${recordLit}</svg>\n`
const recordStamp = hundredStamp()
const recordUnlit = (
  blank.slice(0, stampStart) +
  `<g id="days-100-unlit-value"><g fill="#1c262d" stroke="#1c262d" stroke-width="1.5" transform="translate(0 1.2)">${recordStamp}</g><g fill="url(#days-100-unlit-stamp)" stroke="#b9c1c3" stroke-opacity=".22" stroke-width=".45">${recordStamp}</g></g>${days(223, '#9ba7ad')}</svg>\n`
)
  .replaceAll('hours-unlit-template', 'days-100-unlit')
  .replace('未点亮徽章模板', '连续 100 天 · 未点亮')
  .replace('浅浮雕小时数', '浅浮雕天数与 DAYS')

// Two silver-edged crescents form 3; a continuous phase ring forms 0.
const upperMoon =
  'M78 131C96 111 138 111 151 135C164 158 145 181 111 181C136 169 140 151 130 139C117 124 94 122 78 131Z'
const lowerMoon =
  'M111 177C148 172 163 196 153 217C140 245 98 250 74 230C104 241 132 226 134 207C136 194 126 185 111 177Z'
const phaseRing =
  'M262 179a44 61 0 1 0-88 0a44 61 0 1 0 88 0Z M242 179a24 42 0 1 0-48 0a24 42 0 1 0 48 0Z'
function crescent(d, lower = false) {
  const shape = `<path d="${d}"/>`
  return `<g data-moon-crescent="${lower ? 'lower' : 'upper'}">
    <g fill="#080d2c" stroke="#080d2c" stroke-width="3" transform="translate(.6 2)" filter="$a">${shape}</g>
    <g fill="#656080" stroke="#242340" stroke-width="2" transform="translate(0 1.4)">${shape}</g>
    <path d="${d}" fill="url(#${lower ? 'violet-pearl' : 'white-pearl'})"/>
    ${wire(shape, 1.8)}
  </g>`
}
const lunarSurface = `<defs>
  <radialGradient id="lunar-enamel" cx=".26" cy=".16" r=".93"><stop stop-color="#a4aacd"/><stop offset=".23" stop-color="#595d91"/><stop offset=".51" stop-color="#292951"/><stop offset=".73" stop-color="#181b3d"/><stop offset=".89" stop-color="#43436e"/><stop offset="1" stop-color="#191c3f"/></radialGradient>
  <linearGradient id="white-pearl" x1=".1" y1=".1" x2=".92" y2=".9"><stop stop-color="#f8f3df"/><stop offset=".27" stop-color="#e4eaf0"/><stop offset=".52" stop-color="#c2c7e1"/><stop offset=".75" stop-color="#a29ac5"/><stop offset="1" stop-color="#e6dcec"/></linearGradient>
  <linearGradient id="violet-pearl" x1=".1" y1=".08" x2=".9" y2="1"><stop stop-color="#d9d2ec"/><stop offset=".28" stop-color="#a49fc7"/><stop offset=".55" stop-color="#d5d9ed"/><stop offset=".8" stop-color="#f1ecdd"/><stop offset="1" stop-color="#b4afcf"/></linearGradient>
  <linearGradient id="phase-enamel" x1=".04" y1=".25" x2=".97" y2=".62"><stop stop-color="#272750"/><stop offset=".25" stop-color="#4e4d78"/><stop offset=".49" stop-color="#9a92bc"/><stop offset=".7" stop-color="#c9c7de"/><stop offset="1" stop-color="#f4f0dc"/></linearGradient>
  <radialGradient id="moon-well" cx=".25" cy=".15" r=".9"><stop stop-color="#33355f"/><stop offset="1" stop-color="#10152f"/></radialGradient>
  <clipPath id="phase-clip"><path d="${phaseRing}" clip-rule="evenodd"/></clipPath>
  <clipPath id="pearl-inlay"><path d="M242 131C251 146 255 161 254 177L242 177C242 163 239 151 233 143Z"/></clipPath>
</defs>
<path d="${original.inner}" fill="url(#lunar-enamel)"/>
<g clip-path="$c">
  <path d="${original.inner}" fill="none" stroke="#10132f" stroke-width="12" opacity=".75" filter="$s"/>
  <ellipse cx="91" cy="98" rx="67" ry="25" transform="rotate(-31 91 98)" fill="#e2ddec" opacity=".16" filter="$s"/>
  <ellipse cx="242" cy="276" rx="59" ry="18" transform="rotate(-31 242 276)" fill="#aca8dc" opacity=".17" filter="$s"/>
</g>
<path d="${original.inner}" fill="none" stroke="$b" stroke-width="1.4"/>
${wire(original.rim, 2.8)}
${crescent(upperMoon)}
${crescent(lowerMoon, true)}
<path d="M100 123C126 119 145 132 148 145" fill="none" stroke="#fff9e9" stroke-width=".7" opacity=".65"/>
<path d="M147 205C139 227 116 239 91 236" fill="none" stroke="#f7f2e5" stroke-width=".7" opacity=".55"/>
<g data-moon-ring="zero">
  <ellipse cx="218.6" cy="181" rx="46" ry="62" fill="#0a102b" opacity=".9" filter="$a"/>
  <path d="${phaseRing}" fill="url(#phase-enamel)" fill-rule="evenodd"/>
  <g clip-path="url(#phase-clip)">
    <path d="M218 118C175 137 173 218 218 240C160 241 153 119 218 118Z" fill="#171d42" opacity=".52"/>
    <path d="M242 131C251 146 255 161 254 177L242 177C242 163 239 151 233 143Z" fill="$o" stroke="$b" stroke-width=".7"/>
    <g clip-path="url(#pearl-inlay)" opacity=".35"><path d="m231 137 11-4 6 10-10 7Z" fill="#e7c5e2"/><path d="m238 151 14-7 5 12-12 6Z" fill="#bdede7"/><path d="m243 164 13-4 4 9-12 10Z" fill="#e7d7fb"/></g>
    <ellipse cx="237" cy="130" rx="13" ry="7" fill="#fff8e5" opacity=".23" filter="$s"/>
  </g>
  <ellipse cx="218" cy="179" rx="24" ry="42" fill="url(#moon-well)"/>
  ${wire('<ellipse cx="218" cy="179" rx="44" ry="61"/>', 2.7)}
  ${wire('<ellipse cx="218" cy="179" rx="24" ry="42"/>', 1.7)}
</g>
${days(268, '#d9d3e8')}
<path d="M151 295H179" fill="none" stroke="$b" stroke-width=".65" opacity=".5"/>`
let lunarLit = [original.layers[0], lunarSurface, original.layers[4]]
  .map((layer, index) => original.svg(layer, `lunar-${index}`))
  .join('')
  .replace(/<svg[^>]*>|<\/svg>/g, '')
  .replaceAll('var(--enamel)', '#595d91')
  .replaceAll('var(--deep)', '#181b3d')
  .replaceAll('var(--light)', '#c5bfdf')
  .replace(/id="([^"]+)"/g, 'id="days-30-$1"')
  .replace(/url\(#([^)]+)\)/g, 'url(#days-30-$1)')
lunarLit = `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="370" viewBox="0 0 330 370" role="img" aria-labelledby="days-30-title"><title id="days-30-title">连续 30 天 · 月下相伴</title><desc>银色六边形徽章，深蓝紫珐琅，两段珍珠月牙弧构成数字 3，深靛蓝至珍珠白的月相环构成 0，局部嵌入虹彩，下方独立标注 DAYS。</desc><path d="${original.outline}" transform="translate(0 4)" fill="#303349" stroke="#69718c" stroke-width="2"/>${lunarLit}</svg>\n`
const threeDigit =
  'M2 6C7 2 13 0 21 0C34 0 41 6 41 15C41 21 38 25 33 27C39 29 42 33 42 39C42 49 34 54 21 54C12 54 5 51 0 46L7 37C11 41 15 43 21 43C27 43 30 41 30 37C30 33 27 31 21 31H15V21H21C27 21 29 19 29 16C29 12 26 10 21 10C16 10 12 12 8 15Z'
const lunarStamp = `<g transform="translate(${165 - 45.5 * 0.91} 158) scale(.91)"><path d="${threeDigit}"/><path transform="translate(49 0)" fill-rule="evenodd" d="${heartDigits[2]}"/></g>`
const lunarUnlit = (
  blank.slice(0, stampStart) +
  `<g id="days-30-unlit-value"><g fill="#1c262d" stroke="#1c262d" stroke-width="1.5" transform="translate(0 1.2)">${lunarStamp}</g><g fill="url(#days-30-unlit-stamp)" stroke="#b9c1c3" stroke-opacity=".22" stroke-width=".45">${lunarStamp}</g></g>${days(223, '#9ba7ad')}</svg>\n`
)
  .replaceAll('hours-unlit-template', 'days-30-unlit')
  .replace('未点亮徽章模板', '连续 30 天 · 未点亮')
  .replace('浅浮雕小时数', '浅浮雕天数与 DAYS')

// An engraved solar dial surrounded by four continuous seasonal enamel quarters.
const sixDigit =
  'M38 4L33 14C30 12 27 11 23 11C15 11 12 17 12 24C16 21 20 20 24 20C36 20 42 26 42 36C42 48 34 54 21 54C7 54 0 45 0 29C0 10 8 0 23 0C29 0 34 1 38 4Z M21 30C15 30 12 33 12 37C12 42 15 44 21 44C27 44 30 41 30 37C30 32 27 30 21 30Z'
function yearNumber(y = 231, scale = 0.94) {
  return `<g transform="translate(${165 - 70 * scale} ${y}) scale(${scale})">${[threeDigit, sixDigit, heartDigits[0]].map((d, i) => `<path transform="translate(${i * 49} 0)" fill-rule="evenodd" d="${d}"/>`).join('')}</g>`
}
const polar = (radius, angle) => {
  const radians = (angle * Math.PI) / 180
  return `${(165 + radius * Math.sin(radians)).toFixed(3)} ${(148 - radius * Math.cos(radians)).toFixed(3)}`
}
const seasonColors = [
  ['#ddd3a0', '#737651'],
  ['#f4cd7b', '#b57932'],
  ['#d99a63', '#854829'],
  ['#b5c9c7', '#637b88'],
]
const seasonSegments = seasonColors
  .map((_, index) => {
    const angle = index * 90
    return `<path data-season="${index + 1}" d="M${polar(65, angle)}A65 65 0 0 1 ${polar(65, angle + 90)}L${polar(54, angle + 90)}A54 54 0 0 0 ${polar(54, angle)}Z" fill="url(#season-${index})"/>`
  })
  .join('')
const dialTicks = Array.from({ length: 48 }, (_, index) => {
  const major = index % 12 === 0
  return `<path d="M${polar(major ? 68 : 69, index * 7.5)}L${polar(major ? 76 : 72, index * 7.5)}" stroke="${major ? '$m' : '#e5c89a'}" stroke-width="${major ? 1.7 : 0.6}" opacity="${major ? 1 : 0.38}"/>`
}).join('')
const sunRays = Array.from({ length: 24 }, (_, index) => {
  const angle = index * 15
  return `<path d="M${polar(29, angle - 1.5)}L${polar(index % 2 ? 37 : 44, angle)}L${polar(29, angle + 1.5)}Z"/>`
}).join('')
const yearSurface = `<defs>
  <radialGradient id="amber-enamel" cx=".27" cy=".16" r=".94"><stop stop-color="#d6b985"/><stop offset=".23" stop-color="#9a6835"/><stop offset=".51" stop-color="#59361e"/><stop offset=".74" stop-color="#352519"/><stop offset=".89" stop-color="#80532d"/><stop offset="1" stop-color="#38271c"/></radialGradient>
  <radialGradient id="dial-well" cx=".3" cy=".15" r=".91"><stop stop-color="#795435"/><stop offset=".58" stop-color="#392a21"/><stop offset="1" stop-color="#241e1c"/></radialGradient>
  <linearGradient id="sun-gold" x1=".05" y1=".05" x2=".9" y2="1"><stop stop-color="#fff6da"/><stop offset=".25" stop-color="#dbbc78"/><stop offset=".44" stop-color="#866334"/><stop offset=".52" stop-color="#f5e2af"/><stop offset=".75" stop-color="#c9a15b"/><stop offset="1" stop-color="#755331"/></linearGradient>
  <radialGradient id="sun-face" cx=".28" cy=".2" r=".85"><stop stop-color="#fff0c5"/><stop offset=".38" stop-color="#e4c48a"/><stop offset=".8" stop-color="#b08448"/><stop offset="1" stop-color="#705031"/></radialGradient>
  ${seasonColors.map(([light, dark], i) => `<linearGradient id="season-${i}" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="${light}"/><stop offset=".57" stop-color="${dark}"/><stop offset="1" stop-color="${light}"/></linearGradient>`).join('')}
</defs>
<path d="${original.inner}" fill="url(#amber-enamel)"/>
<g clip-path="$c">
  <path d="${original.inner}" fill="none" stroke="#291a13" stroke-width="12" opacity=".75" filter="$s"/>
  <ellipse cx="91" cy="98" rx="67" ry="25" transform="rotate(-31 91 98)" fill="#fae5ba" opacity=".16" filter="$s"/>
  <ellipse cx="242" cy="276" rx="59" ry="18" transform="rotate(-31 242 276)" fill="#d9af70" opacity=".17" filter="$s"/>
</g>
<path d="${original.inner}" fill="none" stroke="$b" stroke-width="1.4"/>
${wire(original.rim, 2.8)}
<circle cx="165.5" cy="150" r="67" fill="#211711" opacity=".85" filter="$a"/>
<circle cx="165" cy="148" r="65" fill="url(#dial-well)"/>
${seasonSegments}
${wire('<circle cx="165" cy="148" r="65"/>', 2.5)}
${wire('<circle cx="165" cy="148" r="54"/>', 1.7)}
<circle cx="165" cy="148" r="59.5" fill="none" stroke="#fff1d6" stroke-width=".6" opacity=".35"/>
${wire('<path d="M165 83V94M230 148H219M165 213V202M100 148H111"/>', 1.2)}
<g fill="none" stroke-linecap="round">${dialTicks}</g>
<g data-solar-dial="sun">
  <g fill="#211810" transform="translate(.6 1.5)" filter="$a">${sunRays}<circle cx="165" cy="148" r="25"/></g>
  <g fill="url(#sun-gold)" stroke="#f0d9a7" stroke-width=".35">${sunRays}</g>
  <circle cx="165" cy="148" r="25" fill="url(#sun-gold)" stroke="#6c4b2b" stroke-width=".8"/>
  <circle cx="165" cy="148" r="21.5" fill="url(#sun-face)" stroke="#f5dfb1" stroke-width=".8"/>
  <circle cx="165" cy="148" r="18.5" fill="none" stroke="#7c5c35" stroke-width=".6" opacity=".5"/>
  <path d="M151 141A16 16 0 0 1 170 133" fill="none" stroke="#fff3d0" stroke-width=".8" opacity=".7"/>
  <circle cx="165" cy="148" r="2" fill="url(#sun-gold)" stroke="#795b38" stroke-width=".6"/>
</g>
<g fill="#291b13" stroke="#291b13" stroke-width="2" transform="translate(0 2)" filter="$a">${yearNumber()}</g>
<g fill="#75695b" stroke="#3b3025" stroke-width="1.5" transform="translate(0 1.4)">${yearNumber()}</g>
<g fill="$m" stroke="$b" stroke-width=".7" paint-order="stroke fill">${yearNumber()}</g>
${days(298, '#e6d4b5')}
<path d="M151 318H179" fill="none" stroke="$b" stroke-width=".65" opacity=".5"/>`
let yearLit = [original.layers[0], yearSurface, original.layers[4]]
  .map((layer, index) => original.svg(layer, `year-${index}`))
  .join('')
  .replace(/<svg[^>]*>|<\/svg>/g, '')
  .replaceAll('var(--enamel)', '#9a6835')
  .replaceAll('var(--deep)', '#352519')
  .replaceAll('var(--light)', '#dec69c')
  .replace(/id="([^"]+)"/g, 'id="days-365-$1"')
  .replace(/url\(#([^)]+)\)/g, 'url(#days-365-$1)')
yearLit = `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="370" viewBox="0 0 330 370" role="img" aria-labelledby="days-365-title"><title id="days-365-title">连续 365 天 · 一岁相伴</title><desc>银色六边形徽章，深琥珀珐琅，香槟金太阳与四段连续的四季釉色周年轨道，细刻度呈现复古天文仪器风格，下方为银色浮雕 365 与 DAYS。</desc><path d="${original.outline}" transform="translate(0 4)" fill="#3d3730" stroke="#807666" stroke-width="2"/>${yearLit}</svg>\n`
const yearStamp = yearNumber(158, 0.91)
const yearUnlit = (
  blank.slice(0, stampStart) +
  `<g id="days-365-unlit-value"><g fill="#1c262d" stroke="#1c262d" stroke-width="1.5" transform="translate(0 1.2)">${yearStamp}</g><g fill="url(#days-365-unlit-stamp)" stroke="#b9c1c3" stroke-opacity=".22" stroke-width=".45">${yearStamp}</g></g>${days(223, '#9ba7ad')}</svg>\n`
)
  .replaceAll('hours-unlit-template', 'days-365-unlit')
  .replace('未点亮徽章模板', '连续 365 天 · 未点亮')
  .replace('浅浮雕小时数', '浅浮雕天数与 DAYS')

const out = path.join(__dirname, 'assets')
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'days-7.svg'), lit)
fs.writeFileSync(path.join(out, 'days-7-unlit.svg'), unlit)
fs.writeFileSync(path.join(out, 'days-520.svg'), heartLit)
fs.writeFileSync(path.join(out, 'days-520-unlit.svg'), heartUnlit)
fs.writeFileSync(path.join(out, 'days-100.svg'), recordLit)
fs.writeFileSync(path.join(out, 'days-100-unlit.svg'), recordUnlit)
fs.writeFileSync(path.join(out, 'days-30.svg'), lunarLit)
fs.writeFileSync(path.join(out, 'days-30-unlit.svg'), lunarUnlit)
fs.writeFileSync(path.join(out, 'days-365.svg'), yearLit)
fs.writeFileSync(path.join(out, 'days-365-unlit.svg'), yearUnlit)
fs.writeFileSync(
  path.join(__dirname, 'manifest.json'),
  JSON.stringify(
    {
      series: '日日相伴',
      status: 'design-prototype',
      badges: [
        {
          id: 'days-7',
          consecutiveDays: 7,
          name: '一周相伴',
          motif: '北斗七星凝成银色星图，记录音乐相伴的一周。',
          palette: ['#264976', '#101e40', '#a8c8e8'],
          svg: 'assets/days-7.svg',
          png: 'assets/days-7@2x.png',
          unlit: { svg: 'assets/days-7-unlit.svg', png: 'assets/days-7-unlit@2x.png' },
          width: 330,
          height: 370,
        },
        {
          id: 'days-30',
          consecutiveDays: 30,
          name: '月下相伴',
          motif: '两段珍珠月牙弧构成 3，银边月相环构成 0，记录三十天的陪伴。',
          palette: ['#595d91', '#181b3d', '#c5bfdf'],
          svg: 'assets/days-30.svg',
          png: 'assets/days-30@2x.png',
          unlit: { svg: 'assets/days-30-unlit.svg', png: 'assets/days-30-unlit@2x.png' },
          width: 330,
          height: 370,
        },
        {
          id: 'days-100',
          consecutiveDays: 100,
          name: '百日留声',
          motif: '数字 1 化作唱针，两个 0 化作唱片音轨，音乐物件组成 100。',
          palette: ['#206d72', '#092e36', '#9ad6cf'],
          svg: 'assets/days-100.svg',
          png: 'assets/days-100@2x.png',
          unlit: { svg: 'assets/days-100-unlit.svg', png: 'assets/days-100-unlit@2x.png' },
          width: 330,
          height: 370,
        },
        {
          id: 'days-365',
          consecutiveDays: 365,
          name: '一岁相伴',
          motif: '香槟金太阳与四季周年轨道，珍藏音乐相伴的一整年。',
          palette: ['#9a6835', '#352519', '#dec69c'],
          svg: 'assets/days-365.svg',
          png: 'assets/days-365@2x.png',
          unlit: { svg: 'assets/days-365-unlit.svg', png: 'assets/days-365-unlit@2x.png' },
          width: 330,
          height: 370,
        },
        {
          id: 'days-520',
          consecutiveDays: 520,
          name: '倾心相伴',
          motif: '三道银色音轨弯成心形，珍藏音乐相伴的 520 天。',
          palette: ['#8b304c', '#350f23', '#e9b9c7'],
          svg: 'assets/days-520.svg',
          png: 'assets/days-520@2x.png',
          unlit: { svg: 'assets/days-520-unlit.svg', png: 'assets/days-520-unlit@2x.png' },
          width: 330,
          height: 370,
        },
      ],
    },
    null,
    2,
  ) + '\n',
)
console.log(
  'Built 7, 30, 100, 365 and 520 consecutive days badges: lit and shared unlit metal blanks',
)
