import { extractAll, adapt, hex, type Extraction } from './algorithms'

type Sample = {
  id: string
  title: string
  artist: string
  kind: string
  note: string
  image: string
  source: string
  results?: Extraction[]
}
declare const __SAMPLES__: Sample[]
const samples: Sample[] = __SAMPLES__
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!
const escape = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
const tick = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
let selected = 0,
  view = 'compare',
  focused = -1,
  ready = false
let lightness = 0.34,
  maxChroma = 0.075

function addSynthetic(
  id: string,
  title: string,
  note: string,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  const c = document.createElement('canvas')
  c.width = c.height = 480
  draw(c.getContext('2d')!)
  samples.push({
    id,
    title,
    artist: '合成边界样本',
    kind: '合成 · ' + note,
    note,
    image: c.toDataURL('image/png'),
    source: '原型内 Canvas 绘制，不对应真实专辑。',
  })
}

addSynthetic('white-red', '纸上的红点', '白底 / 小色块', (c) => {
  c.fillStyle = '#eeeae3'
  c.fillRect(0, 0, 480, 480)
  c.fillStyle = '#bd272c'
  c.beginPath()
  c.arc(240, 222, 65, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#252823'
  c.font = '16px sans-serif'
  c.textAlign = 'center'
  c.fillText('A SMALL RED MEMORY', 240, 370)
})
addSynthetic('blue-orange', '潮汐的两面', '近似色 / 对比色', (c) => {
  const g = c.createLinearGradient(0, 0, 320, 480)
  g.addColorStop(0, '#3c6493')
  g.addColorStop(0.5, '#688eae')
  g.addColorStop(1, '#b3d6de')
  c.fillStyle = g
  c.fillRect(0, 0, 480, 480)
  c.fillStyle = '#c3723c'
  c.fillRect(300, 0, 180, 480)
  c.fillStyle = '#f4e8d5'
  c.font = '29px serif'
  c.fillText('TIDELINES', 28, 60)
})
addSynthetic('neutral', '无彩的房间', '纯灰 / 无彩回退', (c) => {
  c.fillStyle = '#999999'
  c.fillRect(0, 0, 480, 480)
})

async function calculate(sample: Sample) {
  if (sample.results) return
  const image = new Image()
  image.src = sample.image
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 48
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, 48, 48)
  sample.results = extractAll(ctx.getImageData(0, 0, 48, 48).data)
}

function renderSamples() {
  $('#sample-count').textContent = String(samples.length)
  $('#samples').innerHTML = samples
    .map(
      (s, i) =>
        `<button class="sample" data-sample="${i}" aria-pressed="${i === selected}" title="${escape(s.title + ' · ' + s.note)}"><img src="${s.image}" alt=""><span><strong>${escape(s.title)}</strong><small>${escape(s.kind)}</small></span></button>`,
    )
    .join('')
}

const transport = `<div class="transport" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 5h2v14H5zm3 7 11-7v14z"/></svg><svg viewBox="0 0 24 24"><path d="M8 4h3v16H8zm5 0h3v16h-3z"/></svg><svg viewBox="0 0 24 24"><path d="M17 5h2v14h-2zM5 5l11 7-11 7z"/></svg></div>`

function player(sample: Sample, large = false) {
  return `<div class="player${large ? ' large' : ''}"><img class="cover" src="${sample.image}" alt="${escape(sample.title)} 封面"><div class="player-info"><p class="track-title">${escape(sample.title)}</p><p class="artist">${escape(sample.artist)} · 静态聆听示意</p><p class="lyric">让时间停在这一刻</p><p class="lyric-next">把喧嚣留在远处</p><div class="progress"><div class="rail"><span></span></div><div class="times"><span>1:28</span><span>4:06</span></div></div>${transport}</div></div>`
}

function vars(result: ReturnType<typeof adapt>) {
  return `--bg:${hex(result.bg)};--fg:${hex(result.primary)};--secondary:${hex(result.secondary)};--control:${hex(result.control)}`
}

function renderPanels() {
  const sample = samples[selected]
  $('#album-title').textContent = sample.title
  $('#album-subtitle').textContent = `${sample.artist} / ${sample.note}`
  $('#panels').innerHTML = (sample.results ?? [])
    .map((r, i) => {
      const a = adapt(r.source, lightness, maxChroma)
      const bar = r.clusters
        .map(
          (c) =>
            `<span style="width:${c.weight * 100}%;background:${hex(c.rgb)}" title="${hex(c.rgb)} · ${(c.weight * 100).toFixed(1)}%"></span>`,
        )
        .join('')
      return `<article class="algorithm" style="${vars(a)}"><div class="algorithm-heading"><h3>${escape(r.title)}</h3><span>0${i + 1}</span></div>${player(sample)}<div class="color-pair"><div class="color-readout"><span class="swatch" style="background:${hex(r.source)}"></span><div><small>原始选色</small><code>${hex(r.source)}</code></div></div><div class="color-readout"><span class="swatch" style="background:${hex(a.bg)}"></span><div><small>适配背景</small><code>${hex(a.bg)}</code></div></div></div><p class="population">选中色群占比 ${(r.weight * 100).toFixed(1)}% · 下方为候选色群</p><div class="cluster-bar">${bar}</div><div class="ratios"><span>主文 ${a.primaryContrast.toFixed(2)}:1</span><span>次文 ${a.secondaryContrast.toFixed(2)}:1</span><span>控件 ${a.controlContrast.toFixed(2)}:1</span></div><button class="zoom" data-focus="${i}">放大观察 ↗</button></article>`
    })
    .join('')
}

function renderOverview() {
  $('#overview').innerHTML =
    `<div class="overview-row overview-head"><span>同一封面</span><span>现有 Wu</span><span>调整后的 Wu</span><span>OKLab K-means</span></div>` +
    samples
      .map(
        (s, i) =>
          `<div class="overview-row"><button class="overview-cover" data-sample="${i}"><img src="${s.image}" alt=""><span>${escape(s.title)}</span></button>${(
            s.results ?? []
          )
            .map((r, j) => {
              const a = adapt(r.source, lightness, maxChroma)
              return `<button class="overview-color" data-overview-sample="${i}" data-overview-algorithm="${j}" style="background:${hex(a.bg)};color:${hex(a.primary)}" aria-label="放大 ${escape(s.title)} 的 ${escape(r.title)} 背景"><small>让时间停在这一刻<br><code>${hex(a.bg)}</code></small><span class="swatch" style="background:${hex(r.source)}" title="原始选色 ${hex(r.source)}"></span></button>`
            })
            .join('')}</div>`,
      )
      .join('')
}

function renderFocus() {
  if (focused < 0) return
  const s = samples[selected],
    r = s.results![focused],
    a = adapt(r.source, lightness, maxChroma)
  $('#focus').setAttribute('style', vars(a))
  $('#focus-label').textContent = `${r.title} / ${s.title} / ${hex(a.bg)}`
  $('#focus-content').innerHTML = player(s, true)
}

function render() {
  renderPanels()
  if (view === 'overview') renderOverview()
  renderFocus()
  $('#panels').hidden = view !== 'compare'
  $('#overview').hidden = view !== 'overview'
  $('#compare-view').setAttribute('aria-pressed', String(view === 'compare'))
  $('#overview-view').setAttribute('aria-pressed', String(view === 'overview'))
}

function choose(i: number) {
  selected = i
  view = 'compare'
  $('#error').hidden = true
  for (const el of document.querySelectorAll<HTMLElement>('[data-sample]'))
    el.setAttribute('aria-pressed', String(Number(el.dataset.sample) === i))
  render()
}

function showFocus(i: number) {
  focused = i
  renderFocus()
  $('#focus').scrollTop = 0
  if (!$<HTMLDialogElement>('#focus').open) $<HTMLDialogElement>('#focus').showModal()
}

document.addEventListener('click', (event) => {
  const target = (event.target as Element).closest<HTMLElement>('button')
  if (!target || !ready) return
  if (target.dataset.sample !== undefined) choose(Number(target.dataset.sample))
  if (target.dataset.focus !== undefined) showFocus(Number(target.dataset.focus))
  if (target.dataset.overviewSample !== undefined) {
    selected = Number(target.dataset.overviewSample)
    showFocus(Number(target.dataset.overviewAlgorithm))
  }
})
$('#close-focus').addEventListener('click', () => $<HTMLDialogElement>('#focus').close())
$('#previous-algorithm').addEventListener('click', () => showFocus((focused + 2) % 3))
$('#next-algorithm').addEventListener('click', () => showFocus((focused + 1) % 3))
$('#focus').addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    showFocus((focused + (event.key === 'ArrowRight' ? 1 : 2)) % 3)
  }
})
$('#focus').addEventListener('close', () => {
  focused = -1
  renderSamples()
  render()
})
$('#compare-view').addEventListener('click', () => {
  view = 'compare'
  render()
})
$('#overview-view').addEventListener('click', () => {
  view = 'overview'
  render()
})
function updateSettings() {
  lightness = Number($<HTMLInputElement>('#lightness').value)
  maxChroma = Number($<HTMLInputElement>('#chroma').value)
  $('#lightness-value').textContent = lightness.toFixed(2)
  $('#chroma-value').textContent = maxChroma.toFixed(3)
  render()
}
for (const id of ['lightness', 'chroma']) $('#' + id).addEventListener('input', updateSettings)
$('#reset').addEventListener('click', () => {
  $<HTMLInputElement>('#lightness').value = '0.34'
  $<HTMLInputElement>('#chroma').value = '0.075'
  updateSettings()
})

async function loadFiles(files: File[]) {
  $('#error').hidden = true
  const failures: string[] = []
  let firstAdded = -1
  for (const file of files) {
    $('#status').textContent = `正在取色：${file.name}`
    await tick()
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('图片超过 20 MB，请先缩小')
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('无法读取图片'))
        reader.readAsDataURL(file)
      })
      const sample: Sample = {
        id: `local-${samples.length}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        artist: '本地封面',
        kind: '本地添加',
        note: '当前页面内处理',
        image,
        source: '用户在当前页面选择的本地图片，不会上传或持久保存。',
      }
      await calculate(sample)
      if (firstAdded < 0) firstAdded = samples.length
      samples.push(sample)
    } catch (e) {
      failures.push(`${file.name}：${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (failures.length) {
    $('#error').textContent = failures.join('；')
    $('#error').hidden = false
  }
  if (firstAdded >= 0) selected = firstAdded
  view = 'compare'
  renderSamples()
  render()
  $('#status').textContent = ''
}
$<HTMLInputElement>('#upload').addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement
  input.disabled = true
  try {
    await loadFiles(Array.from(input.files ?? []))
  } finally {
    input.value = ''
    input.disabled = false
  }
})

async function init() {
  $<HTMLInputElement>('#upload').disabled = true
  for (const s of samples) {
    $('#status').textContent = `正在分析 ${s.title}…`
    await tick()
    await calculate(s)
  }
  renderSamples()
  render()
  $('#credits').innerHTML = samples
    .filter((s) => !s.id.startsWith('local-'))
    .map(
      (s) =>
        `<p>${escape(s.title)} · ${escape(s.artist)} — ${s.source.startsWith('https://') ? `<a href="${escape(s.source)}" target="_blank" rel="noreferrer">图片来源</a>` : escape(s.source)}</p>`,
    )
    .join('')
  $('#status').textContent = ''
  ready = true
  $<HTMLInputElement>('#upload').disabled = false
}

// Isolated verification hooks; these do not connect to Auralis or persist user data.
Object.assign(window, {
  paletteComparison: {
    get ready() {
      return ready
    },
    getSnapshot: () => ({
      selected,
      view,
      lightness,
      maxChroma,
      samples: samples.map((s) => ({
        id: s.id,
        title: s.title,
        results: s.results?.map((r) => ({ ...r, adapted: adapt(r.source, lightness, maxChroma) })),
      })),
    }),
    loadFiles,
    extractAll,
    adapt,
  },
})
init().catch((e) => {
  $('#status').textContent = ''
  $('#error').textContent = `样本准备失败：${String(e)}`
  $('#error').hidden = false
})
