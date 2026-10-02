import type { DailyAlbumStatsItem } from '@shared/types/archive'
import type { CalendarDay } from '../composables/useArchiveCalendar'

export interface MacViewModel {
  selectedYear: number
  browsingYear: number
  todayKey: string
  selectedDate: string | null
  years: number[]
  calendarDays: CalendarDay[]
  calendarLoading: boolean
  calendarError: string | null
  dayLoading: boolean
  dayError: string | null
  items: DailyAlbumStatsItem[]
  selectedAlbumKey: string | null
}

export interface MacViewActions {
  onSelectYear(year: number): void
  onBrowseYear(year: number): void
  onSelectDate(date: string): void
  onSelectAlbum(key: string): void
  onRetryCalendar(): void
  onRetryDay(date: string): void
}

export interface MacViewController {
  update(model: MacViewModel): void
  dispose(): void
}
