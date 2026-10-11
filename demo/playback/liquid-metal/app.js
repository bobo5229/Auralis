import { createMetalRenderer } from './renderer.js'
import { makePalette, paletteFromFile } from './palette.js'

const $ = (selector) => document.querySelector(selector)
const presets = {
  lemon: {
    name: '柠檬黄绿',
    colors: [
      ['#bccb16', 0.45],
      ['#d8c32c', 0.28],
      ['#748126', 0.17],
      ['#f3e3a2', 0.1],
    ],
  },
  blue: {
    name: '冰蓝',
    colors: [
      ['#397cc5', 0.5],
      ['#87cbd6', 0.25],
      ['#183c77', 0.18],
      ['#dbedf0', 0.07],
    ],
  },
  rose: {
    name: '玫瑰铜',
    colors: [
      ['#b45e67', 0.45],
      ['#cd9c77', 0.3],
      ['#6f304c', 0.17],
      ['#f1d8bc', 0.08],
    ],
  },
  mono: {
    name: '黑白封面',
    colors: [
      ['#858681', 0.45],
      ['#cbccc5', 0.3],
      ['#323530', 0.2],
      ['#f1f1e8', 0.05],
    ],
  },
}
let palette,
  renderer,
  uploadToken = 0,
  coverUrl = null,
  activePreset = 'lemon'
let transientTimer = 0
function status(message) {
  if (!transientTimer) $('#status').textContent = message
}
function announce(message) {
  clearTimeout(transientTimer)
  $('#status').textContent = message
  transientTimer = setTimeout(() => {
    transientTimer = 0
    status(renderer?.getState().paused ? '流动已暂停' : '实时曲面与镜面反射')
  }, 4000)
}
function setPalette(next, name, origin, source) {
  palette = next
  renderer.setPalette(palette)
  $('#palette-name').textContent = name
  $('#palette-origin').textContent = origin
  $('#preview-title').textContent = name
  $('#swatches').replaceChildren(
    ...palette.map((entry) => {
      const swatch = document.createElement('span')
      swatch.className = 'swatch'
      swatch.style.background = entry.color
      swatch.title = `${entry.color} · ${Math.round(entry.weight * 100)}%`
      return swatch
    }),
  )
  $('#cover').src = source
  $('#preview-cover').src = source
  for (const button of document.querySelectorAll('[data-preset]'))
    button.setAttribute('aria-pressed', String(button.dataset.preset === activePreset))
}
function usePreset(key) {
  uploadToken++
  activePreset = key
  const preset = presets[key]
  const entries = preset.colors.map(([color, weight]) => ({ color, weight }))
  const stops = entries
    .map((entry, i) => `<stop offset="${i / (entries.length - 1)}" stop-color="${entry.color}"/>`)
    .join('')
  const cover =
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x2="1" y2="1">${stops}</linearGradient></defs><rect width="400" height="400" fill="url(#g)"/></svg>`,
    )
  setPalette(makePalette(entries), preset.name, '内置配色样本', cover)
  if (coverUrl) {
    URL.revokeObjectURL(coverUrl)
    coverUrl = null
  }
}
async function loadCover(file) {
  if (!file) return
  const token = ++uploadToken
  announce('正在提取封面配色…')
  try {
    const next = await paletteFromFile(file)
    if (token !== uploadToken) return
    activePreset = null
    const url = URL.createObjectURL(file)
    setPalette(next, file.name.replace(/\.[^.]+$/, ''), '从上传封面提取 · 仅在本机处理', url)
    if (coverUrl) URL.revokeObjectURL(coverUrl)
    coverUrl = url
    announce('封面取色已更新')
  } catch {
    if (token === uploadToken) announce('图片无法解码，请换一张封面。')
  }
}
function pause(value) {
  const paused = renderer.setPaused(value)
  $('#pause').textContent = paused ? '继续流动' : '暂停流动'
  $('#pause').setAttribute('aria-pressed', String(paused))
  status(paused ? '流动已暂停' : '实时曲面与镜面反射')
}
function clean(value) {
  document.body.classList.toggle('clean', value)
  $('#restore').hidden = !value
  $('#clean').setAttribute('aria-pressed', String(value))
  if (value) $('#restore').focus()
}
try {
  renderer = createMetalRenderer($('#metal'), status)
  usePreset('lemon')
  pause(renderer.getState().paused)
  for (const button of document.querySelectorAll('[data-preset]'))
    button.addEventListener('click', () => usePreset(button.dataset.preset))
  for (const id of ['speed', 'folds', 'roughness'])
    $('#' + id).addEventListener('input', () => {
      const value = Number($('#' + id).value)
      $('#' + id + '-value').value = value.toFixed(2)
      renderer.setMaterial({ [id]: value })
    })
  $('#pause').addEventListener('click', () => pause(!renderer.getState().paused))
  $('#reset').addEventListener('click', () => {
    const defaults = { speed: 0.7, folds: 1.15, roughness: 0.12 }
    renderer.setMaterial(defaults)
    for (const [id, value] of Object.entries(defaults)) {
      $('#' + id).value = value
      $('#' + id + '-value').value = value.toFixed(2)
    }
    renderer.renderAt(9)
  })
  $('#upload').addEventListener('change', (event) => {
    void loadCover(event.target.files[0])
    event.target.value = ''
  })
  $('.upload-button').addEventListener('keydown', (event) => {
    if (['Enter', ' '].includes(event.key)) {
      event.preventDefault()
      $('#upload').click()
    }
  })
  $('#lyrics').addEventListener('click', () => {
    const show = $('.player-preview').hidden
    $('.player-preview').hidden = !show
    $('#lyrics').setAttribute('aria-pressed', String(show))
  })
  $('#clean').addEventListener('click', () => clean(true))
  $('#restore').addEventListener('click', () => {
    clean(false)
    $('#clean').focus()
  })
  $('#reference').addEventListener('click', () => $('#reference-dialog').showModal())
  $('#close-reference').addEventListener('click', () => $('#reference-dialog').close())
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('clean')) clean(false)
    if (event.code === 'Space' && event.target === document.body) {
      event.preventDefault()
      pause(!renderer.getState().paused)
    }
  })
  document.addEventListener('dragover', (event) => event.preventDefault())
  document.addEventListener('drop', (event) => {
    event.preventDefault()
    void loadCover(event.dataTransfer.files[0])
  })
  window.addEventListener(
    'pagehide',
    () => {
      uploadToken++
      renderer.dispose()
      if (coverUrl) URL.revokeObjectURL(coverUrl)
    },
    { once: true },
  )
  // Prototype-only API for repeatable frame captures and interaction verification.
  window.metalDemo = { renderer, loadCover, usePreset, getPalette: () => palette, ready: true }
} catch (error) {
  $('#status').textContent = error.message
  document.body.dataset.failed = 'true'
}
