import { uiText, i18n } from '@renderer/i18n'
import type { MacViewActions, MacViewController, MacViewModel } from './macViewTypes'
import { mountMacDevice, type MacDeviceController } from './macDevice'
import { mountArchiveDisks } from './archiveDisks'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { observeWindowVisibility } from '@renderer/shared/animation/windowVisibility'

function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function mountArchiveMacView(root: ShadowRoot, actions: MacViewActions): MacViewController {
  const albumListEl = root.getElementById('album-list') as HTMLElement
  const screenStatusEl = root.getElementById('screen-status') as HTMLElement
  const dayPrevBtn = root.getElementById('day-prev') as HTMLButtonElement
  const dayNextBtn = root.getElementById('day-next') as HTMLButtonElement
  const dateTrigger = root.getElementById('date-trigger') as HTMLButtonElement
  const datePopup = root.getElementById('mac-date-popup') as HTMLElement
  const yearSelect = root.getElementById('mac-calendar-year-select') as HTMLButtonElement
  const calPrevMonthBtn = root.getElementById('mac-cal-prev-month') as HTMLButtonElement
  const calNextMonthBtn = root.getElementById('mac-cal-next-month') as HTMLButtonElement
  const calMonthLabel = root.getElementById('mac-cal-month-label') as HTMLElement
  const calCloseBtn = root.getElementById('mac-cal-close') as HTMLButtonElement
  const calGrid = root.getElementById('mac-calendar-grid') as HTMLElement
  const controls = root.getElementById('disk-controls')!
  let latestModel: MacViewModel | null = null
  let disposed = false
  let isPopupOpen = false
  const subscriptions = new AbortController()
  const listenerOptions = { signal: subscriptions.signal }
  const yearMenu = root.getElementById('mac-calendar-years') as HTMLElement
  const calendarStatus = root.getElementById('mac-calendar-status') as HTMLElement

  function refreshStaticLocale(): void {
    root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((node) => {
      node.textContent = uiText(node.dataset.i18n!)
    })
    root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((node) => {
      node.setAttribute('aria-label', uiText(node.dataset.i18nAria!))
    })
    root.querySelectorAll<HTMLElement>('[data-weekday]').forEach((node) => {
      node.textContent = new Intl.DateTimeFormat(i18n.global.locale.value, {
        weekday: 'narrow',
      }).format(new Date(2026, 0, 4 + Number(node.dataset.weekday)))
    })
  }

  // Calendar popup month navigation state (separated from selectedDate)
  let popupBrowsingYear = new Date().getFullYear()
  let popupBrowsingMonth = new Date().getMonth()

  const disks = mountArchiveDisks(root, actions.onSelectAlbum, renderArtwork)
  const macDevice: MacDeviceController = mountMacDevice(root, {
    onSceneReadyChange: actions.onSceneReadyChange,
    onTransition: () => {
      closeDatePopup()
    },
    onReturnToIntro: () => {
      closeDatePopup()
      disks.reset()
    },
    onPopupEscape: () => {
      if (!yearMenu.hidden) {
        yearMenu.hidden = true
        yearSelect.setAttribute('aria-expanded', 'false')
        yearSelect.focus()
        return true
      }
      if (isPopupOpen) {
        closeDatePopup(true)
        return true
      }
      return false
    },
  })

  const stopVisibility = observeWindowVisibility((visible) => {
    macDevice.setVisible(visible)
    disks.setVisible(visible)
  })

  // 6. Day Prev / Next Buttons
  dayPrevBtn?.addEventListener(
    'click',
    () => {
      if (!latestModel?.selectedDate) return
      const cur = parseDateKey(latestModel.selectedDate)
      cur.setDate(cur.getDate() - 1)
      const prevKey = formatDateKey(cur)
      actions.onSelectDate(prevKey)
    },
    listenerOptions,
  )

  dayNextBtn?.addEventListener(
    'click',
    () => {
      if (!latestModel?.selectedDate) return
      const cur = parseDateKey(latestModel.selectedDate)
      cur.setDate(cur.getDate() + 1)
      const nextKey = formatDateKey(cur)
      actions.onSelectDate(nextKey)
    },
    listenerOptions,
  )

  // 7. Custom Date Popup
  function openDatePopup() {
    if (!latestModel || isPopupOpen) return
    isPopupOpen = true
    datePopup.hidden = false
    dateTrigger.setAttribute('aria-expanded', 'true')

    if (latestModel.selectedDate) {
      const cur = parseDateKey(latestModel.selectedDate)
      popupBrowsingYear = cur.getFullYear()
      popupBrowsingMonth = cur.getMonth()
    }
    renderPopupCalendar()
    calGrid.querySelector<HTMLButtonElement>('.is-selected')?.focus()
  }

  function closeDatePopup(focusTrigger = false) {
    if (!isPopupOpen) return
    isPopupOpen = false
    datePopup.hidden = true
    yearMenu.hidden = true
    yearSelect.setAttribute('aria-expanded', 'false')
    dateTrigger.setAttribute('aria-expanded', 'false')
    if (focusTrigger) {
      dateTrigger.focus()
    }
  }

  dateTrigger?.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      if (isPopupOpen) closeDatePopup()
      else openDatePopup()
    },
    listenerOptions,
  )

  calCloseBtn?.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      closeDatePopup(true)
    },
    listenerOptions,
  )

  calPrevMonthBtn?.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      popupBrowsingMonth--
      if (popupBrowsingMonth < 0) {
        popupBrowsingMonth = 11
        popupBrowsingYear--
        actions.onBrowseYear(popupBrowsingYear)
      }
      renderPopupCalendar()
    },
    listenerOptions,
  )

  calNextMonthBtn?.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      popupBrowsingMonth++
      if (popupBrowsingMonth > 11) {
        popupBrowsingMonth = 0
        popupBrowsingYear++
        actions.onBrowseYear(popupBrowsingYear)
      }
      renderPopupCalendar()
    },
    listenerOptions,
  )

  yearSelect?.addEventListener(
    'click',
    () => {
      yearMenu.hidden = !yearMenu.hidden
      yearSelect.setAttribute('aria-expanded', String(!yearMenu.hidden))
      if (!yearMenu.hidden)
        yearMenu.querySelector<HTMLButtonElement>("[aria-selected='true']")?.focus()
    },
    listenerOptions,
  )

  document.addEventListener(
    'pointerdown',
    (e) => {
      const inside = e
        .composedPath()
        .some((target) => target instanceof Element && target.matches('.date-picker'))
      if (isPopupOpen && !inside) {
        closeDatePopup()
      }
    },
    listenerOptions,
  )

  function placeholder(): HTMLElement {
    const node = document.createElement('span')
    node.className = 'artwork-placeholder'
    node.setAttribute('aria-hidden', 'true')
    return node
  }

  function renderArtwork(container: HTMLElement, key: string | null): void {
    const url = getArtworkUrl(key)
    container.replaceChildren()
    if (!url) {
      container.append(placeholder())
      return
    }
    const img = document.createElement('img')
    img.alt = ''
    img.draggable = false
    img.decoding = 'async'
    img.addEventListener(
      'error',
      () => {
        if (img.parentElement === container) container.replaceChildren(placeholder())
      },
      { once: true },
    )
    img.src = url
    container.append(img)
  }

  function renderPopupCalendar() {
    if (!latestModel) return
    const focusedDate = (root.activeElement as HTMLElement | null)?.dataset.date
    const focusedYear = (root.activeElement as HTMLElement | null)?.dataset.year
    const todayKey = latestModel.todayKey
    calMonthLabel.textContent = new Intl.DateTimeFormat(i18n.global.locale.value, {
      month: 'short',
    }).format(new Date(popupBrowsingYear, popupBrowsingMonth, 1))

    const minYear = Math.min(...latestModel.years)
    calPrevMonthBtn.disabled = popupBrowsingYear <= minYear && popupBrowsingMonth === 0
    calNextMonthBtn.disabled =
      `${popupBrowsingYear}-${String(popupBrowsingMonth + 1).padStart(2, '0')}` >=
      todayKey.slice(0, 7)
    yearSelect.textContent = new Intl.DateTimeFormat(i18n.global.locale.value, {
      year: 'numeric',
    }).format(new Date(popupBrowsingYear, 0, 1))
    yearMenu.replaceChildren()
    latestModel.years.forEach((y) => {
      const opt = document.createElement('button')
      opt.type = 'button'
      opt.setAttribute('role', 'option')
      opt.setAttribute('aria-selected', String(y === popupBrowsingYear))
      opt.dataset.year = String(y)
      opt.textContent = new Intl.DateTimeFormat(i18n.global.locale.value, {
        year: 'numeric',
      }).format(new Date(y, 0, 1))
      opt.addEventListener('click', () => {
        popupBrowsingYear = y
        const today = parseDateKey(latestModel!.todayKey)
        popupBrowsingMonth =
          y === today.getFullYear()
            ? Math.min(popupBrowsingMonth, today.getMonth())
            : popupBrowsingMonth
        yearMenu.hidden = true
        yearSelect.setAttribute('aria-expanded', 'false')
        actions.onSelectYear(y)
        renderPopupCalendar()
        yearSelect.focus()
      })
      yearMenu.append(opt)
    })
    calendarStatus.replaceChildren()
    if (latestModel.calendarError) {
      calendarStatus.append(latestModel.calendarError + ' ')
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.className = 'mac-retry-button'
      retry.id = 'calendar-retry'
      retry.textContent = uiText('albums.status.retry')
      retry.onclick = actions.onRetryCalendar
      calendarStatus.append(retry)
    } else if (latestModel.calendarLoading) {
      calendarStatus.textContent = uiText('archive.mac.calendarLoading')
    }
    calendarStatus.hidden = !latestModel.calendarError && !latestModel.calendarLoading

    // Populate Days Grid
    calGrid.querySelectorAll('.mac-calendar-cell').forEach((el) => el.remove())

    const firstDayOfWeek = new Date(popupBrowsingYear, popupBrowsingMonth, 1).getDay()
    const daysInMonth = new Date(popupBrowsingYear, popupBrowsingMonth + 1, 0).getDate()

    // Map of days with records
    const recordDaysMap = new Map(latestModel.calendarDays.map((d) => [d.date, d.playCount]))

    // Empty cells before day 1
    for (let i = 0; i < firstDayOfWeek; i++) {
      const emptyCell = document.createElement('span')
      emptyCell.className = 'mac-calendar-cell'
      emptyCell.style.pointerEvents = 'none'
      calGrid.append(emptyCell)
    }

    // Days 1..daysInMonth
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateStr = `${popupBrowsingYear}-${String(popupBrowsingMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'mac-calendar-cell'
      btn.textContent = String(dayNum)
      btn.dataset.date = dateStr
      btn.setAttribute(
        'aria-label',
        new Intl.DateTimeFormat(i18n.global.locale.value, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }).format(parseDateKey(dateStr)),
      )
      btn.setAttribute('aria-selected', String(dateStr === latestModel.selectedDate))

      const isFuture = dateStr > todayKey
      const isSelected = dateStr === latestModel.selectedDate
      const isToday = dateStr === todayKey
      const playCount = recordDaysMap.get(dateStr) ?? 0

      if (isFuture || popupBrowsingYear < minYear) {
        btn.disabled = true
      }
      if (isSelected) {
        btn.classList.add('is-selected')
      }
      if (isToday) {
        btn.classList.add('is-today')
      }
      if (playCount > 0) {
        btn.classList.add('has-plays')
      }

      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        actions.onSelectDate(dateStr)
        closeDatePopup(true)
      })

      calGrid.append(btn)
    }
    if (focusedYear)
      yearMenu.querySelector<HTMLButtonElement>(`[data-year='${focusedYear}']`)?.focus()
    if (focusedDate)
      calGrid.querySelector<HTMLButtonElement>(`[data-date='${focusedDate}']`)?.focus()
  }

  calGrid.addEventListener(
    'keydown',
    (event) => {
      const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]
      if (!offset) return
      const date = (event.target as HTMLElement).dataset.date
      if (!date) return
      event.preventDefault()
      const next = parseDateKey(date)
      next.setDate(next.getDate() + offset)
      const nextKey = formatDateKey(next)
      const min = `${Math.min(...(latestModel?.years ?? [1970]))}-01-01`
      if (nextKey < min || nextKey > (latestModel?.todayKey ?? formatDateKey(new Date()))) return
      popupBrowsingYear = next.getFullYear()
      popupBrowsingMonth = next.getMonth()
      if (latestModel?.browsingYear !== popupBrowsingYear) actions.onBrowseYear(popupBrowsingYear)
      renderPopupCalendar()
      calGrid.querySelector<HTMLButtonElement>(`[data-date='${nextKey}']`)?.focus()
    },
    listenerOptions,
  )

  // 8. Update View with Model
  function update(model: MacViewModel): void {
    if (disposed) return
    const focusedId = (root.activeElement as HTMLElement | null)?.id
    const previousLocale = latestModel?.locale
    const previousDate = latestModel?.selectedDate
    latestModel = model
    refreshStaticLocale()
    macDevice.refreshLocale()
    controls.hidden = !model.items.length
    root.getElementById('projection-count')!.textContent = model.items.length
      ? uiText('archive.mac.albumCount', { count: model.items.length })
      : ''
    const todayKey = model.todayKey
    if (!model.years.includes(popupBrowsingYear)) {
      const validDate = parseDateKey(model.selectedDate ?? model.todayKey)
      popupBrowsingYear = model.browsingYear
      popupBrowsingMonth = validDate.getMonth()
    } else if (previousDate !== model.selectedDate && model.selectedDate) {
      // An explicit selection or range correction owns the popup's cursor.
      const date = parseDateKey(model.selectedDate)
      popupBrowsingYear = date.getFullYear()
      popupBrowsingMonth = date.getMonth()
    }

    // Update Date Trigger Text
    if (dateTrigger) {
      const span = dateTrigger.querySelector('span')
      const formattedDate = model.selectedDate
        ? new Intl.DateTimeFormat(i18n.global.locale.value, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }).format(parseDateKey(model.selectedDate))
        : ''
      if (span) {
        span.textContent =
          model.selectedDate === todayKey
            ? uiText('archive.mac.todayDate', { date: formattedDate })
            : formattedDate || uiText('archive.mac.chooseDateHint')
      }
    }

    // Update Day Prev / Next state
    if (model.selectedDate) {
      const minYear = model.years[model.years.length - 1] ?? 1970
      const minDateKey = `${minYear}-01-01`
      dayPrevBtn.disabled = model.selectedDate <= minDateKey
      dayNextBtn.disabled = model.selectedDate >= todayKey
    } else {
      dayPrevBtn.disabled = true
      dayNextBtn.disabled = true
    }

    // Update Album List
    disks.update(model.items, model.selectedAlbumKey, model.selectedDate)
    if (previousLocale !== model.locale) disks.refreshLocale()
    if (!model.items.length) albumListEl.replaceChildren()

    if (model.dayLoading && !model.items.length) {
      const loadingDiv = document.createElement('div')
      loadingDiv.className = 'album-empty-msg'
      loadingDiv.textContent = uiText('archive.mac.dayLoading')
      albumListEl.append(loadingDiv)
      screenStatusEl.textContent = uiText('archive.mac.loading')
    } else if (
      (model.dayError || (!model.selectedDate && model.calendarError)) &&
      !model.items.length
    ) {
      const errorDiv = document.createElement('div')
      errorDiv.className = 'album-empty-msg is-error'
      errorDiv.textContent = model.dayError ?? model.calendarError

      const retryBtn = document.createElement('button')
      retryBtn.type = 'button'
      retryBtn.className = 'mac-retry-button'
      retryBtn.id = 'day-retry'
      retryBtn.textContent = uiText('albums.status.retry')
      retryBtn.onclick = () => {
        if (model.selectedDate) actions.onRetryDay(model.selectedDate)
        else actions.onRetryCalendar()
      }
      errorDiv.append(retryBtn)
      albumListEl.append(errorDiv)
      screenStatusEl.textContent = uiText('archive.mac.failed')
    } else if (model.items.length === 0) {
      const emptyDiv = document.createElement('div')
      emptyDiv.className = 'album-empty-msg'
      emptyDiv.textContent = uiText('archive.mac.empty')
      albumListEl.append(emptyDiv)
      screenStatusEl.textContent = uiText('archive.mac.noRecords')
    } else {
      // Update Screen Status Bar
      screenStatusEl.textContent = model.dayError
        ? uiText('archive.mac.retained', { error: model.dayError })
        : ''
    }

    if (isPopupOpen) {
      renderPopupCalendar()
    }
    if (focusedId && !root.activeElement)
      root.getElementById(focusedId)?.focus({ preventScroll: true })
  }

  return {
    update,
    returnToIntro: () => macDevice.returnToIntro(),
    dispose: () => {
      disposed = true
      subscriptions.abort()
      stopVisibility()
      macDevice.dispose()
      disks.dispose()
    },
  }
}
