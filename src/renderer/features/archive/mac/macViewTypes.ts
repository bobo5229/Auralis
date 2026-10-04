import type { DailyAlbumStatsItem } from '@shared/types/archive'
import type { UiLocale } from '@shared/uiLocale'
import type { CalendarDay } from '../composables/useArchiveCalendar'

export interface MacViewModel {
  locale?: UiLocale
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
  onSceneReadyChange(ready: boolean): void
  onSelectYear(year: number): void
  onBrowseYear(year: number): void
  onSelectDate(date: string): void
  onSelectAlbum(key: string): void
  onRetryCalendar(): void
  onRetryDay(date: string): void
}

export interface MacViewController {
  update(model: MacViewModel): void
  returnToIntro(): void
  dispose(): void
}
