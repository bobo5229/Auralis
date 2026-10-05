const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const source = fs.readFileSync(path.join(__dirname, '../demo.js'), 'utf8')
const boundary = source.indexOf('layers.forEach(')
assert(boundary > 0)
const original = vm.runInNewContext(
  source.slice(0, boundary) + '\n;({layers,svg,outline,inner,rim})',
  {
    document: {
      querySelector: () => ({ append() {} }),
      createElement: () => ({ style: { setProperty() {} } }),
    },
    matchMedia: () => ({ matches: true }),
  },
)
const wire = (shape, w = 2) =>
  `<g fill="none" stroke="#092c30" stroke-width="${w + 2}" transform="translate(.5 1.3)" filter="$a">${shape}</g><g fill="none" stroke="$m" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round">${shape}</g><g fill="none" stroke="$b" stroke-width=".55" transform="translate(-.3 -.4)">${shape}</g>`
// All lettering is authored as vector paths: portable, editable and font independent.
const glyphs = {
  S: 'M6 .5Q5 0 3 0Q0 0 0 2Q0 3.5 3 3.5Q6 3.5 6 5.5Q6 7 3 7Q1 7 0 6.5',
  I: 'M0 0H4M2 0V7M0 7H4',
  D: 'M0 7V0H2Q6 0 6 3.5Q6 7 2 7Z',
  E: 'M6 0H0V7H6M0 3.5H5',
  A: 'M0 7 3 0 6 7M1.2 4.5H4.8',
  B: 'M0 7V0H3Q6 0 6 1.8Q6 3.5 3 3.5H0M3 3.5Q6 3.5 6 5.2Q6 7 3 7H0',
  L: 'M0 0V7H6',
  V: 'M0 0 3 7 6 0',
  U: 'M0 0V4Q0 7 3 7Q6 7 6 4V0',
  M: 'M0 7V0L3 4 6 0V7',
}
function letters(text, y, color, scale = 1) {
  const width = [...text].reduce((sum, c) => sum + (c === ' ' ? 5 : c === '·' ? 5 : 9), 0) - 3
  let x = 0
  const shapes = [...text]
    .map((c) => {
      const at = x
      x += c === ' ' ? 5 : c === '·' ? 5 : 9
      return c === ' '
        ? ''
        : c === '·'
          ? `<circle cx="${at + 1}" cy="3.5" r=".8" fill="${color}" stroke="none"/>`
          : `<path transform="translate(${at} 0)" d="${glyphs[c]}"/>`
    })
    .join('')
  return `<g data-inscription="${text}" transform="translate(${165 - (width * scale) / 2} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width=".95" stroke-linecap="square" stroke-linejoin="round">${shapes}</g>`
}
const grooves = [60, 54, 48, 42, 36].map((r) => `<circle cx="210" cy="147" r="${r}"/>`).join('')
const sleeve = '<path d="M77 130H201V254H77Z"/>'
const route = '<path d="M184 150H97V234H181V162H109V222H169V174H121V210H157V186H133V198H145"/>'
const face = `<defs>
<radialGradient id="peacock" cx=".26" cy=".16" r=".95"><stop stop-color="#85b8ae"/><stop offset=".24" stop-color="#32786f"/><stop offset=".54" stop-color="#0c413f"/><stop offset=".78" stop-color="#072e32"/><stop offset=".9" stop-color="#25645c"/><stop offset="1" stop-color="#0b3536"/></radialGradient>
<linearGradient id="ivory" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffef"/><stop offset=".4" stop-color="#ebe6cb"/><stop offset=".75" stop-color="#c8c5ac"/><stop offset="1" stop-color="#eee8cf"/></linearGradient>
<radialGradient id="vinyl" cx=".28" cy=".16" r=".9"><stop stop-color="#526d83"/><stop offset=".36" stop-color="#142c41"/><stop offset=".7" stop-color="#091a2e"/><stop offset=".9" stop-color="#263e53"/><stop offset="1" stop-color="#102334"/></radialGradient>
<linearGradient id="champagne" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#fff1c7"/><stop offset=".35" stop-color="#d5b67d"/><stop offset=".7" stop-color="#9b7949"/><stop offset="1" stop-color="#edd8ab"/></linearGradient>
</defs>
<path d="${original.inner}" fill="url(#peacock)"/>
<g clip-path="$c"><path d="${original.inner}" fill="none" stroke="#032326" stroke-width="12" opacity=".7" filter="$s"/><ellipse cx="94" cy="96" rx="66" ry="23" transform="rotate(-31 94 96)" fill="#d1f2df" opacity=".15" filter="$s"/></g>
<path d="${original.inner}" fill="none" stroke="$b" stroke-width="1.4"/>
${wire(original.rim, 2.8)}
<g data-album-disc="vinyl"><circle cx="211" cy="150" r="68" fill="#02252a" filter="$a"/><circle cx="210" cy="147" r="66" fill="url(#vinyl)" stroke="#a4bac3" stroke-width="1.6"/><g fill="none" stroke="#030e21" stroke-width="1.3">${grooves}</g><g fill="none" stroke="#98afbe" stroke-width=".55" opacity=".5" transform="translate(-.35 -.5)">${grooves}</g><path d="M168 109A57 57 0 0 1 218 90" fill="none" stroke="#c1dae0" stroke-width="1.6" opacity=".45"/><circle cx="210" cy="147" r="21" fill="url(#champagne)" stroke="#f0deb5" stroke-width="1.2"/><circle cx="210" cy="147" r="15" fill="none" stroke="#81653f" stroke-width=".7"/><path d="M202 138H218M201 155H219" fill="none" stroke="#775c38" stroke-width="1"/><circle cx="210" cy="147" r="3" fill="#0e2438" stroke="#e7cd9b" stroke-width="1"/></g>
<g data-album-sleeve="ivory" transform="rotate(-10 139 192)"><g transform="translate(1 3)" fill="#062b30" stroke="#062b30" stroke-width="4" filter="$a">${sleeve}</g><g fill="#788c89" stroke="#224344" stroke-width="2" transform="translate(0 1.7)">${sleeve}</g><g fill="url(#ivory)" stroke="$m" stroke-width="4" stroke-linejoin="round">${sleeve}</g><g fill="none" stroke="$b" stroke-width=".6" transform="translate(-.5 -.7)">${sleeve}</g><path d="M194 132V251" fill="none" stroke="#aaa68e" stroke-width=".8"/>
<g fill="none" stroke="#7f8276" stroke-width="2.7" opacity=".48" transform="translate(.4 .8)">${route}</g><g fill="none" stroke="$m" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${route}</g><g fill="none" stroke="#fffef2" stroke-width=".5" transform="translate(-.3 -.5)">${route}</g><circle cx="145" cy="198" r="2.2" fill="url(#champagne)" stroke="#85897d" stroke-width=".6"/><path d="M96 242H116M164 242H181" stroke="#a9a693" stroke-width=".6"/></g>
${letters('SIDE A · B', 287, '#d5e4dc', 1.3)}
<path d="M145 308H185" stroke="$b" stroke-width=".7" opacity=".6"/>`
let lit = [original.layers[0], face, original.layers[4]]
  .map((layer, i) => original.svg(layer, `album-${i}`))
  .join('')
  .replace(/<svg[^>]*>|<\/svg>/g, '')
  .replaceAll('var(--enamel)', '#20675f')
  .replaceAll('var(--deep)', '#082f32')
  .replaceAll('var(--light)', '#b5dacc')
  .replace(/id="([^"]+)"/g, 'id="albums-1-$1"')
  .replace(/url\(#([^)]+)\)/g, 'url(#albums-1-$1)')
lit = `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="370" viewBox="0 0 330 370" role="img" aria-labelledby="albums-1-title"><title id="albums-1-title">从头到尾 · 首次完整听完一张专辑</title><desc>银色六边形外框与深孔雀绿珐琅。象牙白银边唱片封套略向左倾，右上半露深墨蓝唱片和香槟金唱片标。连续银色音轨向封套中心收束，下方独立铭文 SIDE A · B。</desc><path d="${original.outline}" transform="translate(0 4)" fill="#243c3d" stroke="#577575" stroke-width="2"/>${lit}</svg>\n`
const blank = fs.readFileSync(
  path.join(__dirname, '../hours/assets/hours-unlit-template.svg'),
  'utf8',
)
const stampStart = blank.indexOf('<g id="hours-unlit-template-value">')
assert(stampStart > 0)
const stamp = '<path d="M153 165 164 159H174V208H163V172L153 176Z"/>'
const unlit = (
  blank.slice(0, stampStart) +
  `<g id="albums-1-unlit-value"><g fill="#1c262d" stroke="#1c262d" stroke-width="1.5" transform="translate(0 1.2)">${stamp}</g><g fill="url(#albums-1-unlit-stamp)" stroke="#b9c1c3" stroke-opacity=".22" stroke-width=".45">${stamp}</g></g>${letters('ALBUM', 223, '#9ba7ad')}</svg>\n`
)
  .replaceAll('hours-unlit-template', 'albums-1-unlit')
  .replace('未点亮徽章模板', '从头到尾 · 未点亮')
  .replace('浅浮雕小时数', '浅浮雕 1 与 ALBUM')
fs.writeFileSync(path.join(__dirname, 'assets/albums-1.svg'), lit)
fs.writeFileSync(path.join(__dirname, 'assets/albums-1-unlit.svg'), unlit)

// Live album: geometric enamel cells bounded by silver cloisons.
const curtainLeft = '<path d="M75 110H129Q128 157 111 184Q117 213 128 239H75Z"/>'
const curtainRight = '<path d="M255 110H201Q202 157 219 184Q213 213 202 239H255Z"/>'
const curtainTop =
  '<path d="M75 107Q119 87 165 88Q211 87 255 107V128Q231 142 203 117Q165 146 127 117Q99 142 75 128Z"/>'
const audience =
  '<path d="M115 250Q165 270 215 250 M101 261Q165 286 229 261 M90 274Q165 303 240 274"/>'
const liveSurface = `<defs>
<radialGradient id="stage" cx=".34" cy=".2" r=".91"><stop stop-color="#496078"/><stop offset=".3" stop-color="#1b2b40"/><stop offset=".62" stop-color="#080e20"/><stop offset=".86" stop-color="#23344a"/><stop offset="1" stop-color="#10172b"/></radialGradient>
<linearGradient id="velvet" x1="0" y1="0" x2="1" y2=".2"><stop stop-color="#401323"/><stop offset=".22" stop-color="#b76276"/><stop offset=".4" stop-color="#71233e"/><stop offset=".63" stop-color="#3d1026"/><stop offset=".84" stop-color="#9d405c"/><stop offset="1" stop-color="#50162e"/></linearGradient>
<linearGradient id="swag" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#c57c88"/><stop offset=".32" stop-color="#953b55"/><stop offset=".7" stop-color="#4d182d"/><stop offset="1" stop-color="#78253f"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#fff0cc"/><stop offset=".45" stop-color="#d3b17c"/><stop offset="1" stop-color="#92704b"/></linearGradient>
</defs>
<path d="${original.inner}" fill="url(#stage)"/>
<g clip-path="$c"><path d="${original.inner}" fill="none" stroke="#040b1a" stroke-width="12" opacity=".75" filter="$s"/><ellipse cx="102" cy="96" rx="66" ry="24" transform="rotate(-31 102 96)" fill="#bed3e1" opacity=".12" filter="$s"/></g>
<path d="${original.inner}" fill="none" stroke="$b" stroke-width="1.4"/>
${wire(original.rim, 2.8)}
<g data-live-curtain="left"><g transform="translate(.8 2)" fill="#020815" stroke="#020815" stroke-width="4" filter="$a">${curtainLeft}</g><g fill="url(#velvet)" stroke="$m" stroke-width="2.5" stroke-linejoin="round">${curtainLeft}</g>${wire('<path d="M90 114Q96 158 102 183Q98 214 91 238 M109 114Q115 150 106 183Q111 213 112 238"/>', 1.15)}</g>
<g data-live-curtain="right"><g transform="translate(.8 2)" fill="#020815" stroke="#020815" stroke-width="4" filter="$a">${curtainRight}</g><g fill="url(#velvet)" stroke="$m" stroke-width="2.5" stroke-linejoin="round">${curtainRight}</g>${wire('<path d="M240 114Q234 158 228 183Q232 214 239 238 M221 114Q215 150 224 183Q219 213 218 238"/>', 1.15)}</g>
<g data-live-curtain="top"><g transform="translate(.5 2)" fill="#020815" stroke="#020815" stroke-width="3" filter="$a">${curtainTop}</g><g fill="url(#swag)" stroke="$m" stroke-width="2.5" stroke-linejoin="round">${curtainTop}</g>${wire('<path d="M79 110Q104 126 127 104Q165 126 203 104Q226 126 251 110"/>', 1.1)}</g>
<g fill="url(#gold)" stroke="#ebd4ae" stroke-width=".5"><path d="M96 180Q104 184 112 180L114 186Q103 191 95 186Z"/><path d="M234 180Q226 184 218 180L216 186Q227 191 235 186Z"/></g>
<g data-live-microphone="silver">
<ellipse cx="170" cy="245" rx="19" ry="3.4" fill="#020611" opacity=".8" filter="$a"/>
<ellipse cx="165" cy="243" rx="14" ry="3" fill="#3a4a58" stroke="#142431" stroke-width=".8"/>
<ellipse cx="165" cy="241.6" rx="14" ry="2.6" fill="$m" stroke="$b" stroke-width=".65"/>
<rect x="164" y="179" width="3.6" height="63" rx="1.4" fill="#020817" transform="translate(.7 1)" filter="$a"/>
<rect x="163.2" y="177" width="3.6" height="65" rx="1.4" fill="$m" stroke="#253846" stroke-width=".5"/>
<path d="M163.8 179V240" fill="none" stroke="#e8f3ef" stroke-width=".8"/>
<rect x="162.5" y="202" width="5" height="6" rx="1.2" fill="$m" stroke="$b" stroke-width=".5"/>
${wire('<path d="M178 153V164Q178 177 165 178"/>', 3.6)}
<g transform="rotate(-22 168 155)">
<rect x="149" y="131" width="31" height="46" rx="13" fill="#020817" transform="translate(.8 1.6)" filter="$a"/>
<rect x="148" y="130" width="31" height="46" rx="13" fill="$m" stroke="#8397a4" stroke-width=".65"/>
<path d="M164 131Q179 131 179 144V162Q179 173 166 176L163 171Q169 167 169 156V146Q169 137 164 131Z" fill="#526575"/>
<path d="M166 133Q176 135 176 144V160Q176 170 169 172" fill="none" stroke="#abc0ca" stroke-width=".8"/>
<path d="M148 144Q148 133 158 132Q167 133 167 144V160Q167 172 157 173Q148 171 148 160Z" fill="$m" stroke="$b" stroke-width=".7"/>
<path d="M152 141H163M151 147H164M151 153H164M151 159H163M153 165H161" fill="none" stroke="#1c3445" stroke-width="2.1" stroke-linecap="round"/>
<path d="M152 139.9H163M151 145.9H164M151 151.9H164M151 157.9H163M153 163.9H161" fill="none" stroke="#f4f6e9" stroke-width=".6" stroke-linecap="round"/>
<path d="M171 141V147M173 142V148M171 151V157" fill="none" stroke="#213745" stroke-width="1.1" stroke-linecap="round"/>
<rect x="154" y="168" width="7" height="2.4" rx=".7" fill="url(#gold)"/>
<ellipse cx="177.2" cy="158" rx="3.7" ry="4.5" fill="$m" stroke="#243b4b" stroke-width=".8"/>
<ellipse cx="177.2" cy="158" rx="1.7" ry="2.4" fill="url(#gold)" stroke="#6e6353" stroke-width=".5"/>
<path d="M177.2 156.8V159.2" stroke="#344854" stroke-width=".65"/>
</g>
</g>
<g data-live-audience="rows">${wire(audience, 1.5)}</g>
${letters('LIVE', 298, '#dce3e6', 1.55)}
`
let liveLit = [original.layers[0], liveSurface, original.layers[4]]
  .map((layer, i) => original.svg(layer, `live-${i}`))
  .join('')
  .replace(/<svg[^>]*>|<\/svg>/g, '')
  .replaceAll('var(--enamel)', '#263a50')
  .replaceAll('var(--deep)', '#0b1325')
  .replaceAll('var(--light)', '#bdccda')
  .replace(/id="([^"]+)"/g, 'id="albums-live-$1"')
  .replace(/url\(#([^)]+)\)/g, 'url(#albums-live-$1)')
liveLit = `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="370" viewBox="0 0 330 370" role="img" aria-labelledby="albums-live-title"><title id="albums-live-title">现场回声 · 首次完整听完一张现场专辑</title><desc>银色六边形徽章，午夜蓝舞台背景与银线分区的酒红珐琅幕帘。中央银色复古落地麦克风略朝左俯倾，露出侧壳与可调转轴，香槟金扎帘和麦克风细节，下方三道观众席弧线及独立 LIVE 铭文。</desc><path d="${original.outline}" transform="translate(0 4)" fill="#29323f" stroke="#667587" stroke-width="2"/>${liveLit}</svg>\n`
const liveStamp = letters('LIVE', 176, 'url(#albums-live-unlit-stamp)', 3.1)
const liveUnlit = (
  blank.slice(0, stampStart) +
  `<g id="albums-live-unlit-value"><g transform="translate(0 1.3)" opacity=".75">${liveStamp.replaceAll('url(#albums-live-unlit-stamp)', '#172229')}</g>${liveStamp}</g></svg>\n`
)
  .replaceAll('hours-unlit-template', 'albums-live-unlit')
  .replace('未点亮徽章模板', '现场回声 · 未点亮')
  .replace('浅浮雕小时数', '浅浮雕 LIVE')
fs.writeFileSync(path.join(__dirname, 'assets/albums-live.svg'), liveLit)
fs.writeFileSync(path.join(__dirname, 'assets/albums-live-unlit.svg'), liveUnlit)

fs.writeFileSync(
  path.join(__dirname, 'manifest.json'),
  JSON.stringify(
    {
      badges: [
        {
          id: 'albums-1',
          name: '从头到尾',
          condition: '首次完整听完一张专辑',
          svg: 'assets/albums-1.svg',
          png: 'assets/albums-1@2x.png',
          page: 'index.html',
          unlit: { svg: 'assets/albums-1-unlit.svg', png: 'assets/albums-1-unlit@2x.png' },
        },
        {
          id: 'albums-live',
          name: '现场回声',
          condition: '首次完整听完一张现场专辑',
          page: 'live.html',
          svg: 'assets/albums-live.svg',
          png: 'assets/albums-live@2x.png',
          unlit: { svg: 'assets/albums-live-unlit.svg', png: 'assets/albums-live-unlit@2x.png' },
        },
      ],
    },
    null,
    2,
  ) + '\n',
)
console.log('Built album lit and shared-blank unlit SVGs')
