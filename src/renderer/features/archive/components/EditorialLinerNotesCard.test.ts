import { describe, expect, it } from 'vitest'
import {
  computeArchiveChecksum,
  formatLinerDuration,
  formatPeakDateNarrative,
  formatReceiptActiveDays,
  formatReceiptDailyAverage,
  formatReceiptPeakLog,
  formatReceiptPlays,
} from '../utils/editorialLinerNotes'

describe('EditorialLinerNotesCard pure helpers', () => {
  describe('computeArchiveChecksum', () => {
    it('is deterministic for the same inputs', () => {
      const hash1 = computeArchiveChecksum(2026, 594, 28)
      const hash2 = computeArchiveChecksum(2026, 594, 28)
      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/)
    })

    it('produces different hashes for different statistics', () => {
      const hash1 = computeArchiveChecksum(2026, 594, 28)
      const hash2 = computeArchiveChecksum(2026, 595, 28)
      const hash3 = computeArchiveChecksum(2025, 594, 28)
      expect(hash1).not.toBe(hash2)
      expect(hash1).not.toBe(hash3)
    })
  })

  describe('Receipt voucher formatting and zero-padding', () => {
    it('formats active days with 3-digit zero-padding and suffix', () => {
      expect(formatReceiptActiveDays(28)).toBe('028 D')
      expect(formatReceiptActiveDays(0)).toBe('000 D')
      expect(formatReceiptActiveDays(180)).toBe('180 D')
      expect(formatReceiptActiveDays(-5)).toBe('000 D')
    })

    it('formats total plays with 3-digit zero-padding and suffix', () => {
      expect(formatReceiptPlays(594)).toBe('594 T')
      expect(formatReceiptPlays(9)).toBe('009 T')
      expect(formatReceiptPlays(0)).toBe('000 T')
    })

    it('formats daily average to 1 decimal place with 5-character padding', () => {
      expect(formatReceiptDailyAverage(28, 594)).toBe('021.2')
      expect(formatReceiptDailyAverage(10, 816)).toBe('081.6')
      expect(formatReceiptDailyAverage(0, 0)).toBe('000.0')
      expect(formatReceiptDailyAverage(0, 100)).toBe('000.0')
    })

    it('formats peak log date and plays with fixed width brackets', () => {
      expect(formatReceiptPeakLog('2026-07-13', 81)).toBe('[07.13] 81')
      expect(formatReceiptPeakLog('2026-01-05', 7)).toBe('[01.05] 07')
      expect(formatReceiptPeakLog(null, 0)).toBe('[--.--] 00')
      expect(formatReceiptPeakLog(undefined)).toBe('[--.--] 00')
      expect(formatReceiptPeakLog('invalid-date')).toBe('[--.--] 00')
    })
  })

  describe('Duration and narrative formatting', () => {
    it('formats hours, raw minutes and comma-separated minutes', () => {
      const result = formatLinerDuration(2286 * 60)
      expect(result.hours).toBe(38)
      expect(result.rawMinutes).toBe(2286)
      expect(result.minutesFormatted).toBe('2,286')
    })

    it('handles 0 duration', () => {
      const result = formatLinerDuration(0)
      expect(result.hours).toBe(0)
      expect(result.rawMinutes).toBe(0)
      expect(result.minutesFormatted).toBe('0')
    })

    it('formats peak date narrative for Chinese and English', () => {
      expect(formatPeakDateNarrative('2026-07-13', false)).toBe('7月13日')
      expect(formatPeakDateNarrative('2026-07-13', true)).toBe('Jul 13')
      expect(formatPeakDateNarrative('2026-12-01', true)).toBe('Dec 1')
      expect(formatPeakDateNarrative(null, false)).toBe('—')
      expect(formatPeakDateNarrative(null, true)).toBe('N/A')
    })
  })
})
