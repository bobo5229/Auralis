// Offline asset authoring. Reuse the established 100-hour geometry without changing its demo.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../demo.js'), 'utf8')
const boundary = source.indexOf('layers.forEach(')
if (boundary < 0) throw new Error('Cannot locate the existing badge material layers')
const original = vm.runInNewContext(
  source.slice(0, boundary) + '\n;({ layers, svg, outline, inner, ornament, rim, numeral })',
  {
    document: {
      querySelector: () => ({ append() {} }),
      createElement: () => ({ style: { setProperty() {} } }),
    },
    matchMedia: () => ({ matches: true }),
  },
)

const badges = [
  {
    hours: 10,
    name: '初响',
    motif: '唱针落下，第一段音轨开始。',
    palette: ['#389ab9', '#124b68', '#b5eeef'],
  },
  {
    hours: 100,
    name: '成章',
    motif: '唱片年轮，被完整的虹彩环珍藏。',
    palette: ['#167dde', '#032e70', '#8ee5ff'],
  },
  {
    hours: 500,
    name: '共鸣',
    motif: '两组声波交织，在交汇处留下光。',
    palette: ['#159b86', '#034a48', '#a0ffe0'],
  },
  {
    hours: 1000,
    name: '久伴',
    motif: '一张珍藏唱片，收进专属唱片套。',
    palette: ['#7463bd', '#2b215c', '#d3c4ff'],
  },
]

const digits = {
  0: {
    width: 42,
    d: 'M21 0C6 0 0 9 0 27C0 45 6 54 21 54C36 54 42 45 42 27C42 9 36 0 21 0Z M21 11C28 11 30 16 30 27C30 38 28 43 21 43C14 43 12 38 12 27C12 16 14 11 21 11Z',
  },
  1: { width: 24, d: 'M0 6 13 0H24V53H12V14L0 19Z' },
  5: {
    width: 42,
    d: 'M3 0H40V11H14L13 21C17 19 20 19 24 19C36 19 42 26 42 36C42 48 34 54 21 54C12 54 5 51 0 47L6 37C10 41 15 43 21 43C27 43 30 40 30 36C30 31 27 29 22 29C17 29 13 30 9 33L1 28Z',
  },
}

function number(value, cx, y, scale = 1) {
  const chars = String(value).split('')
  const width = chars.reduce((sum, c) => sum + digits[c].width, 0) + (chars.length - 1) * 7
  let x = 0
  const shapes = chars
    .map((c) => {
      const result = `<path transform="translate(${x} 0)" fill-rule="evenodd" d="${digits[c].d}"/>`
      x += digits[c].width + 7
      return result
    })
    .join('')
  return `<g transform="translate(${cx - (width * scale) / 2} ${y}) scale(${scale})">${shapes}</g>`
}

// Outlined unit lettering: portable SVGs do not depend on installed fonts.
function hours(cx = 165, y = 224) {
  return `<g transform="translate(${cx - 19} ${y})" fill="none" stroke="#d6e5df" stroke-width=".95" stroke-linecap="square" stroke-linejoin="round"><path d="M0 0V7M5 0V7M0 3.5H5 M11 0Q8 0 8 3.5Q8 7 11 7Q14 7 14 3.5Q14 0 11 0Z M17 0V4.5Q17 7 20 7Q23 7 23 4.5V0 M27 7V0H30Q33 0 33 2Q33 4 30 4H27M30 4 33 7 M41 .5Q40 0 38.5 0Q36 0 36 2Q36 3.5 38.5 3.5Q41 3.5 41 5.3Q41 7 38.5 7Q37 7 36 6.5"/></g>`
}

function relief(shape, warm = false) {
  return `<g fill="#071523" stroke="#071523" stroke-width="2" transform="translate(0 2)" filter="$a">${shape}</g><g fill="#526471" stroke="#172735" stroke-width="1.5" transform="translate(0 1.3)">${shape}</g><g fill="${warm ? 'url(#warm-metal)' : '$m'}" stroke="$b" stroke-width=".65" paint-order="stroke fill">${shape}</g>`
}

function wire(shape, width = 2.6, warm = false) {
  return `<g fill="none" stroke="#061b2b" stroke-width="${width + 2.2}" transform="translate(.5 1)" filter="$a">${shape}</g><g fill="none" stroke="${warm ? 'url(#warm-metal)' : '$m'}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round">${shape}</g><g fill="none" stroke="$b" stroke-width=".7" transform="translate(-.35 -.5)">${shape}</g>`
}

function record(cx, cy, radius) {
  const grooves = [radius - 6, radius - 12, radius - 18]
    .map((r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`)
    .join('')
  return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="var(--deep)" stroke="#081c2c" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="${radius - 1}" fill="$e"/><g fill="none" stroke="#001724" stroke-width="1.4" opacity=".7">${grooves}</g><g fill="none" stroke="var(--light)" stroke-width=".5" transform="translate(-.4 -.5)" opacity=".6">${grooves}</g>${wire(`<circle cx="${cx}" cy="${cy}" r="${radius}"/>`, 2)}`
}

function decorations() {
  return `${wire(original.rim, 2.8)}<path d="m165 52 3 5-3 5-3-5Z" fill="$m"/><path d="M144 301h12m18 0h12" stroke="$m" stroke-width=".8"/><circle cx="165" cy="301" r="2.2" fill="$o" stroke="$b" stroke-width=".7"/>`
}

function motif(value) {
  if (value === 10) {
    const spindle =
      '<circle cx="150" cy="160" r="3.3" fill="$m"/><circle cx="150" cy="160" r="1.3" fill="#082131"/>'
    return `${record(150, 189, 84)}<circle cx="150" cy="189" r="59" fill="var(--deep)"/><circle cx="150" cy="189" r="59" fill="$g"/>${spindle}${relief(number(10, 150, 177, 1.04))}${hours(148, 240)}
      <path d="M82 139A84 84 0 0 1 142 105" fill="none" stroke="$o" stroke-width="3"/>
      <circle cx="243" cy="101" r="13" fill="$m" stroke="#103447" stroke-width="2"/><circle cx="243" cy="101" r="8" fill="var(--deep)" stroke="$b" stroke-width="1.4"/>
      ${wire('<path d="M243 101V143Q243 150 237 155L214 176"/>', 5)}
      <path d="m213 167 10 9-12 13-10-9Z" fill="$m" stroke="#173949" stroke-width="1.5"/><path d="m205 185-5 7" stroke="#f0f5e8" stroke-width="1.2"/>
      ${decorations()}`
  }
  if (value === 500) {
    const waves =
      '<ellipse cx="165" cy="182" rx="98" ry="63" transform="rotate(-46 165 182)"/><ellipse cx="165" cy="182" rx="98" ry="63" transform="rotate(46 165 182)"/>'
    const innerWaves =
      '<ellipse cx="165" cy="182" rx="91" ry="54" transform="rotate(-46 165 182)"/><ellipse cx="165" cy="182" rx="91" ry="54" transform="rotate(46 165 182)"/>'
    return `<defs><clipPath id="wave-overlap"><ellipse cx="165" cy="182" rx="98" ry="63" transform="rotate(-46 165 182)"/></clipPath></defs>
      <g fill="var(--deep)" fill-opacity=".55">${waves}</g><ellipse cx="165" cy="182" rx="98" ry="63" transform="rotate(46 165 182)" fill="$o" opacity=".8" clip-path="url(#wave-overlap)"/>
      ${wire(waves, 3)}<g fill="none" stroke="var(--light)" stroke-opacity=".5" stroke-width=".7">${innerWaves}</g>
      <circle cx="165" cy="182" r="69" fill="var(--deep)" stroke="#052c34" stroke-width="3"/><circle cx="165" cy="182" r="68" fill="$g"/>
      ${wire('<circle cx="165" cy="182" r="68"/>', 1.3)}
      ${relief(number(500, 165, 165, 0.88))}${hours(163, 225)}<circle cx="165" cy="140" r="3" fill="$o" stroke="$b" stroke-width="1"/>
      ${decorations()}`
  }
  return `<defs><linearGradient id="warm-metal" x2=".4" y2="1"><stop stop-color="#fff0c1"/><stop offset=".3" stop-color="#b69864"/><stop offset=".48" stop-color="#f6dfab"/><stop offset=".75" stop-color="#766445"/><stop offset="1" stop-color="#d6c399"/></linearGradient></defs>
    ${record(165, 145, 76)}<circle cx="165" cy="145" r="38" fill="var(--deep)" stroke="url(#warm-metal)" stroke-width="1.2"/><circle cx="165" cy="145" r="37" fill="$g"/><circle cx="165" cy="131" r="3.5" fill="url(#warm-metal)"/><circle cx="165" cy="131" r="1.3" fill="#17152c"/>
    <path d="M100 106A76 76 0 0 1 231 107" fill="none" stroke="$o" stroke-width="3"/>
    <path d="M69 153H133Q165 172 197 153H261V265Q261 270 256 270H74Q69 270 69 265Z" fill="#101027" transform="translate(0 3)"/>
    <path d="M69 153H133Q165 172 197 153H261V265Q261 270 256 270H74Q69 270 69 265Z" fill="$e" stroke="#14142d" stroke-width="3"/>
    <path d="M77 163H130Q165 183 200 163H253V261H77Z" fill="var(--deep)" stroke="url(#warm-metal)" stroke-width="1.1"/>
    <path d="M78 164H129Q165 184 201 164H252V260H78Z" fill="$g"/>
    ${wire('<path d="M69 153H133Q165 172 197 153H261V265Q261 270 256 270H74Q69 270 69 265Z"/>', 2.4)}
    ${relief(number(1000, 165, 186, 0.91))}${hours(163, 244)}${decorations()}`
}

function unlitBadge(value = null) {
  const id = value === null ? 'hours-unlit-template' : `hours-${value}-unlit`
  const digits = value === null ? '' : number(value, 165, 158, 0.91)
  const label = value === null ? '未点亮徽章模板' : `${value} 小时 · 未点亮`
  // All unlit assets share this exact metal blank. Only the number stamp changes.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="370" viewBox="0 0 330 370" role="img" aria-labelledby="${id}-title">
    <title id="${id}-title">${label}</title><desc>统一未填釉金属胚，深灰凹面、哑银包边与浅浮雕小时数。</desc>
    <defs>
      <linearGradient id="${id}-rim" x1=".12" y1="0" x2=".85" y2="1"><stop stop-color="#969da0"/><stop offset=".2" stop-color="#677175"/><stop offset=".48" stop-color="#454e53"/><stop offset=".78" stop-color="#747e81"/><stop offset="1" stop-color="#515b60"/></linearGradient>
      <linearGradient id="${id}-bevel" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#b1b8b9"/><stop offset=".3" stop-color="#7f898d"/><stop offset=".55" stop-color="#354047"/><stop offset="1" stop-color="#8b9496"/></linearGradient>
      <radialGradient id="${id}-well" cx=".3" cy=".2" r=".95"><stop stop-color="#4a5459"/><stop offset=".52" stop-color="#343e44"/><stop offset="1" stop-color="#242d33"/></radialGradient>
      <linearGradient id="${id}-stamp" x1="0" y1="0" x2=".35" y2="1"><stop stop-color="#aeb7b9"/><stop offset=".45" stop-color="#959fa3"/><stop offset="1" stop-color="#7e898e"/></linearGradient>
      <clipPath id="${id}-clip"><path d="${original.inner}"/></clipPath>
      <filter id="${id}-soft" x="-.1" y="-.1" width="1.2" height="1.2"><feGaussianBlur stdDeviation="2"/></filter>
    </defs>
    <path d="${original.outline}" transform="translate(0 4)" fill="#20292e" stroke="#3c484f" stroke-width="2"/>
    <path d="${original.outline}" fill="url(#${id}-rim)" stroke="#202a30" stroke-width="2"/>
    <path d="${original.outline}" fill="none" stroke="url(#${id}-bevel)" stroke-width="1.8"/>
    <path d="${original.outline}" transform="translate(165 185) scale(.975) translate(-165 -185)" fill="none" stroke="#a8b1b4" stroke-opacity=".4" stroke-width=".7"/>
    <path d="${original.outline}" transform="translate(165 185) scale(.949) translate(-165 -185)" fill="none" stroke="#202c33" stroke-width="2.6"/>
    <path d="${original.inner}" fill="url(#${id}-well)" stroke="#273138" stroke-width="2.5"/>
    <g clip-path="url(#${id}-clip)"><path d="${original.inner}" fill="none" stroke="#111b22" stroke-opacity=".65" stroke-width="10" filter="url(#${id}-soft)"/></g>
    <path d="${original.inner}" fill="none" stroke="url(#${id}-bevel)" stroke-width=".8"/>
    <path d="${original.inner}" transform="translate(165 185) scale(.929) translate(-165 -185)" fill="none" stroke="#152027" stroke-width="1.2"/>
    <path d="${original.inner}" transform="translate(165 186) scale(.929) translate(-165 -185)" fill="none" stroke="#78858c" stroke-opacity=".25" stroke-width=".8"/>
    <g id="${id}-value">
      <g fill="#1c262d" stroke="#1c262d" stroke-width="1.5" transform="translate(0 1.2)">${digits}</g>
      <g fill="url(#${id}-stamp)" stroke="#b9c1c3" stroke-opacity=".22" stroke-width=".45">${digits}</g>
    </g>
    ${hours(163, 223).replace('#d6e5df', '#9ba7ad')}
  </svg>\n`
}

const out = path.join(__dirname, 'assets')
fs.mkdirSync(out, { recursive: true })
const manifest = []
for (const item of badges) {
  const id = `hours-${item.hours}`
  let contents
  if (item.hours === 100) {
    contents = original.layers
      .map((layer, i) => original.svg(layer, i))
      .join('')
      .replace(/<text[\s\S]*?<\/text>/g, hours(163, 223))
  } else {
    const base = original.layers[1].replace(original.ornament, '')
    contents = [original.layers[0], base, motif(item.hours), original.layers[4]]
      .map((layer, i) => original.svg(layer, i))
      .join('')
  }
  // Flatten the authored layers to one portable, front-facing SVG.
  contents = contents.replace(/<svg[^>]*>|<\/svg>/g, '')
  for (const [i, token] of ['enamel', 'deep', 'light'].entries()) {
    contents = contents.replaceAll(`var(--${token})`, item.palette[i])
  }
  contents = contents
    .replace(/id="([^"]+)"/g, `id="${id}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${id}-$1)`)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="370" viewBox="0 0 330 370" role="img" aria-labelledby="${id}-title"><title id="${id}-title">${item.hours} 小时 · ${item.name}</title><desc>聆听时光系列珐琅徽章。${item.motif}</desc><path d="${original.outline}" transform="translate(0 4)" fill="#243845" stroke="#47606c" stroke-width="2"/>${contents}</svg>\n`
  fs.writeFileSync(path.join(out, `${id}.svg`), svg)
  fs.writeFileSync(path.join(out, `${id}-unlit.svg`), unlitBadge(item.hours))
  manifest.push({
    id,
    hours: item.hours,
    name: item.name,
    motif: item.motif,
    palette: item.palette,
    svg: `assets/${id}.svg`,
    png: `assets/${id}@2x.png`,
    unlit: { svg: `assets/${id}-unlit.svg`, png: `assets/${id}-unlit@2x.png` },
    width: 330,
    height: 370,
  })
}
fs.writeFileSync(path.join(out, 'hours-unlit-template.svg'), unlitBadge())
fs.writeFileSync(
  path.join(__dirname, 'manifest.json'),
  JSON.stringify(
    {
      series: '聆听时光',
      status: 'design-prototype',
      unlitTemplate: {
        svg: 'assets/hours-unlit-template.svg',
        png: 'assets/hours-unlit-template@2x.png',
      },
      badges: manifest,
    },
    null,
    2,
  ) + '\n',
)
console.log(
  `Built ${badges.length} lit badges, ${badges.length} unlit badges and one blank template`,
)
