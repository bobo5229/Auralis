import { extractArtworkPalette } from '../../../src/renderer/features/playback/utils/extractArtworkPalette'
import { resolvePlayerPrimaryButtonTextColor } from '../../../src/renderer/features/playback/utils/resolvePlayerPrimaryButtonTextColor'
import melodramaArtwork from '../../playback/palette-comparison/assets/melodrama.jpg'
import taylorArtwork from '../../playback/palette-comparison/assets/1989.jpg'
import beatlesArtwork from '../../playback/palette-comparison/assets/abbey-road.jpg'
import redVelvetArtwork from '../../albums/assets/album-sleeve-cover.webp'
;(() => {
  'use strict'
  const storageKey = 'auralis-concert-ticket-demo-v1'
  const records = [
    {
      date: '2026-10-30',
      album: 'Melodrama',
      artist: 'Lorde',
      artwork: melodramaArtwork,
      minutes: 43,
      plays: 14,
      tracks: 8,
      preview: true,
    },
    {
      date: '2026-10-29',
      album: '1989',
      artist: 'Taylor Swift',
      artwork: taylorArtwork,
      minutes: 68,
      plays: 23,
      tracks: 11,
    },
    {
      date: '2026-10-28',
      album: 'Abbey Road',
      artist: 'The Beatles',
      artwork: beatlesArtwork,
      minutes: 52,
      plays: 18,
      tracks: 10,
    },
    {
      date: '2026-10-27',
      album: 'Melodrama',
      artist: 'Lorde',
      artwork: melodramaArtwork,
      minutes: 47,
      plays: 16,
      tracks: 9,
    },
    {
      date: '2026-10-26',
      album: 'The ReVe Festival 2022 – Feel My Rhythm',
      artist: 'Red Velvet',
      artwork: redVelvetArtwork,
      minutes: 36,
      plays: 13,
      tracks: 6,
    },
    {
      date: '2026-10-25',
      album: '在世界的尽头，听见一张很长很长的专辑',
      artist: 'Auralis 示例艺术家',
      artwork: null,
      minutes: 31,
      plays: 11,
      tracks: 7,
    },
  ]
  const yesterday = records[1]
  const defaultCollected = ['2026-10-28', '2026-10-27', '2026-10-26']
  let stored
  try {
    stored = JSON.parse(localStorage.getItem(storageKey) || 'null')
  } catch {
    stored = null
  }
  const state = {
    view: 'daily',
    theme: stored?.theme === 'dark' ? 'dark' : 'light',
    collected: new Set(
      Array.isArray(stored?.collected)
        ? stored.collected.filter((date) =>
            records.some((record) => record.date === date && !record.preview),
          )
        : defaultCollected,
    ),
    busy: false,
    dialogDate: null,
  }
  const $ = (id) => document.getElementById(id)
  const dialog = $('ticket-dialog')
  let returnFocusId = ''
  let disposed = false
  let runningAnimations = []
  const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}" /></svg>`
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
    )
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const weekday = (date) => weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()]
  const serial = (record) => `AL-${record.date.replaceAll('-', '')}`
  const fallbackPaper = { r: 236, g: 232, b: 220 }
  const paletteByArtwork = new Map()
  const rgbCss = ({ r, g, b }) => `rgb(${r} ${g} ${b})`
  const paletteFor = (record) => paletteByArtwork.get(record.artwork)
  const colors = (record) => {
    const paper = paletteFor(record)?.dominant ?? fallbackPaper
    return `--paper:${rgbCss(paper)};--ink:${resolvePlayerPrimaryButtonTextColor(paper)}`
  }
  function refreshTicketColors() {
    if (disposed) return
    for (const element of document.querySelectorAll('.ticket, .mini-ticket')) {
      const record = records.find((item) => item.date === element.dataset.date)
      if (record) element.setAttribute('style', colors(record))
    }
  }
  async function prepareArtworkPalettes() {
    const artworks = [...new Set(records.map((record) => record.artwork).filter(Boolean))]
    await Promise.all(
      artworks.map(async (artwork) => {
        try {
          const image = new Image()
          image.src = artwork
          await image.decode()
          if (disposed) return
          // Same 48 × 48 sample used by useArtworkPalette; demo images are local data URLs.
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 48
          const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
          if (!context) return
          context.drawImage(image, 0, 0, 48, 48)
          paletteByArtwork.set(
            artwork,
            extractArtworkPalette(artwork, context.getImageData(0, 0, 48, 48).data),
          )
        } catch {
          // A missing or unreadable cover keeps the neutral stock.
        }
      }),
    )
    refreshTicketColors()
  }

  function persist() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ theme: state.theme, collected: [...state.collected] }),
      )
    } catch {
      /* Browsers may disable local storage for local files. */
    }
  }
  function artwork(record, className) {
    return record.artwork
      ? `<img class="${className}" src="${record.artwork}" alt="${escape(record.album)} 专辑封面" decoding="async" />`
      : `<span class="${className} cover-fallback" aria-label="无专辑封面">${escape(record.album[0])}</span>`
  }
  function titleLayout(title, prefix) {
    const numeric = /^\d{4}$/.test(title)
    const long = title.length > 22 || (/\p{Script=Han}/u.test(title) && title.length > 10)
    const className = numeric
      ? `${prefix}--numeric`
      : long
        ? `${prefix}--long`
        : title.length > 7
          ? `${prefix}--medium`
          : ''
    const words = title.trim().split(/\s+/)
    const units =
      words.length > 1
        ? words
        : Array.from(
            new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(title),
            (unit) => unit.segment,
          )
    const lineCount = long ? 3 : numeric || units.length > 6 || words.length > 1 ? 2 : 1
    const lineLength = Math.ceil(units.length / lineCount)
    const lines = []
    if (words.length === 1 && lineCount === 2) {
      const split = Math.floor(units.length / 2)
      lines.push(units.slice(0, split).join(''), units.slice(split).join(''))
    } else {
      for (let index = 0; index < units.length; index += lineLength)
        lines.push(units.slice(index, index + lineLength).join(words.length > 1 ? ' ' : ''))
    }
    for (let index = 1; index < lines.length; index++) {
      const punctuation = lines[index].match(/^[，。！？、；：）》」』】…]+/u)?.[0]
      if (punctuation) {
        lines[index - 1] += punctuation
        lines[index] = lines[index].slice(punctuation.length)
      }
    }
    return {
      className,
      markup: lines
        .map((line) => `<span class="title-line" aria-hidden="true">${escape(line)}</span>`)
        .join(''),
    }
  }
  function ticketMarkup(record) {
    const collected = state.collected.has(record.date)
    const title = titleLayout(record.album, 'ticket-title')
    return `<article class="ticket" style="${colors(record)}" data-date="${record.date}" data-collected="${collected}" aria-label="${escape(`${record.date} ${record.album} 聆听纪念票`)}">
      <div class="ticket-visual">${artwork(record, 'ticket-artwork')}</div>
      <div class="ticket-content">
        <header class="ticket-header"><span class="ticket-wordmark">AURALIS</span><span class="ticket-rank">TOP 01</span></header>
        <p class="ticket-artist">${escape(record.artist)}</p>
        <div class="ticket-copy"><h3 class="ticket-title ${title.className}" aria-label="${escape(record.album)}">${title.markup}</h3></div>
        <footer class="ticket-footer"><div class="ticket-day"><time class="ticket-date" datetime="${record.date}" aria-label="${record.date}"><span class="ticket-month">${record.date.slice(5, 7)}</span><span class="ticket-date-slash">/</span><strong class="ticket-date-day">${record.date.slice(-2)}</strong></time><span>${record.date.slice(0, 4)}<br />${weekday(record.date)}</span></div><p class="ticket-stats"><span>${record.minutes} 分钟</span><span>${record.plays} 次播放</span><span>${record.tracks} 首曲目</span></p><div class="ticket-lastline"><span class="ticket-number">${serial(record)}</span><span class="ticket-stamp">${record.preview ? '今日预览' : collected ? '已珍藏' : '待领取'}</span></div></footer>
      </div>
    </article>`
  }
  function renderDates() {
    $('date-strip').innerHTML = Array.from({ length: 7 }, (_, index) => {
      const date = `2026-10-${24 + index}`
      const record = records.find((item) => item.date === date)
      const collected = state.collected.has(date)
      const label = !record ? '无记录' : record.preview ? '预览' : collected ? '已收藏' : '待领取'
      return `<button id="date-${date}" class="date-button${date === yesterday.date ? ' date-button--yesterday' : ''}" data-open-date="${date}" ${!record || state.busy ? 'disabled' : ''} aria-label="${date} ${label}"><span class="date-button-top"><strong>${24 + index}</strong><span>${weekday(date).replace('星期', '周')}</span></span><span class="date-button-status">${collected ? icon('check') : record ? '<i aria-hidden="true"></i>' : ''}${label}</span></button>`
    }).join('')
  }
  function renderWallet() {
    const collected = records.filter((record) => state.collected.has(record.date))
    $('wallet-grid').innerHTML = collected
      .map((record) => {
        const title = titleLayout(record.album, 'mini-title')
        return `<button id="wallet-${record.date}" class="wallet-entry" data-open-date="${record.date}" aria-label="查看 ${record.date} ${escape(record.album)} 票面"><span class="mini-ticket" data-date="${record.date}" style="${colors(record)}"><span class="mini-visual">${artwork(record, 'mini-cover')}</span><span class="mini-content"><span class="mini-artist">${escape(record.artist)}</span><span class="mini-title ${title.className}" aria-label="${escape(record.album)}">${title.markup}</span><span class="mini-bottom"><time class="mini-date" datetime="${record.date}">${record.date.slice(5).replace('-', '.')}</time><span class="mini-duration">${record.minutes} 分钟</span></span></span></span></button>`
      })
      .join('')
    $('total-count').textContent = String(collected.length).padStart(2, '0')
    $('wallet-count').textContent = String(collected.length)
    $('month-count').textContent = `${collected.length} 张纪念票`
  }
  function updateTheme() {
    document.documentElement.dataset.theme = state.theme
    $('theme-button').setAttribute(
      'aria-label',
      state.theme === 'light' ? '切换至深色主题' : '切换至浅色主题',
    )
    $('theme-button').innerHTML = icon(state.theme === 'light' ? 'moon' : 'sun')
  }
  function renderDaily() {
    const collected = state.collected.has(yesterday.date)
    $('daily-ticket').innerHTML = ticketMarkup(yesterday)
    $('daily-status').textContent = collected ? '已收藏' : '待领取'
    $('claim-button').innerHTML =
      `${icon(collected ? 'check' : 'ticket')}<span>${state.busy ? '正在收入票夹…' : collected ? '查看我的票夹' : '领取昨日票面'}</span>`
    $('claim-button').disabled = state.busy
  }
  function setView(view, focus = false) {
    if (state.busy) return
    state.view = view
    for (const tab of document.querySelectorAll('[role="tab"]')) {
      const selected = tab.dataset.view === view
      tab.setAttribute('aria-selected', String(selected))
      tab.tabIndex = selected ? 0 : -1
      if (selected && focus) tab.focus()
    }
    $('daily-view').hidden = view !== 'daily'
    $('wallet-view').hidden = view !== 'wallet'
  }
  function renderDialog() {
    const record = records.find((item) => item.date === state.dialogDate)
    if (!record) return
    const collected = state.collected.has(record.date)
    $('dialog-title').textContent = record.preview
      ? '今日票面预览'
      : `${record.date.replaceAll('-', '.')} 的聆听纪念票`
    $('dialog-ticket').innerHTML = ticketMarkup(record)
    $('dialog-claim').hidden = collected || record.preview
    $('dialog-claim').disabled = state.busy
    $('dialog-navigation').hidden = !collected
    const saved = records.filter((item) => state.collected.has(item.date))
    const position = saved.indexOf(record)
    $('ticket-position').textContent = `${position + 1} / ${saved.length}`
    $('previous-ticket').disabled = state.busy || position <= 0
    $('next-ticket').disabled = state.busy || position >= saved.length - 1
    $('close-dialog').disabled = state.busy
  }
  function openTicket(date, opener) {
    if (state.busy || !records.some((record) => record.date === date)) return
    state.dialogDate = date
    returnFocusId = opener?.id || `tab-${state.view}`
    renderDialog()
    dialog.showModal()
  }
  async function claim(record, root) {
    if (state.busy || record.preview || state.collected.has(record.date)) return
    state.busy = true
    $('claim-button').disabled = true
    $('dialog-claim').disabled = true
    $('close-dialog').disabled = true
    $('restart-button').disabled = true
    document.querySelectorAll('[role="tab"]').forEach((tab) => {
      tab.disabled = true
    })
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const stamp = root.querySelector('.ticket-stamp')
    const ticket = root.querySelector('.ticket')
    stamp.textContent = '已珍藏'
    ticket.dataset.collected = 'true'
    runningAnimations = [
      ticket.animate(
        [
          { transform: 'translateY(0)' },
          { transform: 'translateY(-6px)', offset: 0.45 },
          { transform: 'translateY(0)' },
        ],
        { duration: reduced ? 1 : 650, easing: 'ease-in-out' },
      ),
      stamp.animate(
        [
          { opacity: 0, transform: 'scale(1.4) rotate(-10deg)' },
          { opacity: 1, transform: 'scale(.95) rotate(-7deg)', offset: 0.65 },
          { opacity: 1, transform: 'scale(1) rotate(-7deg)' },
        ],
        { duration: reduced ? 1 : 470, delay: reduced ? 0 : 120, easing: 'ease-out' },
      ),
    ]
    await Promise.allSettled(runningAnimations.map((animation) => animation.finished))
    if (disposed) return
    runningAnimations.forEach((animation) => animation.cancel())
    runningAnimations = []
    state.collected.add(record.date)
    state.busy = false
    persist()
    renderDaily()
    renderWallet()
    renderDates()
    if (dialog.open) renderDialog()
    $('restart-button').disabled = false
    document.querySelectorAll('[role="tab"]').forEach((tab) => {
      tab.disabled = false
    })
    $('announcement').textContent = `${record.album} 票面已收入票夹`
    if (dialog.open) $('close-dialog').focus()
  }
  document.querySelector('.view-tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]')
    if (tab) setView(tab.dataset.view)
  })
  document.querySelector('.view-tabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    setView(
      event.key === 'Home'
        ? 'daily'
        : event.key === 'End'
          ? 'wallet'
          : state.view === 'daily'
            ? 'wallet'
            : 'daily',
      true,
    )
  })
  $('theme-button').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light'
    updateTheme()
    persist()
  })
  $('claim-button').addEventListener('click', () =>
    state.collected.has(yesterday.date)
      ? setView('wallet', true)
      : void claim(yesterday, $('daily-ticket')),
  )
  $('today-preview').addEventListener('click', (event) =>
    openTicket(records[0].date, event.currentTarget),
  )
  for (const parent of [$('date-strip'), $('wallet-grid')])
    parent.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open-date]')
      if (button) openTicket(button.dataset.openDate, button)
    })
  $('close-dialog').addEventListener('click', () => {
    if (!state.busy) dialog.close()
  })
  dialog.addEventListener('cancel', (event) => {
    if (state.busy) event.preventDefault()
  })
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect()
    if (
      !state.busy &&
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      dialog.close()
  })
  dialog.addEventListener('close', () => {
    state.dialogDate = null
    ;($(returnFocusId) || $(`tab-${state.view}`)).focus()
  })
  $('dialog-claim').addEventListener('click', () => {
    const record = records.find((item) => item.date === state.dialogDate)
    if (record) void claim(record, $('dialog-ticket'))
  })
  for (const [id, step] of [
    ['previous-ticket', -1],
    ['next-ticket', 1],
  ])
    $(id).addEventListener('click', () => {
      const saved = records.filter((record) => state.collected.has(record.date))
      const target = saved[saved.findIndex((record) => record.date === state.dialogDate) + step]
      if (target) {
        state.dialogDate = target.date
        renderDialog()
      }
    })
  $('restart-button').addEventListener('click', () => {
    if (state.busy) return
    state.collected = new Set(defaultCollected)
    persist()
    renderDaily()
    renderWallet()
    renderDates()
    setView('daily', true)
    $('announcement').textContent = '昨日票面已恢复为待领取，可以重新体验'
  })
  document.addEventListener(
    'error',
    (event) => {
      const image = event.target
      if (image instanceof HTMLImageElement) {
        const placeholder = document.createElement('span')
        placeholder.className = `${image.className} cover-fallback`
        placeholder.textContent = 'A'
        placeholder.setAttribute('aria-label', '专辑封面暂不可用')
        image.replaceWith(placeholder)
      }
    },
    true,
  )
  window.addEventListener(
    'pagehide',
    () => {
      disposed = true
      runningAnimations.forEach((animation) => animation.cancel())
    },
    { once: true },
  )
  window.concertTicketDemo = {
    paletteReady: null,
    inspect: () => ({
      view: state.view,
      theme: state.theme,
      collected: [...state.collected],
      busy: state.busy,
      dialogDate: state.dialogDate,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      palettes: records.map((record) => ({
        date: record.date,
        album: record.album,
        dominant: paletteFor(record)?.dominant ?? null,
        quality: paletteFor(record)?.quality ?? 'fallback',
      })),
    }),
  }
  updateTheme()
  renderDaily()
  renderWallet()
  renderDates()
  window.concertTicketDemo.paletteReady = prepareArtworkPalettes()
})()
