/* Standalone prototype. All dates, listening counts and sessions below are synthetic. */
;(() => {
  'use strict'

  const $ = (id) => document.getElementById(id)
  const TODAY = '2026-10-05'
  const FIRST_DAY = '2026-09-21'
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const monthNames = [
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
  const albums = [
    {
      key: 'windswept-adan',
      title: 'Windswept Adan',
      artist: 'Ichiko Aoba',
      displayArtist: 'Ichiko Aoba · 青叶市子',
      year: '2020',
      genre: 'Alternative',
      accent: '#44686a',
    },
    {
      key: 'endlessness',
      title: 'Endlessness',
      artist: 'Nala Sinephro',
      year: '2024',
      genre: 'Jazz',
      accent: '#6c5350',
    },
    {
      key: 'async',
      title: 'async',
      artist: 'Ryuichi Sakamoto',
      displayArtist: 'Ryuichi Sakamoto · 坂本龙一',
      year: '2017',
      genre: 'Classical Crossover',
      accent: '#4d6145',
    },
    {
      key: 'a-la-sala',
      title: 'A LA SALA',
      artist: 'Khruangbin',
      year: '2024',
      genre: 'Alternative',
      accent: '#954330',
    },
    {
      key: 'waltz-for-debby',
      title: 'Waltz for Debby',
      artist: 'Bill Evans Trio',
      year: '1962',
      genre: 'Jazz',
      accent: '#7e3651',
    },
    {
      key: 'untourable-album',
      title: 'Untourable Album',
      artist: 'Men I Trust',
      year: '2021',
      genre: 'Pop',
      accent: '#705329',
    },
  ]
  const albumMap = new Map(albums.map((album) => [album.key, album]))
  const art = (album) => `assets/${album.key}.jpg`
  const pad = (n) => String(n).padStart(2, '0')
  const parseDay = (key) => new Date(`${key}T12:00:00`)
  const dayKey = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const addDay = (key, amount) => {
    const date = parseDay(key)
    date.setDate(date.getDate() + amount)
    return dayKey(date)
  }
  const humanDuration = (minutes) =>
    minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : `${minutes} 分钟`
  const dates = Array.from({ length: 15 }, (_, i) => addDay(FIRST_DAY, i))
  const emptyDates = new Set(['2026-09-23', '2026-09-27', '2026-10-02'])
  const data = new Map(
    dates.map((date, offset) => {
      if (emptyDates.has(date)) return [date, []]
      if (date === TODAY)
        return [
          date,
          albums.slice(0, 5).map((album, index) => ({
            key: album.key,
            minutes: [68, 42, 23, 18, 17][index],
            plays: [12, 8, 4, 5, 3][index],
          })),
        ]
      return [
        date,
        Array.from({ length: 3 + (offset % 3) }, (_, i) => ({
          key: albums[(offset + i) % albums.length].key,
          minutes: [56, 38, 26, 19, 13][i] + (offset % 9),
          plays: [10, 7, 5, 4, 2][i] + (offset % 3),
        })),
      ]
    }),
  )

  let selectedDate = TODAY
  let selectedAlbum = data.get(TODAY)[0].key
  let calendarMonth = 9
  const activeAnimations = new Set()
  const transientNodes = new Set()
  const hero = $('featured-artwork')
  const ribbon = $('ribbon-scroll')
  const easing = 'cubic-bezier(0.16, 1, 0.3, 1)'

  function makeElement(tag, className, text) {
    const element = document.createElement(tag)
    if (className) element.className = className
    if (text !== undefined) element.textContent = text
    return element
  }

  function makeIcon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'icon')
    svg.setAttribute('aria-hidden', 'true')
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    use.setAttribute('href', `#${name}`)
    svg.append(use)
    return svg
  }

  function animate(element, frames, options = {}) {
    if (reducedMotion.matches) return Promise.resolve()
    const animation = element.animate(frames, { duration: 520, easing, ...options })
    activeAnimations.add(animation)
    return animation.finished
      .catch(() => {})
      .finally(() => {
        activeAnimations.delete(animation)
        animation.cancel()
      })
  }

  function cancelMotion() {
    for (const animation of activeAnimations) animation.cancel()
    activeAnimations.clear()
    for (const node of transientNodes) node.remove()
    transientNodes.clear()
  }

  function removeTransient(node) {
    node.remove()
    transientNodes.delete(node)
  }

  function announce() {
    const album = albumMap.get(selectedAlbum)
    $('announcement').textContent =
      `${selectedDate}，${album ? `${album.title}，${album.artist}` : '没有聆听记录'}`
  }

  function renderAlbumList() {
    const list = $('album-list')
    list.replaceChildren()
    for (const item of data.get(selectedDate) ?? []) {
      const album = albumMap.get(item.key)
      const button = makeElement('button', 'album-row')
      button.type = 'button'
      button.dataset.album = album.key
      button.setAttribute('aria-pressed', String(album.key === selectedAlbum))
      button.setAttribute(
        'aria-label',
        `${album.title}，${album.artist}，听了 ${item.minutes} 分钟`,
      )
      const image = makeElement('img', 'album-thumb')
      image.src = art(album)
      image.alt = ''
      image.width = 40
      image.height = 40
      image.draggable = false
      image.addEventListener(
        'error',
        () => {
          image.style.visibility = 'hidden'
        },
        { once: true },
      )
      const copy = makeElement('span', 'album-row-copy')
      copy.append(
        makeElement('span', 'album-row-title', album.title),
        makeElement('span', 'album-row-artist', album.artist),
      )
      copy.title = `${album.title} · ${album.artist}`
      const indicator = makeElement('span', 'album-row-indicator')
      indicator.append(makeIcon('arrow-right'))
      button.append(image, copy, indicator)
      button.addEventListener('click', () => selectAlbum(album.key, image))
      list.append(button)
    }
  }

  function renderAlbum() {
    const items = data.get(selectedDate) ?? []
    const item = items.find((entry) => entry.key === selectedAlbum)
    if (!item) return
    const album = albumMap.get(item.key)
    document.documentElement.style.setProperty('--accent', album.accent)
    hero.hidden = false
    hero.src = art(album)
    hero.alt = `${album.title} 专辑封面`
    $('fallback-title').textContent = album.title
    $('artwork-button').setAttribute('aria-label', `查看 ${album.title} 的聆听片段`)
    $('album-title').textContent = album.title
    $('album-artist').textContent = album.displayArtist ?? album.artist
    $('album-minutes').textContent = item.minutes
    $('album-plays').textContent = item.plays
    $('cover-edition').textContent = `${album.year} · ${album.genre}`
    $('cover-position').textContent = `${pad(items.indexOf(item) + 1)} / ${pad(items.length)}`
    $('album-list')
      .querySelectorAll('button')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.album === selectedAlbum)),
      )
    renderRecords()
  }

  function renderDay() {
    const date = parseDay(selectedDate)
    const items = data.get(selectedDate) ?? []
    const minutes = items.reduce((sum, item) => sum + item.minutes, 0)
    const plays = items.reduce((sum, item) => sum + item.plays, 0)
    $('selected-date').dateTime = selectedDate
    $('day-number').textContent = pad(date.getDate())
    $('day-date').textContent = `${date.getMonth() + 1} 月 · ${weekdays[date.getDay()]}`
    $('date-today').hidden = selectedDate !== TODAY
    $('edition-month').textContent = monthNames[date.getMonth()]
    $('day-duration').textContent = humanDuration(minutes)
    $('day-count').textContent = `${items.length} 张专辑 / ${plays} 次播放`
    $('collection-count').textContent = `${items.length} 张`
    $('previous-day').disabled = selectedDate <= FIRST_DAY
    $('next-day').disabled = selectedDate >= TODAY
    $('featured-album').hidden = !items.length
    $('album-column').hidden = !items.length
    $('empty-day').hidden = !!items.length
    renderAlbumList()
    if (items.length) renderAlbum()
    else renderRecords()
    for (const button of $('ribbon-track').children) {
      if (button.dataset.date === selectedDate) button.setAttribute('aria-current', 'date')
      else button.removeAttribute('aria-current')
    }
    if (!$('date-index').hidden) renderCalendar()
  }

  function centerRibbon(smooth = true) {
    const button = $('ribbon-track').querySelector(`[data-date="${selectedDate}"]`)
    if (button)
      ribbon.scrollTo({
        left: button.offsetLeft - ribbon.clientWidth / 2 + button.offsetWidth / 2,
        behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant',
      })
  }

  function selectDate(nextDate, { focusRibbon = false } = {}) {
    if (
      nextDate === selectedDate ||
      nextDate < FIRST_DAY ||
      nextDate > TODAY ||
      !data.has(nextDate)
    )
      return
    cancelMotion()
    const direction = nextDate > selectedDate ? 1 : -1
    const outgoing = !hero.hidden && !$('featured-album').hidden ? hero.cloneNode(false) : null
    selectedDate = nextDate
    selectedAlbum = data.get(nextDate)[0]?.key ?? null
    renderDay()
    if (outgoing && selectedAlbum && !reducedMotion.matches) {
      outgoing.removeAttribute('id')
      outgoing.alt = ''
      outgoing.className = 'cover-outgoing'
      outgoing.setAttribute('aria-hidden', 'true')
      $('artwork-button').append(outgoing)
      transientNodes.add(outgoing)
      void animate(
        outgoing,
        [
          { clipPath: 'inset(0 0 0 0)', transform: 'translateX(0)' },
          {
            clipPath: direction > 0 ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)',
            transform: `translateX(${-direction * 14}px)`,
          },
        ],
        { duration: 580 },
      ).then(() => removeTransient(outgoing))
      void animate(
        hero,
        [
          { transform: `translateX(${direction * 14}px) scale(1.025)` },
          { transform: 'translateX(0) scale(1)' },
        ],
        { duration: 580 },
      )
    }
    void animate(
      $('day-number'),
      [
        { transform: `translateY(${direction * 12}px)`, opacity: 0.3 },
        { transform: 'translateY(0)', opacity: 1 },
      ],
      { duration: 400 },
    )
    void animate(
      $('album-heading'),
      [
        { transform: `translateX(${direction * 12}px)`, opacity: 0.2 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      { duration: 450 },
    )
    centerRibbon()
    if (focusRibbon)
      $('ribbon-track')
        .querySelector(`[data-date="${selectedDate}"]`)
        ?.focus({ preventScroll: true })
    announce()
  }

  function selectAlbum(key, thumbnail) {
    if (key === selectedAlbum || !(data.get(selectedDate) ?? []).some((item) => item.key === key))
      return
    cancelMotion()
    const source = thumbnail?.getBoundingClientRect()
    const target = hero.getBoundingClientRect()
    const oldCover = hero.cloneNode(false)
    selectedAlbum = key
    renderAlbum()
    const targetVisible = target.bottom > 0 && target.top < innerHeight && target.width > 0
    if (source && targetVisible && thumbnail.naturalWidth && !reducedMotion.matches) {
      oldCover.removeAttribute('id')
      oldCover.alt = ''
      oldCover.className = 'cover-outgoing'
      oldCover.setAttribute('aria-hidden', 'true')
      $('artwork-button').append(oldCover)
      transientNodes.add(oldCover)
      const flight = thumbnail.cloneNode(false)
      flight.className = 'cover-flight'
      flight.alt = ''
      flight.setAttribute('aria-hidden', 'true')
      Object.assign(flight.style, {
        left: `${source.left}px`,
        top: `${source.top}px`,
        width: `${source.width}px`,
        height: `${source.height}px`,
      })
      document.body.append(flight)
      transientNodes.add(flight)
      void animate(
        flight,
        [
          { transform: 'translate(0px, 0px) scale(1)' },
          {
            transform: `translate(${target.left - source.left}px, ${target.top - source.top}px) scale(${target.width / source.width})`,
          },
        ],
        { duration: 540, fill: 'both' },
      ).then(() => {
        removeTransient(oldCover)
        removeTransient(flight)
      })
    } else {
      void animate(hero, [{ opacity: 0.5 }, { opacity: 1 }], { duration: 220 })
    }
    void animate(
      $('album-heading'),
      [
        { opacity: 0.25, transform: 'translateY(9px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 400 },
    )
    announce()
  }

  function renderRecords() {
    const items = data.get(selectedDate) ?? []
    const item = items.find((entry) => entry.key === selectedAlbum)
    const table = $('records-table')
    table.replaceChildren()
    $('records-date').textContent = selectedDate.slice(5).replace('-', '.')
    $('records-empty').hidden = !!item
    $('records-album').textContent = item ? albumMap.get(item.key).title : ''
    if (!item) return
    const album = albumMap.get(item.key)
    // Synthetic listening fragments partition the displayed totals exactly.
    const count = Math.min(3, item.plays)
    let remainingMinutes = item.minutes
    let remainingPlays = item.plays
    for (let i = 0; i < count; i++) {
      const minutes =
        i === count - 1 ? remainingMinutes : Math.round(item.minutes * [0.38, 0.32][i])
      const plays =
        i === count - 1 ? remainingPlays : Math.max(1, Math.round(item.plays * [0.38, 0.32][i]))
      remainingMinutes -= minutes
      remainingPlays -= plays
      const row = makeElement('div', 'record-row')
      const time = makeElement('time', 'record-time', ['09:24', '15:08', '21:36'][i])
      time.dateTime = `${selectedDate}T${time.textContent}:00`
      const identity = makeElement('div', 'record-identity')
      const image = makeElement('img')
      image.src = art(album)
      image.alt = ''
      image.loading = 'lazy'
      image.width = 42
      image.height = 42
      const label = makeElement('div')
      label.append(makeElement('strong', '', album.title), makeElement('span', '', album.artist))
      identity.append(image, label)
      const measure = makeElement('div', 'record-measure')
      measure.append(
        makeElement('strong', '', `${minutes} 分钟`),
        makeElement('span', '', `${plays} 次播放`),
      )
      row.append(time, identity, measure)
      table.append(row)
    }
  }

  function renderRibbon() {
    for (const date of dates) {
      const day = parseDay(date)
      const items = data.get(date)
      const button = makeElement('button', 'ribbon-day')
      button.type = 'button'
      button.dataset.date = date
      button.setAttribute(
        'aria-label',
        `${date}，${items.length ? `${items.length} 张专辑` : '没有聆听记录'}`,
      )
      if (day.getDate() === 1 || date === FIRST_DAY)
        button.append(makeElement('span', 'ribbon-month', `${day.getMonth() + 1}月`))
      button.append(
        makeElement('span', 'ribbon-number', pad(day.getDate())),
        makeElement('span', 'ribbon-weekday', weekdays[day.getDay()].slice(2)),
      )
      if (items.length) {
        const image = makeElement('img', 'ribbon-cover')
        image.src = art(albumMap.get(items[0].key))
        image.alt = ''
        image.width = 20
        image.height = 20
        image.draggable = false
        button.append(image)
      } else button.append(makeElement('span', 'ribbon-silence', '—'))
      button.addEventListener('click', () => selectDate(date))
      $('ribbon-track').append(button)
    }
  }

  function renderCalendar() {
    const grid = $('calendar-grid')
    grid.replaceChildren()
    $('calendar-month').textContent = `2026 年 ${calendarMonth + 1} 月`
    $('previous-month').disabled = calendarMonth <= 8
    $('next-month').disabled = calendarMonth >= 9
    const start = (new Date(2026, calendarMonth, 1).getDay() + 6) % 7
    const length = new Date(2026, calendarMonth + 1, 0).getDate()
    for (let i = 0; i < start; i++) grid.append(makeElement('span'))
    for (let day = 1; day <= length; day++) {
      const key = `2026-${pad(calendarMonth + 1)}-${pad(day)}`
      const button = makeElement('button', 'calendar-cell', String(day))
      button.type = 'button'
      button.dataset.date = key
      button.disabled = key < FIRST_DAY || key > TODAY
      button.setAttribute(
        'aria-label',
        `${key}${data.get(key)?.length ? '，有聆听记录' : '，没有聆听记录'}`,
      )
      button.setAttribute('aria-pressed', String(key === selectedDate))
      if (data.get(key)?.length) button.classList.add('has-record')
      button.addEventListener('click', () => {
        selectDate(key)
        closeCalendar()
      })
      grid.append(button)
    }
  }

  function openCalendar() {
    cancelMotion()
    calendarMonth = parseDay(selectedDate).getMonth()
    $('date-index').hidden = false
    $('calendar-toggle').setAttribute('aria-expanded', 'true')
    renderCalendar()
    void animate(
      $('date-index'),
      [
        { opacity: 0.3, clipPath: 'inset(0 0 35% 0)' },
        { opacity: 1, clipPath: 'inset(0 0 0 0)' },
      ],
      { duration: 330 },
    )
    $('calendar-grid')
      .querySelector(`[data-date="${selectedDate}"]`)
      ?.focus({ preventScroll: true })
  }

  function closeCalendar(restoreFocus = true) {
    if ($('date-index').hidden) return
    $('date-index').hidden = true
    $('calendar-toggle').setAttribute('aria-expanded', 'false')
    if (restoreFocus) $('calendar-toggle').focus({ preventScroll: true })
  }

  $('previous-day').addEventListener('click', () => selectDate(addDay(selectedDate, -1)))
  $('next-day').addEventListener('click', () => selectDate(addDay(selectedDate, 1)))
  $('calendar-toggle').addEventListener('click', () =>
    $('date-index').hidden ? openCalendar() : closeCalendar(),
  )
  $('close-index').addEventListener('click', () => closeCalendar())
  $('today-button').addEventListener('click', () => {
    selectDate(TODAY)
    closeCalendar()
  })
  $('previous-month').addEventListener('click', () => {
    calendarMonth = Math.max(8, calendarMonth - 1)
    renderCalendar()
  })
  $('next-month').addEventListener('click', () => {
    calendarMonth = Math.min(9, calendarMonth + 1)
    renderCalendar()
  })
  $('last-record-button').addEventListener('click', () => {
    const earlier = [...dates]
      .reverse()
      .find((date) => date < selectedDate && data.get(date).length)
    selectDate(earlier ?? TODAY)
  })
  $('artwork-button').addEventListener('click', () => {
    const records = $('listening-records')
    records.scrollIntoView({
      behavior: reducedMotion.matches ? 'instant' : 'smooth',
      block: 'start',
    })
    records.setAttribute('tabindex', '-1')
    records.focus({ preventScroll: true })
  })
  hero.addEventListener('error', () => {
    hero.hidden = true
  })
  $('album-list').addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const rows = [...$('album-list').querySelectorAll('button')]
    const index = rows.indexOf(document.activeElement)
    if (index < 0) return
    event.preventDefault()
    const next = rows[(index + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]
    next.focus({ preventScroll: true })
    selectAlbum(next.dataset.album, next.querySelector('img'))
  })
  ribbon.addEventListener('keydown', (event) => {
    const next = {
      ArrowLeft: addDay(selectedDate, -1),
      ArrowRight: addDay(selectedDate, 1),
      Home: FIRST_DAY,
      End: TODAY,
    }[event.key]
    if (!next) return
    event.preventDefault()
    selectDate(next, { focusRibbon: true })
  })
  $('calendar-grid').addEventListener('keydown', (event) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]
    const current = event.target.dataset.date
    if (!delta || !current) return
    event.preventDefault()
    const next = addDay(current, delta)
    if (next < FIRST_DAY || next > TODAY) return
    calendarMonth = parseDay(next).getMonth()
    renderCalendar()
    $('calendar-grid').querySelector(`[data-date="${next}"]`)?.focus()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCalendar()
  })
  document.addEventListener('pointerdown', (event) => {
    if (
      !$('date-index').hidden &&
      !$('date-index').contains(event.target) &&
      !$('calendar-toggle').contains(event.target)
    )
      closeCalendar(false)
  })

  let drag = null
  let suppressClickUntil = 0
  const finishDrag = () => {
    if (drag && ribbon.hasPointerCapture(drag.id)) ribbon.releasePointerCapture(drag.id)
    if (drag?.moved) suppressClickUntil = performance.now() + 150
    drag = null
    ribbon.classList.remove('is-dragging')
  }
  ribbon.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    drag = { id: event.pointerId, x: event.clientX, left: ribbon.scrollLeft, moved: false }
  })
  ribbon.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return
    const delta = event.clientX - drag.x
    if (Math.abs(delta) > 5 && !drag.moved) {
      drag.moved = true
      ribbon.setPointerCapture(drag.id)
      ribbon.classList.add('is-dragging')
    }
    if (drag.moved) {
      event.preventDefault()
      ribbon.scrollLeft = drag.left - delta
    }
  })
  ribbon.addEventListener('pointerup', finishDrag)
  ribbon.addEventListener('pointercancel', finishDrag)
  ribbon.addEventListener('lostpointercapture', finishDrag)
  window.addEventListener('pointerup', finishDrag)
  ribbon.addEventListener(
    'click',
    (event) => {
      if (performance.now() < suppressClickUntil) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    },
    true,
  )
  window.addEventListener('blur', () => {
    finishDrag()
    cancelMotion()
  })
  let resizeFrame = 0
  window.addEventListener('resize', () => {
    finishDrag()
    cancelMotion()
    cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(() => centerRibbon(false))
  })
  window.addEventListener('scroll', cancelMotion, { passive: true })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      finishDrag()
      cancelMotion()
    }
  })
  reducedMotion.addEventListener('change', cancelMotion)
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(resizeFrame)
    cancelMotion()
  })

  renderRibbon()
  renderDay()
  centerRibbon(false)
  for (const album of albums) {
    const image = new Image()
    image.src = art(album)
  }
  // Keep the page visible even when fonts or scripting are delayed.
  void document.fonts.ready.then(() => {
    void animate(
      $('featured-album'),
      [
        { clipPath: 'inset(0 0 7% 0)', transform: 'translateY(10px)' },
        { clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)' },
      ],
      { duration: 650 },
    )
  })
})()
