import type { MacViewActions, MacViewController, MacViewModel } from './macViewTypes'
import { mountMacDevice, type MacDeviceController } from './macDevice'
import { mountLoadTray } from './loadTray'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { formatArchiveMinutes } from '../utils/archiveDailyDetailState'

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
  const desktopReturnBtn = root.getElementById('desktop-return') as HTMLButtonElement
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
  const entryStatus = root.getElementById('crt-entry-status') as HTMLElement

  let latestModel: MacViewModel | null = null
  let disposed = false
  let isPopupOpen = false
  const subscriptions = new AbortController()
  const listenerOptions = { signal: subscriptions.signal }
  const yearMenu = root.getElementById('mac-calendar-years') as HTMLElement
  const calendarStatus = root.getElementById('mac-calendar-status') as HTMLElement

  // Calendar popup month navigation state (separated from selectedDate)
  let popupBrowsingYear = new Date().getFullYear()
  let popupBrowsingMonth = new Date().getMonth()

  const tray = mountLoadTray(
    root.querySelector<HTMLElement>('.floppy')!,
    createReducedMotionQuery(),
  )
  const macDevice: MacDeviceController = mountMacDevice(root, {
    onViewTransition: (active) => {
      if (active) tray.cancel()
    },
    onModeChange: (mode) => {
      if (mode === 'machine') {
        closeDatePopup()
      }
    },
    onEntrySelected: (id) => {
      if (id === 'album') {
        entryStatus.textContent = ''
      } else if (id === 'track') {
        entryStatus.textContent = '单曲统计尚未开放'
      } else if (id === 'year') {
        entryStatus.textContent = '年度总结尚未开放'
      }
    },
    onDatePopupEsc: () => {
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

  // 5. Desktop Return Button inside Album Window Title Bar
  desktopReturnBtn?.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      closeDatePopup()
      macDevice.setDesktopPage('desktop')
    },
    listenerOptions,
  )

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

  function renderPopupCalendar() {
    if (!latestModel) return
    const focusedDate = (root.activeElement as HTMLElement | null)?.dataset.date
    const todayKey = latestModel.todayKey
    calMonthLabel.textContent = `${popupBrowsingMonth + 1}月`

    const minYear = Math.min(...latestModel.years)
    calPrevMonthBtn.disabled = popupBrowsingYear <= minYear && popupBrowsingMonth === 0
    calNextMonthBtn.disabled =
      `${popupBrowsingYear}-${String(popupBrowsingMonth + 1).padStart(2, '0')}` >=
      todayKey.slice(0, 7)
    yearSelect.textContent = `${popupBrowsingYear}年`
    yearMenu.replaceChildren()
    latestModel.years.forEach((y) => {
      const opt = document.createElement('button')
      opt.type = 'button'
      opt.setAttribute('role', 'option')
      opt.setAttribute('aria-selected', String(y === popupBrowsingYear))
      opt.textContent = `${y}年`
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
      retry.textContent = '重试'
      retry.onclick = actions.onRetryCalendar
      calendarStatus.append(retry)
    } else
      calendarStatus.textContent = latestModel.calendarLoading
        ? '正在读取日期记录…'
        : '有圆点的日期包含播放记录'

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
      btn.setAttribute('aria-label', dateStr)
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
    const activeRow = root.activeElement as HTMLElement | null
    const focusedKey = activeRow?.closest<HTMLButtonElement>('.album-row')?.dataset.key
    const previousDate = latestModel?.selectedDate
    latestModel = model
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
      if (span) {
        span.textContent =
          model.selectedDate === todayKey
            ? `今日 ${model.selectedDate}`
            : (model.selectedDate ?? '请选择日期')
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
    albumListEl.replaceChildren()

    if (model.dayLoading && !model.items.length) {
      const loadingDiv = document.createElement('div')
      loadingDiv.className = 'album-empty-msg'
      loadingDiv.textContent = '正在读取当天专辑…'
      albumListEl.append(loadingDiv)
      screenStatusEl.textContent = '读取中…'
    } else if (
      (model.dayError || (!model.selectedDate && model.calendarError)) &&
      !model.items.length
    ) {
      const errorDiv = document.createElement('div')
      errorDiv.className = 'album-empty-msg'
      errorDiv.style.flexDirection = 'column'
      errorDiv.style.gap = '8px'
      errorDiv.textContent = model.dayError ?? model.calendarError

      const retryBtn = document.createElement('button')
      retryBtn.type = 'button'
      retryBtn.textContent = '重试'
      retryBtn.style.padding = '2px 8px'
      retryBtn.style.border = '1px solid #000'
      retryBtn.style.background = '#fff'
      retryBtn.style.cursor = 'pointer'
      retryBtn.onclick = () => {
        if (model.selectedDate) actions.onRetryDay(model.selectedDate)
        else actions.onRetryCalendar()
      }
      errorDiv.append(retryBtn)
      albumListEl.append(errorDiv)
      screenStatusEl.textContent = '读取失败'
    } else if (model.items.length === 0) {
      const emptyDiv = document.createElement('div')
      emptyDiv.className = 'album-empty-msg'
      emptyDiv.textContent = '当天没有专辑播放记录'
      albumListEl.append(emptyDiv)
      screenStatusEl.textContent = '无记录'
    } else {
      model.items.forEach((item, index) => {
        const row = document.createElement('button')
        row.className = 'album-row'
        row.type = 'button'
        row.dataset.key = item.key
        row.title = `${item.title || '未知专辑'} — ${item.artist || '未知艺术家'}`
        const isSelected = item.key === model.selectedAlbumKey
        row.setAttribute('aria-pressed', String(isSelected))
        row.setAttribute(
          'aria-label',
          `${index + 1} ${item.title || '未知专辑'}，${item.artist || '未知艺术家'}，${item.playCount}次`,
        )

        const rankSpan = document.createElement('span')
        rankSpan.className = 'rank'
        rankSpan.textContent = String(index + 1).padStart(2, '0')

        const nameSpan = document.createElement('span')
        nameSpan.className = 'row-name'
        nameSpan.textContent = item.title || '未知专辑'

        const countSpan = document.createElement('span')
        countSpan.className = 'count'
        countSpan.textContent = String(item.playCount)

        row.append(rankSpan, nameSpan, countSpan)
        row.onclick = () => {
          actions.onSelectAlbum(item.key)
        }
        albumListEl.append(row)
      })

      // Update Screen Status Bar
      const selectedItem =
        model.items.find((it) => it.key === model.selectedAlbumKey) || model.items[0]
      if (selectedItem) {
        const mins = formatArchiveMinutes(selectedItem.durationSeconds)
        screenStatusEl.textContent = model.dayError
          ? `${model.dayError} · 保留上次记录`
          : `${selectedItem.artist || '未知艺术家'} / ${selectedItem.playCount} 次 / ${mins}`
      }
    }

    if (focusedKey)
      Array.from(albumListEl.querySelectorAll<HTMLButtonElement>('.album-row'))
        .find((row) => row.dataset.key === focusedKey)
        ?.focus()

    if (isPopupOpen) {
      renderPopupCalendar()
    }
  }

  return {
    update,
    dispose: () => {
      disposed = true
      subscriptions.abort()
      macDevice.dispose()
      tray.dispose()
    },
  }
}
