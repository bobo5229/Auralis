'use strict'

// 固定演示时钟与合成记录；不读取个人曲库，也不调用播放或 IPC 能力。
const TODAY = '2026-10-05'
const FIRST_DATE = '2025-01-01'
const MONTHS = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
]
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const ARTWORK_ROOT = '../listening-journal/assets/'
const ALBUMS = [
  { id: 'adan', title: 'Windswept Adan', artist: 'Ichiko Aoba', artwork: 'windswept-adan.jpg' },
  { id: 'endlessness', title: 'Endlessness', artist: 'Nala Sinephro', artwork: 'endlessness.jpg' },
  { id: 'async', title: 'async', artist: 'Ryuichi Sakamoto', artwork: 'async.jpg' },
  { id: 'sala', title: 'A LA SALA', artist: 'Khruangbin', artwork: 'a-la-sala.jpg' },
  {
    id: 'untourable',
    title: 'Untourable Album',
    artist: 'Men I Trust',
    artwork: 'untourable-album.jpg',
  },
  {
    id: 'debby',
    title: 'Waltz for Debby',
    artist: 'Bill Evans Trio',
    artwork: 'waltz-for-debby.jpg',
  },
]
const EXAMPLE_TRACKS = ['窗边的光', '沿海公路', '慢慢远去']
const $ = (id) => document.getElementById(id)
const pad = (n) => String(n).padStart(2, '0')
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const recordCache = new Map()

let selectedDate = TODAY
let selectedAlbumId = 'adan'
let railMonth = TODAY.slice(0, 7)
let indexYear = 2026
let indexMonth = 9
let calendarFocus = TODAY
let demoState = 'normal'
let transitionToken = 0
let activeAnimations = []
let failedArtwork = false
let artworkRetry = 0
let dragging = null
let suppressRailClick = false

function parseDate(key) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}
function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function shiftDate(key, days) {
  const date = parseDate(key)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}
function validDate(key) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(key) &&
    key >= FIRST_DATE &&
    key <= TODAY &&
    dateKey(parseDate(key)) === key
  )
}
function humanDate(key) {
  const date = parseDate(key)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}
function duration(seconds) {
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours} 小时${minutes % 60 ? ` ${minutes % 60} 分` : ''}` : `${minutes} 分钟`
}
function escapeText(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  )
}
function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#${name}" /></svg>`
}
function hashDate(key) {
  return [...key].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 17)
}
function dayRecord(key) {
  if (recordCache.has(key)) return recordCache.get(key)
  let items = []
  const hash = hashDate(key)
  if (validDate(key) && key !== '2026-10-04' && key !== '2026-10-02' && hash % 7 !== 0) {
    const count = 2 + (hash % 4)
    const offset = hash % ALBUMS.length
    items = Array.from({ length: count }, (_, index) => {
      const album = ALBUMS[(offset + index) % ALBUMS.length]
      const plays = Math.max(1, 11 - index * 2 + ((hash >>> (index + 1)) % 4))
      return { ...album, plays, seconds: (plays * 3 + ((hash >>> (index + 2)) % 9)) * 60 }
    })
  }
  if (key === TODAY) {
    items = ALBUMS.slice(0, 5).map((album, index) => ({
      ...album,
      plays: [11, 7, 6, 3, 2][index],
      seconds: [39, 36, 29, 12, 6][index] * 60,
    }))
  }
  const record = {
    items,
    plays: items.reduce((sum, item) => sum + item.plays, 0),
    seconds: items.reduce((sum, item) => sum + item.seconds, 0),
  }
  recordCache.set(key, record)
  return record
}
function getSelectedAlbum() {
  const items = dayRecord(selectedDate).items
  return items.find((item) => item.id === selectedAlbumId) ?? items[0] ?? null
}
function intensity(plays) {
  return plays >= 35 ? 4 : plays >= 25 ? 3 : plays >= 15 ? 2 : plays > 0 ? 1 : 0
}
function monthDates(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  const count = new Date(year, month, 0).getDate()
  return Array.from({ length: count }, (_, index) => `${monthKey}-${pad(index + 1)}`)
}
function announce(message) {
  $('announcement').textContent = message
}
function stopTransitions() {
  ++transitionToken
  activeAnimations.forEach((animation) => animation.cancel())
  activeAnimations = []
}
function playAnimation(element, frames, options) {
  const animation = element.animate(frames, options)
  activeAnimations.push(animation)
  animation.finished
    .catch(() => {})
    .finally(() => {
      activeAnimations = activeAnimations.filter((entry) => entry !== animation)
    })
}
async function revealArtwork(direction = 1) {
  stopTransitions()
  if (reducedMotion.matches || demoState !== 'normal' || !getSelectedAlbum()) return
  const token = transitionToken
  await $('main-artwork')
    .decode()
    .catch(() => {})
  if (token !== transitionToken || failedArtwork || document.hidden) return
  playAnimation(
    $('main-artwork'),
    [
      {
        clipPath: direction >= 0 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)',
        transform: `translateX(${direction >= 0 ? 12 : -12}px)`,
      },
      { clipPath: 'inset(0 0 0 0)', transform: 'translateX(0)' },
    ],
    { duration: 430, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  )
  playAnimation(
    $('album-heading'),
    [{ transform: 'translateY(7px)' }, { transform: 'translateY(0)' }],
    { duration: 350, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  )
}

function renderDay() {
  const date = parseDate(selectedDate)
  const record = dayRecord(selectedDate)
  const album = getSelectedAlbum()
  const state = demoState === 'normal' && !album ? 'empty' : demoState
  $('day-entry').dataset.state = state
  $('day-entry').setAttribute('aria-busy', String(state === 'loading'))
  $('date-year').textContent = date.getFullYear()
  $('date-month-number').textContent = pad(date.getMonth() + 1)
  $('date-day-number').textContent = pad(date.getDate())
  $('date-accessible').textContent = humanDate(selectedDate)
  $('day-date').setAttribute('aria-label', humanDate(selectedDate))
  $('date-weekday').textContent = `${MONTHS[date.getMonth()]} · ${WEEKDAYS[date.getDay()]}`
  $('today-mark').hidden = selectedDate !== TODAY
  $('previous-day').disabled = selectedDate <= FIRST_DATE
  $('next-day').disabled = selectedDate >= TODAY
  $('day-summary').innerHTML =
    state === 'normal'
      ? `<p>音乐相伴 <strong>${duration(record.seconds)}</strong></p><p>留下 <strong>${record.plays} 次</strong>聆听</p>`
      : `<p>${state === 'empty' ? '当天没有聆听记录' : state === 'loading' ? '正在整理这一天的记录' : '当天记录暂时无法读取'}</p>`
  $('date-footnote').textContent =
    state === 'normal' ? `这一页，记下了 ${record.items.length} 张专辑。` : '日期仍然可以继续浏览。'
  $('album-count').textContent = state === 'normal' ? `${record.items.length} 张` : '—'
  $('album-facts').hidden = state !== 'normal'
  $('track-toggle').hidden = state !== 'normal'
  $('main-artwork').hidden = state !== 'normal' || failedArtwork
  $('record-state').hidden = state === 'normal' && !failedArtwork
  $('state-action').hidden = state === 'loading'
  if (state !== 'normal') {
    const messages = {
      empty: [
        '这一天，留了一点空白。',
        '没有聆听记录。挑选另一天，继续回看。',
        '回到有音乐的日子',
        '没有专辑记录',
        '音乐会在下一个日子留下痕迹。',
      ],
      error: [
        '这一天的记录，暂时没能打开。',
        '可以重新读取，或先翻看另一天。',
        '重新读取',
        '记录暂未打开',
        '你的时间索引仍然可以浏览。',
      ],
      loading: [
        '正在打开这一天。',
        '聆听记录正在整理，请稍候。',
        '',
        '正在整理专辑',
        '很快就能看到这一天的音乐。',
      ],
    }
    const message = messages[state]
    $('state-title').textContent = message[0]
    $('state-description').textContent = message[1]
    $('state-action').innerHTML =
      `${message[2]}${icon(state === 'error' ? 'refresh' : 'arrow-right')}`
    $('record-state')
      .querySelector('use')
      .setAttribute('href', state === 'loading' ? '#refresh' : '#music')
    $('album-title').textContent = message[3]
    $('album-artist').textContent = message[4]
    $('album-list').replaceChildren()
    $('artwork-caption').textContent = state === 'loading' ? '正在读取' : '等待下一段音乐'
    $('artwork-position').textContent = '—'
    setTracksOpen(false)
  } else {
    const position = record.items.findIndex((item) => item.id === album.id)
    $('album-title').textContent = album.title
    $('album-artist').textContent = album.artist
    $('album-plays').textContent = `${album.plays} 次聆听`
    $('album-duration').textContent = duration(album.seconds)
    const artwork =
      ARTWORK_ROOT + album.artwork + (artworkRetry ? `?preview-retry=${artworkRetry}` : '')
    if ($('main-artwork').getAttribute('src') !== artwork) $('main-artwork').src = artwork
    $('main-artwork').alt = `${album.title} — ${album.artist} 专辑封面`
    $('artwork-caption').textContent = position === 0 ? '这一天，听得最多' : '这一天，也有它相伴'
    $('artwork-position').innerHTML =
      `${pad(position + 1)} <span>/ ${pad(record.items.length)}</span>`
    $('album-list').innerHTML = record.items
      .map(
        (item) =>
          `<li><button class="album-row" data-album="${item.id}" aria-pressed="${item.id === album.id}" aria-label="${escapeText(item.title)}，${escapeText(item.artist)}，${item.plays} 次聆听"><img class="album-thumb" src="${ARTWORK_ROOT + item.artwork}" width="40" height="40" alt="" /><span class="album-row-text"><span class="album-name">${escapeText(item.title)}</span><span class="album-row-meta">${item.plays} 次 · ${duration(item.seconds)}</span></span>${icon('arrow-right')}</button></li>`,
      )
      .join('')
    if (!$('track-panel').hidden) renderTracks()
  }
}

function renderRail() {
  const dates = monthDates(railMonth)
  const [year, month] = railMonth.split('-').map(Number)
  const active = dates.filter((key) => dayRecord(key).plays > 0).length
  $('timeline-title').textContent = `${MONTHS[month - 1]}的日子`
  $('timeline-note').textContent =
    `${active ? `${active} 天有音乐相伴。` : '这个月还没有聆听记录。'}沿着日期，继续回看。`
  $('month-label').textContent = `${year} / ${pad(month)}`
  $('previous-month').disabled = railMonth <= FIRST_DATE.slice(0, 7)
  $('next-month').disabled = railMonth >= TODAY.slice(0, 7)
  const focusDate = selectedDate.startsWith(railMonth)
    ? selectedDate
    : dates.find((key) => validDate(key))
  $('date-rail').innerHTML = dates
    .map((key) => {
      const plays = dayRecord(key).plays
      const date = parseDate(key)
      return `<button class="rail-day" data-date="${key}" data-active="${plays > 0}" data-future="${key > TODAY}" ${key > TODAY ? 'disabled' : ''} ${key === selectedDate ? 'aria-current="date"' : ''} tabindex="${key === focusDate ? 0 : -1}" aria-label="${humanDate(key)}，${key > TODAY ? '尚未到来' : plays ? `${plays} 次聆听` : '没有聆听记录'}"><span class="rail-weekday">${WEEKDAYS[date.getDay()].replace('星期', '周')}</span><span class="rail-number">${pad(date.getDate())}</span><span class="rail-dot" aria-hidden="true"></span></button>`
    })
    .join('')
}
function locateDate(key, smooth = true) {
  const rail = $('date-rail')
  const button = rail.querySelector(`[data-date="${key}"]`)
  if (!button) return
  const left = button.offsetLeft - rail.offsetLeft - rail.clientWidth / 2 + button.offsetWidth / 2
  rail.scrollTo({
    left: Math.max(0, left),
    behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant',
  })
}
function renderIndex() {
  const days = Array.from({ length: 12 }, (_, month) =>
    monthDates(`${indexYear}-${pad(month + 1)}`),
  )
    .flat()
    .filter((key) => key <= TODAY)
  const active = days.filter((key) => dayRecord(key).plays > 0)
  const plays = active.reduce((sum, key) => sum + dayRecord(key).plays, 0)
  const seconds = active.reduce((sum, key) => sum + dayRecord(key).seconds, 0)
  $('annual-note').innerHTML =
    `<span><strong>${active.length}</strong> 天有音乐相伴</span><span><strong>${plays.toLocaleString('zh-CN')}</strong> 次聆听</span><span>共 <strong>${duration(seconds)}</strong></span>`
  if (!calendarFocus.startsWith(String(indexYear)) || !validDate(calendarFocus))
    calendarFocus = days.at(-1)
  $('index-year').value = String(indexYear)
  $('index-month').value = String(indexMonth + 1)
  Array.from($('index-month').options).forEach((option) => {
    option.disabled = `${indexYear}-${pad(option.value)}-01` > TODAY
  })
  $('month-atlas').innerHTML = Array.from({ length: 12 }, (_, month) => {
    const monthKey = `${indexYear}-${pad(month + 1)}`
    const blanks = (new Date(indexYear, month, 1).getDay() + 6) % 7
    return `<div class="mini-month" data-current-month="${month === indexMonth}"><h3>${MONTHS[month]}</h3><div class="month-weekdays" aria-hidden="true">${['一', '二', '三', '四', '五', '六', '日'].map((day) => `<span>${day}</span>`).join('')}</div><div class="month-grid" role="group" aria-label="${indexYear}年${month + 1}月">${'<span class="calendar-spacer" aria-hidden="true"></span>'.repeat(blanks)}${monthDates(
      monthKey,
    )
      .map((key) => {
        const plays = dayRecord(key).plays
        const label = `${humanDate(key)}，${key > TODAY ? '尚未到来' : plays ? `${plays} 次聆听` : '没有聆听记录'}`
        return `<button class="calendar-day" data-calendar-date="${key}" data-level="${intensity(plays)}" ${key > TODAY ? 'disabled' : ''} tabindex="${key === calendarFocus ? 0 : -1}" aria-pressed="${key === selectedDate}" aria-label="${label}" title="${label}"><span class="calendar-day-number" aria-hidden="true">${parseDate(key).getDate()}</span></button>`
      })
      .join('')}</div></div>`
  }).join('')
}
function setIndexOpen(open, restoreFocus = false) {
  $('year-index').hidden = !open
  $('index-toggle').setAttribute('aria-expanded', String(open))
  if (open) {
    indexYear = parseDate(selectedDate).getFullYear()
    indexMonth = parseDate(selectedDate).getMonth()
    calendarFocus = selectedDate
    $('index-year').value = String(indexYear)
    renderIndex()
    $('month-atlas')
      .querySelector(`[data-calendar-date="${calendarFocus}"]`)
      ?.focus({ preventScroll: true })
  } else if (restoreFocus) $('index-toggle').focus({ preventScroll: true })
}
function renderTracks() {
  const album = getSelectedAlbum()
  if (!album) return
  $('track-panel-title').textContent = `${album.title} · 当天曲目`
  $('track-panel').querySelector('.track-panel-heading p').textContent =
    '曲目名称与聆听数值均为演示；展示当天累计，不表示具体播放时刻。'
  const count = Math.min(EXAMPLE_TRACKS.length, album.plays)
  $('track-list').innerHTML = EXAMPLE_TRACKS.slice(0, count)
    .map((title, index) => {
      const plays = Math.floor(album.plays / count) + (index < album.plays % count ? 1 : 0)
      const seconds = Math.floor(album.seconds / count) + (index < album.seconds % count ? 1 : 0)
      return `<li class="track-row"><span class="track-number">${pad(index + 1)}</span><span class="track-name">${title}<span class="track-meta">${plays} 次 · ${duration(seconds)}</span></span></li>`
    })
    .join('')
}
function setTracksOpen(open, restoreFocus = false) {
  $('track-panel').hidden = !open
  $('track-toggle').setAttribute('aria-expanded', String(open))
  if (open) renderTracks()
  else if (restoreFocus) $('track-toggle').focus({ preventScroll: true })
}
function selectDate(key, focusRail = false) {
  if (!validDate(key)) return
  const direction = key >= selectedDate ? 1 : -1
  const changed = key !== selectedDate || demoState !== 'normal'
  stopTransitions()
  selectedDate = key
  selectedAlbumId = dayRecord(key).items[0]?.id ?? null
  railMonth = key.slice(0, 7)
  failedArtwork = false
  artworkRetry = 0
  demoState = 'normal'
  $('demo-state').value = 'normal'
  setTracksOpen(false)
  renderDay()
  renderRail()
  if (!$('year-index').hidden) renderIndex()
  if (focusRail)
    $('date-rail').querySelector(`[data-date="${key}"]`)?.focus({ preventScroll: true })
  locateDate(key)
  announce(
    `${humanDate(key)}，${dayRecord(key).plays ? `${dayRecord(key).plays} 次聆听` : '没有聆听记录'}`,
  )
  if (changed) void revealArtwork(direction)
}
function selectAlbum(id, focus = false) {
  const items = dayRecord(selectedDate).items
  const target = items.findIndex((item) => item.id === id)
  if (target < 0 || demoState !== 'normal') return
  const current = items.findIndex((item) => item.id === selectedAlbumId)
  if (id !== selectedAlbumId) {
    stopTransitions()
    failedArtwork = false
    artworkRetry = 0
    selectedAlbumId = id
    renderDay()
    void revealArtwork(target >= current ? 1 : -1)
    announce(`${items[target].title}，${items[target].plays} 次聆听`)
  }
  // renderDay 重建列表后，恢复点击或键盘激活元素的焦点。
  if (focus) $('album-list').querySelector(`[data-album="${id}"]`)?.focus({ preventScroll: true })
}
function changeMonth(delta) {
  const date = parseDate(`${railMonth}-01`)
  date.setMonth(date.getMonth() + delta)
  const next = dateKey(date).slice(0, 7)
  if (next < FIRST_DATE.slice(0, 7) || next > TODAY.slice(0, 7)) return
  railMonth = next
  renderRail()
  // 月份浏览是临时导航，不替换正文选中的日期和专辑。
  locateDate(selectedDate.startsWith(next) ? selectedDate : `${next}-01`, false)
}
function nearestRecordedDate() {
  for (let key = shiftDate(selectedDate, -1); key >= FIRST_DATE; key = shiftDate(key, -1)) {
    if (dayRecord(key).plays) return key
  }
  return TODAY
}

$('previous-day').addEventListener('click', () => selectDate(shiftDate(selectedDate, -1)))
$('next-day').addEventListener('click', () => selectDate(shiftDate(selectedDate, 1)))
$('today-button').addEventListener('click', () => {
  setIndexOpen(false)
  selectDate(TODAY)
})
$('index-toggle').addEventListener('click', () => setIndexOpen($('year-index').hidden))
$('index-close').addEventListener('click', () => setIndexOpen(false, true))
$('index-year').addEventListener('change', (event) => {
  indexYear = Number(event.target.value)
  indexMonth =
    indexYear === parseDate(TODAY).getFullYear()
      ? Math.min(indexMonth, parseDate(TODAY).getMonth())
      : indexMonth
  calendarFocus = `${indexYear}-${pad(indexMonth + 1)}-01`
  renderIndex()
})
$('index-month').addEventListener('change', (event) => {
  indexMonth = Number(event.target.value) - 1
  calendarFocus = `${indexYear}-${pad(indexMonth + 1)}-01`
  renderIndex()
})
$('month-atlas').addEventListener('click', (event) => {
  const button = event.target.closest('[data-calendar-date]')
  if (!button || button.disabled) return
  const date = button.dataset.calendarDate
  setIndexOpen(false, true)
  selectDate(date)
})
$('month-atlas').addEventListener('keydown', (event) => {
  const button = event.target.closest('[data-calendar-date]')
  if (!button) return
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  const key = button.dataset.calendarDate
  let next =
    event.key === 'Home'
      ? `${key.slice(0, 7)}-01`
      : event.key === 'End'
        ? monthDates(key.slice(0, 7))
            .filter((date) => validDate(date))
            .at(-1)
        : event.key in offsets
          ? shiftDate(key, offsets[event.key])
          : null
  if (!next) return
  event.preventDefault()
  if (!validDate(next)) return
  calendarFocus = next
  indexYear = parseDate(next).getFullYear()
  indexMonth = parseDate(next).getMonth()
  renderIndex()
  $('month-atlas').querySelector(`[data-calendar-date="${next}"]`)?.focus()
})
$('album-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-album]')
  if (button) selectAlbum(button.dataset.album, true)
})
$('album-list').addEventListener('keydown', (event) => {
  const button = event.target.closest('[data-album]')
  if (!button || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const items = dayRecord(selectedDate).items
  const current = items.findIndex((item) => item.id === button.dataset.album)
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : Math.max(0, Math.min(items.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))
  selectAlbum(items[next].id, true)
})
$('track-toggle').addEventListener('click', () => setTracksOpen($('track-panel').hidden))
$('track-close').addEventListener('click', () => setTracksOpen(false, true))
$('previous-month').addEventListener('click', () => changeMonth(-1))
$('next-month').addEventListener('click', () => changeMonth(1))
$('month-label').addEventListener('click', () => {
  railMonth = selectedDate.slice(0, 7)
  renderRail()
  locateDate(selectedDate)
})
$('date-rail').addEventListener('click', (event) => {
  if (suppressRailClick) {
    event.preventDefault()
    return
  }
  const button = event.target.closest('[data-date]')
  if (button && !button.disabled) selectDate(button.dataset.date, true)
})
$('date-rail').addEventListener('keydown', (event) => {
  const button = event.target.closest('[data-date]')
  if (!button || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const dates = monthDates(railMonth).filter((date) => validDate(date))
  const next =
    event.key === 'Home'
      ? dates[0]
      : event.key === 'End'
        ? dates.at(-1)
        : shiftDate(button.dataset.date, event.key === 'ArrowRight' ? 1 : -1)
  selectDate(next, true)
})
$('date-rail').addEventListener(
  'wheel',
  (event) => {
    const rail = $('date-rail')
    if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
    const canScroll =
      event.deltaY > 0
        ? rail.scrollLeft < rail.scrollWidth - rail.clientWidth - 2
        : rail.scrollLeft > 1
    if (canScroll) {
      event.preventDefault()
      rail.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 18 : 1)
    }
  },
  { passive: false },
)
$('date-rail').addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'mouse' || event.button !== 0) return
  dragging = {
    id: event.pointerId,
    x: event.clientX,
    left: $('date-rail').scrollLeft,
    moved: false,
  }
})
$('date-rail').addEventListener('pointermove', (event) => {
  if (!dragging || event.pointerId !== dragging.id) return
  const delta = event.clientX - dragging.x
  if (Math.abs(delta) > 6 && !dragging.moved) {
    dragging.moved = true
    $('date-rail').setPointerCapture(event.pointerId)
    $('date-rail').style.scrollSnapType = 'none'
  }
  if (dragging.moved) {
    event.preventDefault()
    $('date-rail').scrollLeft = dragging.left - delta
  }
})
function endDrag() {
  if (!dragging) return
  if (dragging.moved) {
    suppressRailClick = true
    setTimeout(() => {
      suppressRailClick = false
    }, 0)
    if ($('date-rail').hasPointerCapture(dragging.id))
      $('date-rail').releasePointerCapture(dragging.id)
  }
  dragging = null
  $('date-rail').style.removeProperty('scroll-snap-type')
}
window.addEventListener('pointerup', endDrag)
window.addEventListener('pointercancel', endDrag)
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  if (!$('year-index').hidden) {
    event.preventDefault()
    setIndexOpen(false, true)
  } else if (!$('track-panel').hidden) {
    event.preventDefault()
    setTracksOpen(false, true)
  }
})
$('state-action').addEventListener('click', () => {
  if (failedArtwork) {
    failedArtwork = false
    artworkRetry = Date.now()
    renderDay()
    return
  }
  if (demoState === 'error') {
    demoState = 'normal'
    $('demo-state').value = 'normal'
    renderDay()
    announce('记录已重新打开')
    $('track-toggle').focus({ preventScroll: true })
  } else {
    selectDate(nearestRecordedDate())
    $('previous-day').focus({ preventScroll: true })
  }
})
$('demo-state').addEventListener('change', (event) => {
  stopTransitions()
  demoState = event.target.value
  setTracksOpen(false)
  renderDay()
  announce(`预览${event.target.selectedOptions[0].textContent}`)
})
$('main-artwork').addEventListener('error', () => {
  stopTransitions()
  failedArtwork = true
  $('main-artwork').hidden = true
  $('record-state').hidden = false
  $('record-state').querySelector('use').setAttribute('href', '#music')
  $('state-title').textContent = '封面暂时无法显示。'
  $('state-description').textContent = '聆听记录仍可查看，也可以切换另一张专辑。'
  $('state-action').hidden = false
  $('state-action').innerHTML = `重试封面${icon('refresh')}`
})
window.addEventListener('blur', () => {
  stopTransitions()
  endDrag()
})
window.addEventListener('pagehide', stopTransitions)
window.addEventListener('resize', stopTransitions)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopTransitions()
})
reducedMotion.addEventListener('change', stopTransitions)

renderDay()
renderRail()
locateDate(selectedDate, false)
