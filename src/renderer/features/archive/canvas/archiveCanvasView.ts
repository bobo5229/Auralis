import type { DailyListeningDetail, ListeningRankingItem } from '@shared/types/archive'
import type { CalendarDay } from '../composables/useArchiveCalendar'
import { formatArchiveMinutes } from '../utils/archiveDailyDetailState'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatArtist } from '@renderer/features/library/utils/formatArtist'
import { mountArchiveStage } from './archiveStage.js'
import { mountDecodedCover } from './decodedCover'

export interface CanvasCalendarModel {
  year: number
  days: CalendarDay[]
  months: { label: string; column: number }[]
  selectedDate: string | null
  loading: boolean
  error: string | null
}
export interface CanvasDayModel {
  date: string | null
  loading: boolean
  detail: DailyListeningDetail | null
  albums: ListeningRankingItem[]
  detailError: string | null
  albumsError: string | null
}

export function mountArchiveCanvasView(
  root: ShadowRoot,
  actions: { selectDate(date: string): void; retryCalendar(): void; retryDay(): void },
) {
  const element = <T extends HTMLElement = HTMLElement>(id: string) => root.getElementById(id) as T
  const stage = mountArchiveStage(root)
  const grid = element('grid')
  const coords = element('matrix-coords')
  let selectedLabel = '请选择日期'
  let stageKey = ''
  const coverAnimations: (() => void)[] = []
  function clearCoverAnimations(): void {
    coverAnimations.splice(0).forEach((dispose) => dispose())
  }

  function message(container: HTMLElement, text: string, retry?: () => void): void {
    container.classList.toggle('is-warning', Boolean(retry))
    container.replaceChildren(document.createTextNode(text))
    if (retry) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn'
      button.textContent = '重试'
      button.addEventListener('click', retry)
      container.append(button)
    }
  }

  function updateCalendar(model: CanvasCalendarModel): void {
    const focusedDate = (root.activeElement as HTMLElement | null)?.dataset.date
    const status = element('calendar-status')
    status.hidden = !model.loading && !model.error
    message(
      status,
      model.loading ? '正在读取听歌记录…' : (model.error ?? ''),
      model.error && !model.loading ? actions.retryCalendar : undefined,
    )
    grid.hidden = model.loading || !!model.error
    const months = element('calendar-months')
    months.hidden = grid.hidden
    months.replaceChildren()
    grid.replaceChildren()
    element('matrix-year').textContent = `${model.year}`
    const selected = model.days.find((day) => day.date === model.selectedDate)
    const describe = (day: CalendarDay) =>
      `${day.date} · ${day.playCount} 次 · ${formatArchiveMinutes(day.durationSeconds)}`
    selectedLabel = selected ? describe(selected) : '本年暂无听歌记录'
    coords.textContent = model.loading ? '正在读取…' : model.error ? '读取失败' : selectedLabel
    const elapsed = model.days.filter((day) => !day.isFuture)
    const valid = !model.loading && !model.error
    element('metric-plays').textContent = valid
      ? String(elapsed.reduce((sum, day) => sum + day.playCount, 0))
      : '—'
    element('metric-days').textContent = valid
      ? `${elapsed.filter((day) => day.playCount > 0).length} 天`
      : '—'
    element('metric-duration').textContent = valid
      ? formatArchiveMinutes(elapsed.reduce((sum, day) => sum + day.durationSeconds, 0))
      : '—'
    if (!valid) return
    const columns = Math.ceil(model.days.length / 7)
    grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`
    months.style.gridTemplateColumns = grid.style.gridTemplateColumns
    grid.setAttribute('aria-label', `${model.year} 年听歌日历，按播放次数分级`)
    model.months.forEach((month) => {
      const marker = document.createElement('span')
      marker.textContent = month.label
      marker.style.gridColumn = String(month.column)
      months.append(marker)
    })
    const tabDate = focusedDate ?? model.selectedDate ?? model.days[0]?.date
    const cells = model.days.map((day, index) => {
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = `pixel lvl-${day.level}`
      cell.classList.toggle('locked', day.date === model.selectedDate)
      cell.dataset.date = day.date
      cell.disabled = day.isFuture
      cell.tabIndex = day.date === tabDate ? 0 : -1
      cell.title = day.isFuture ? `${day.date} · 未来日期` : describe(day)
      cell.setAttribute('aria-label', cell.title)
      cell.setAttribute('aria-pressed', String(day.date === model.selectedDate))
      cell.addEventListener('mouseenter', () => {
        coords.textContent = cell.title
      })
      cell.addEventListener('mouseleave', () => {
        coords.textContent = selectedLabel
      })
      cell.addEventListener('focus', () => {
        cells.forEach((other) => {
          other.tabIndex = other === cell ? 0 : -1
        })
        coords.textContent = cell.title
      })
      cell.addEventListener('blur', () => {
        coords.textContent = selectedLabel
      })
      cell.addEventListener('click', () => actions.selectDate(day.date))
      cell.addEventListener('keydown', (event) => {
        const offsets: Record<string, number> = {
          ArrowRight: 7,
          ArrowLeft: -7,
          ArrowDown: 1,
          ArrowUp: -1,
        }
        const offset = offsets[event.key]
        if (offset === undefined) return
        event.preventDefault()
        if ((offset === 1 && index % 7 === 6) || (offset === -1 && index % 7 === 0)) return
        const target = cells[index + offset]
        if (target && !target.disabled) target.focus()
      })
      grid.append(cell)
      return cell
    })
    if (focusedDate)
      cells.find((cell) => cell.dataset.date === focusedDate)?.focus({ preventScroll: true })
  }

  function updateDay(model: CanvasDayModel): void {
    clearCoverAnimations()
    const inspector = element('inspector-content')
    element('inspector-title').textContent = model.date ?? '请选择日期'
    inspector.replaceChildren()
    inspector.scrollTop = 0
    inspector.setAttribute('aria-busy', String(model.loading))
    if (model.loading || model.detailError || !model.detail?.tracks.length) {
      const state = document.createElement('div')
      state.className = 'standby-text'
      const text = model.loading
        ? '正在读取当天歌曲…'
        : (model.detailError ??
          (!model.date
            ? '请选择一个日期'
            : model.detail?.totalPlayCount
              ? '当天有听歌记录，但歌曲资料已不可用'
              : '当天暂无听歌记录'))
      message(state, text, model.detailError ? actions.retryDay : undefined)
      inspector.append(state)
    } else {
      model.detail.tracks.forEach((track, index) => {
        const row = document.createElement('div')
        row.className = 'track-item'
        const cover = document.createElement('div')
        cover.className = 'cover-container'
        const fallback = document.createElement('span')
        fallback.className = 'cover-fallback'
        fallback.textContent = '无封面'
        cover.append(fallback)
        const artwork = getArtworkUrl(track.artworkCacheKey)
        if (artwork) {
          coverAnimations.push(mountDecodedCover(cover, artwork, index * 120))
        }
        const info = document.createElement('div')
        info.className = 'track-info'
        for (const [className, text] of [
          ['track-name', track.title || '未知歌曲'],
          ['track-artist', formatArtist(track.artist) || '未知艺术家'],
          ['track-plays', `${track.playCount} 次 · ${formatArchiveMinutes(track.durationSeconds)}`],
        ]) {
          const line = document.createElement('div')
          line.className = className
          line.textContent = text
          line.title = text
          info.append(line)
        }
        row.append(cover, info)
        inspector.append(row)
      })
    }
    const status = element('stage-status')
    const hasAlbums = !model.loading && !model.albumsError && model.albums.length > 0
    status.hidden = hasAlbums
    message(
      status,
      model.loading
        ? '正在读取当天专辑…'
        : (model.albumsError ?? (model.date ? '当天暂无专辑记录' : '选择日期，查看当天常听专辑')),
      model.albumsError ? actions.retryDay : undefined,
    )
    element('album-stage').hidden = !hasAlbums
    element('stage-caption').hidden = !hasAlbums
    root.querySelector<HTMLElement>('.stage-controls')!.hidden = !hasAlbums
    element('stage-hint').hidden = !hasAlbums
    const key = JSON.stringify([model.date, model.loading, model.albumsError, model.albums])
    if (key !== stageKey) {
      stageKey = key
      stage.setAlbums(
        hasAlbums
          ? model.albums.map((album) => ({
              title: album.title || '未知专辑',
              artist: formatArtist(album.artist) || '未知艺术家',
              artworkUrl: getArtworkUrl(album.artworkCacheKey),
              playCount: album.playCount,
              durationSeconds: album.durationSeconds,
            }))
          : [],
      )
    }
  }

  return {
    updateCalendar,
    updateDay,
    dispose: () => {
      clearCoverAnimations()
      stage.dispose()
      root.replaceChildren()
    },
  }
}
