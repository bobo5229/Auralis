import { describe, expect, it } from 'vitest'
import {
  cleanDelimitedValues,
  canonicalizeDelimitedValues,
  formatDelimitedParts,
  formatDelimitedValues,
  joinDelimitedValues,
  normalizeDelimitedValue,
  splitDelimitedValues,
} from './delimitedValues'

describe('delimitedValues', () => {
  describe('canonicalizeDelimitedValues', () => {
    it('cleans and deduplicates values without interpreting literal punctuation', () => {
      expect(canonicalizeDelimitedValues(' Pop;  ; pop; R&B/Soul; Hip-Hop/Rap ')).toBe(
        'Pop; R&B/Soul; Hip-Hop/Rap',
      )
      expect(canonicalizeDelimitedValues('Tyler, The Creator; AC/DC')).toBe(
        'Tyler, The Creator; AC/DC',
      )
      expect(canonicalizeDelimitedValues('A;B')).toBe('A;B')
      expect(canonicalizeDelimitedValues(' ; ')).toBeNull()
    })
  })
  describe('splitDelimitedValues', () => {
    it('splits on half-width semicolon followed by space', () => {
      expect(splitDelimitedValues('Jazz; Soul; Funk')).toEqual(['Jazz', 'Soul', 'Funk'])
    })

    it.each(['A;B', 'A；B', 'A;\tB', 'A;\nB', 'A;\u00a0B', 'A & B'])(
      'keeps %s as one value',
      (value) => {
        expect(splitDelimitedValues(value)).toEqual([value])
      },
    )

    it('trims labels and removes empty parts after splitting', () => {
      expect(splitDelimitedValues('  A;  ; B  ')).toEqual(['A', 'B'])
    })

    it('returns empty array for falsy or empty input', () => {
      expect(splitDelimitedValues(null)).toEqual([])
      expect(splitDelimitedValues(undefined)).toEqual([])
      expect(splitDelimitedValues('')).toEqual([])
      expect(splitDelimitedValues('   ')).toEqual([])
    })

    it('preserves literal commas and slashes without splitting', () => {
      expect(splitDelimitedValues('Tyler, The Creator')).toEqual(['Tyler, The Creator'])
      expect(splitDelimitedValues('R&B/SOUL; Hip-hop/Rap')).toEqual(['R&B/SOUL', 'Hip-hop/Rap'])
      expect(splitDelimitedValues('AC/DC')).toEqual(['AC/DC'])
    })
  })

  describe('joinDelimitedValues', () => {
    it('joins non-empty values with standard "; "', () => {
      expect(joinDelimitedValues(['Cantopop', 'Live'])).toBe('Cantopop; Live')
      expect(joinDelimitedValues(['Pop'])).toBe('Pop')
    })

    it('filters out empty, null, undefined or whitespace-only items', () => {
      expect(joinDelimitedValues(['Pop', null, '  ', undefined, 'Rock'])).toBe('Pop; Rock')
    })

    it('returns null when no valid values exist', () => {
      expect(joinDelimitedValues([])).toBeNull()
      expect(joinDelimitedValues([null, undefined, '  '])).toBeNull()
    })
  })

  describe('cleanDelimitedValues', () => {
    it('flattens multiple candidates and splits only on "; "', () => {
      expect(cleanDelimitedValues(['Cantopop; Live'])).toEqual(['Cantopop', 'Live'])
      expect(cleanDelimitedValues(['Cantopop;Live'])).toEqual(['Cantopop;Live'])
      expect(cleanDelimitedValues(['Cantopop', 'Live'])).toEqual(['Cantopop', 'Live'])
    })

    it('keeps literal separators atomic while deduplicating native entries', () => {
      expect(cleanDelimitedValues([' A;B; C ', 'a;b', 'c', 'A；B', 'A;\tB'])).toEqual([
        'A;B',
        'C',
        'A；B',
        'A;\tB',
      ])
    })

    it('preserves literal commas and slashes', () => {
      expect(cleanDelimitedValues(['Tyler, The Creator', 'Earth, Wind & Fire'])).toEqual([
        'Tyler, The Creator',
        'Earth, Wind & Fire',
      ])
      expect(cleanDelimitedValues(['R&B/Soul; Hip-Hop/Rap'])).toEqual(['R&B/Soul', 'Hip-Hop/Rap'])
    })

    it('deduplicates case-insensitively while preserving first-seen casing', () => {
      expect(cleanDelimitedValues(['Pop', 'pop', 'POP', 'Rock'])).toEqual(['Pop', 'Rock'])
    })

    it('ignores null, undefined and blank values', () => {
      expect(cleanDelimitedValues([null, '  ', undefined, 'Jazz', ''])).toEqual(['Jazz'])
    })
  })

  describe('formatDelimitedParts and formatDelimitedValues', () => {
    it('formats 1 value as-is', () => {
      expect(formatDelimitedParts(['Jazz'])).toBe('Jazz')
      expect(formatDelimitedValues('Jazz')).toBe('Jazz')
    })

    it('formats 2 values with " & "', () => {
      expect(formatDelimitedParts(['Jazz', 'Soul'])).toBe('Jazz & Soul')
      expect(formatDelimitedValues('Jazz; Soul')).toBe('Jazz & Soul')
    })

    it('formats 3+ values with Oxford commas and " & "', () => {
      expect(formatDelimitedParts(['Jazz', 'Soul', 'Funk'])).toBe('Jazz, Soul & Funk')
      expect(formatDelimitedValues('Jazz; Soul; Funk')).toBe('Jazz, Soul & Funk')
    })

    it('returns empty string for empty inputs', () => {
      expect(formatDelimitedParts([])).toBe('')
      expect(formatDelimitedValues('')).toBe('')
      expect(formatDelimitedValues(null)).toBe('')
    })
  })

  describe('normalizeDelimitedValue', () => {
    it('trims and lowercases the value', () => {
      expect(normalizeDelimitedValue('  Rock  ')).toBe('rock')
    })
  })
})
