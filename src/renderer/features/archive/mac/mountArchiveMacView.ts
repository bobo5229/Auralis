import type { MacViewActions, MacViewController, MacViewModel } from './macViewTypes'
import { mountNightSky, type NightSkyController } from './nightSky'
import { mountMacDevice, type MacDeviceController } from './macDevice'
import { mountArchiveStage, type ArchiveStageController } from './macStage'
import { formatArchiveMinutes } from '../utils/archiveDailyDetailState'
import { mountCoverInteraction } from './coverInteraction'

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
  const skyCanvas = root.getElementById('sky') as HTMLCanvasElement
  const stageHost = root.getElementById('stage') as HTMLElement
  const cableSvg = root.getElementById('cable') as unknown as SVGElement
  const feedbackEl = root.getElementById('feedback') as HTMLElement
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
  const sceneEl = root.getElementById('scene') as HTMLElement
  const entryStatus = root.getElementById('crt-entry-status') as HTMLElement

  let latestModel: MacViewModel | null = null
  let disposed = false
  let cableRaf = 0
  let isPopupOpen = false
  let applyingModel = false
  let stageSignature = ''
  let stageCovers: (HTMLCanvasElement | null)[] = []
  let stageDate: string | null = null
  const subscriptions = new AbortController()
  const listenerOptions = { signal: subscriptions.signal }
  const yearMenu = root.getElementById('mac-calendar-years') as HTMLElement
  const calendarStatus = root.getElementById('mac-calendar-status') as HTMLElement

  // Calendar popup month navigation state (separated from selectedDate)
  let popupBrowsingYear = new Date().getFullYear()
  let popupBrowsingMonth = new Date().getMonth()

  // 1. Cable Layout
  function cableLayout() {
    if (!cableSvg || !sceneEl || disposed) return
    const jack = root.querySelector('.jack') as HTMLElement | null
    const stageContainer = root.querySelector('.stage-container') as HTMLElement | null
    if (!jack || !stageContainer) return

    const base = sceneEl.getBoundingClientRect()
    const jRect = jack.getBoundingClientRect()
    const tRect = stageContainer.getBoundingClientRect()

    const x1 = jRect.left + jRect.width / 2 - base.left
    const y1 = jRect.top + jRect.height / 2 - base.top
    const x2 = tRect.left + tRect.width * 0.18 - base.left
    const y2 = tRect.top + tRect.height * 0.77 - base.top

    const sag = Math.min(base.height - 8, Math.max(y1, y2) + 100)
    const d = `M${x1} ${y1} C${x1 + 100} ${sag},${x2 - 90} ${sag},${x2} ${y2}`
    cableSvg.querySelectorAll('path').forEach((p) => p.setAttribute('d', d))
  }

  function transmitSignal() {
    const signalPath = cableSvg?.querySelector('.signal')
    if (!signalPath) return
    signalPath.classList.remove('sending')
    // Trigger reflow
    void signalPath.getBoundingClientRect()
    signalPath.classList.add('sending')
  }

  // 2. Mount Night Sky
  const nightSky: NightSkyController = mountNightSky(skyCanvas)

  // 3. Mount Mac Device
  const macDevice: MacDeviceController = mountMacDevice(root, {
    onGeometryChange: () => cableLayout(),
    onViewTransition: (active) => {
      if (active) coverInteraction?.cancel()
      cancelAnimationFrame(cableRaf)
      cableRaf = 0
      nightSky.pause(active)
      if (!active) cableLayout()
    },
    onModeChange: (mode) => {
      if (mode === 'machine') {
        closeDatePopup()
      }
    },
    onEntrySelected: (id) => {
      if (id === 'album') {
        entryStatus.textContent = ''
        feedback('已打开专辑统计，日期与舞台保持联动')
      } else if (id === 'track') {
        entryStatus.textContent = '单曲统计尚未开放'
        feedback('已选中单曲入口，尚未开放')
      } else if (id === 'year') {
        entryStatus.textContent = '年度总结尚未开放'
        feedback('已选中年度总结入口，尚未开放')
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
    onCancelGesture: () => coverInteraction?.cancel() ?? false,
  })

  // 4. Mount Stage
  const stageRoot = {
    host: stageHost,
    coverDragging: false,
    getElementById: <T extends HTMLElement = HTMLElement>(id: string) =>
      root.getElementById(id) as T | null,
    querySelector: <T extends Element = Element>(s: string) => root.querySelector(s) as T | null,
    onGeometry: () => cableLayout(),
    onSelection: (index: number) => {
      if (applyingModel || !latestModel || !latestModel.items[index]) return
      const key = latestModel.items[index].key
      if (key !== latestModel.selectedAlbumKey) {
        actions.onSelectAlbum(key)
        transmitSignal()
      }
    },
  }
  const stage: ArchiveStageController = mountArchiveStage(stageRoot)
  const coverInteraction = mountCoverInteraction(
    root,
    stage,
    macDevice,
    feedback,
    actions.onRequestInsert,
  )

  function feedback(text: string) {
    if (feedbackEl) feedbackEl.textContent = text
  }

  // 5. Desktop Return Button inside Album Window Title Bar
  desktopReturnBtn?.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      closeDatePopup()
      macDevice.setDesktopPage('desktop')
      feedback('返回桌面入口')
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
    coverInteraction?.update(model)
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
          transmitSignal()
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

    // Sync Stage Albums
    const stageItems = model.items.map((item) => ({
      id: item.key,
      title: item.title || '未知专辑',
      artist: item.artist || '未知艺术家',
      playCount: item.playCount,
      minutes: Math.round(item.durationSeconds / 60),
      artworkUrl: null,
      coverCanvas: model.covers?.get(item.key) ?? null,
    }))
    const signature = JSON.stringify([model.selectedDate, model.items])
    const covers = stageItems.map((item) => item.coverCanvas)
    applyingModel = true
    if (stageDate !== model.selectedDate) {
      stage.setAlbums([])
      stageSignature = ''
      stageCovers = []
      stageDate = model.selectedDate
    }
    if (signature !== stageSignature || covers.some((cover, i) => cover !== stageCovers[i])) {
      stage.setAlbums(stageItems)
      stageSignature = signature
      stageCovers = covers
    }

    // Sync selection on stage
    if (model.selectedAlbumKey) {
      const idx = model.items.findIndex((it) => it.key === model.selectedAlbumKey)
      if (idx >= 0) {
        stage.select(idx)
      }
    }
    applyingModel = false
    if (focusedKey)
      Array.from(albumListEl.querySelectorAll<HTMLButtonElement>('.album-row'))
        .find((row) => row.dataset.key === focusedKey)
        ?.focus()

    // Update feedback
    if (
      model.items.length > 0 &&
      sceneEl.dataset.inserting !== 'true' &&
      sceneEl.dataset.coverDragging !== 'true'
    ) {
      const selected = model.items.find((item) => item.key === model.selectedAlbumKey)
      feedback(
        selected && (!selected.canPlay || !selected.albumKey)
          ? '该专辑当前没有可播放曲目，无法装入'
          : `${model.selectedDate ?? ''} · Top ${model.items.length} · 长按封面拖入槽口，或选择后按“装入”`,
      )
    } else if (!model.items.length && !model.dayLoading && !model.dayError) {
      feedback(`${model.selectedDate ?? ''} · 当天没有专辑播放记录`)
    }
    if (model.playbackMessage && sceneEl.dataset.coverDragging !== 'true') {
      // Querying and actual playback state survive unrelated calendar/cover updates.
      if (sceneEl.dataset.inserting !== 'true' || model.playbackMessage.startsWith('正在读取专辑'))
        feedback(model.playbackMessage)
    }

    if (isPopupOpen) {
      renderPopupCalendar()
    }
  }

  // Initial cable layout and observation
  cableLayout()
  const resizeObserver = new ResizeObserver(() => {
    cableLayout()
  })
  resizeObserver.observe(sceneEl)
  resizeObserver.observe(stageHost)

  return {
    update,
    dispose: () => {
      disposed = true
      subscriptions.abort()
      cancelAnimationFrame(cableRaf)
      resizeObserver.disconnect()
      coverInteraction?.dispose()
      nightSky.dispose()
      macDevice.dispose()
      stage.dispose()
    },
  }
}
