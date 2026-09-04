export interface EditorialLinerNotesData {
  year: number
  activeDays: number
  totalDaysInYear: number
  totalPlays: number
  totalDurationSeconds: number
  peakDayDate?: string | null
  peakDayPlays?: number
  isPending?: boolean
}

export function computeArchiveChecksum(year: number, plays: number, days: number): string {
  const seed = (year * 397) ^ (plays * 17) ^ (days * 31)
  const hex = Math.abs(seed).toString(16).toUpperCase().padStart(8, '0')
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`
}

export function formatReceiptActiveDays(activeDays: number): string {
  return String(Math.max(0, activeDays)).padStart(3, '0') + ' D'
}

export function formatReceiptPlays(totalPlays: number): string {
  return String(Math.max(0, totalPlays)).padStart(3, '0') + ' T'
}

export function formatReceiptDailyAverage(activeDays: number, totalPlays: number): string {
  if (activeDays <= 0 || totalPlays <= 0) return '000.0'
  return (totalPlays / activeDays).toFixed(1).padStart(5, '0')
}

export function formatReceiptPeakLog(peakDayDate?: string | null, peakDayPlays?: number): string {
  if (!peakDayDate) return '[--.--] 00'
  const parts = peakDayDate.split('-')
  if (parts.length < 3) return '[--.--] 00'
  const month = parts[1].padStart(2, '0')
  const day = parts[2].padStart(2, '0')
  const plays = String(Math.max(0, peakDayPlays ?? 0)).padStart(2, '0')
  return `[${month}.${day}] ${plays}`
}

export function formatLinerDuration(totalDurationSeconds: number): {
  hours: number
  minutesFormatted: string
  rawMinutes: number
} {
  const rawMinutes = Math.round(Math.max(0, totalDurationSeconds) / 60)
  return {
    hours: Math.floor(Math.max(0, totalDurationSeconds) / 3600),
    minutesFormatted: rawMinutes.toLocaleString('en-US'),
    rawMinutes,
  }
}

export function formatPeakDateNarrative(peakDayDate?: string | null, isEnglish = false): string {
  if (!peakDayDate) return isEnglish ? 'N/A' : '—'
  const parts = peakDayDate.split('-')
  if (parts.length < 3) return isEnglish ? 'N/A' : '—'
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (Number.isNaN(month) || Number.isNaN(day)) return isEnglish ? 'N/A' : '—'
  if (isEnglish) {
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]
    return `${monthNames[month - 1] ?? month} ${day}`
  }
  return `${month}月${day}日`
}
