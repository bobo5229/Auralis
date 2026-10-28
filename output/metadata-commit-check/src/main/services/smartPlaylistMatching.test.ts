import { describe, expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { SmartPlaylistRule } from '@shared/types/smartPlaylist'
import * as delimitedValues from '@shared/utils/delimitedValues'
import { compileRule } from './smartPlaylistMatching'

function track(values: Partial<TrackListItem>): TrackListItem {
  return { genre: null, artist: null, albumArtist: null, ...values } as TrackListItem
}

describe('compiled smart playlist matching', () => {
  it('preserves multivalue delimiters, normalized values, nested relations and empty fields', () => {
    const matches = compileRule({
      expression: {
        type: 'and',
        operands: [
          {
            type: 'or',
            operands: [
              { type: 'predicate', field: 'genre', operator: 'has', value: ' r&B/SOUL ' },
              { type: 'predicate', field: 'genre', operator: 'isEmpty' },
            ],
          },
          { type: 'predicate', field: 'artist', operator: 'has', value: 'ac/DC' },
          { type: 'predicate', field: 'albumArtist', operator: 'isEmpty' },
        ],
      },
    })
    expect(matches(track({ genre: 'Pop; R&B/Soul', artist: 'AC/DC' }))).toBe(true)
    expect(matches(track({ genre: '  ; ', artist: 'AC/DC' }))).toBe(true)
    expect(matches(track({ genre: 'Pop;R&B/Soul', artist: 'AC/DC' }))).toBe(false)
    expect(matches(track({ genre: 'R&B/Soul', artist: 'AC/DC', albumArtist: 'Other' }))).toBe(false)
    expect(matches(track({ genre: 'R&B/Soul', artist: 'AC' }))).toBe(false)
  })

  it('shares parsed fields through nested predicates within one track and refreshes the next evaluation', () => {
    const rule: SmartPlaylistRule = {
      expression: {
        type: 'and',
        operands: [
          { type: 'predicate', field: 'genre', operator: 'has', value: 'rock' },
          {
            type: 'or',
            operands: [
              { type: 'predicate', field: 'genre', operator: 'has', value: 'pop' },
              { type: 'predicate', field: 'artist', operator: 'isEmpty' },
            ],
          },
        ],
      },
    }
    const matches = compileRule(rule)
    const item = track({ genre: 'Rock; Pop' })
    const split = vi.spyOn(delimitedValues, 'splitDelimitedValues')
    try {
      expect(matches(item)).toBe(true)
      expect(split).toHaveBeenCalledTimes(1)
      item.genre = 'Jazz'
      expect(matches(item)).toBe(false)
      expect(split).toHaveBeenCalledTimes(2)
    } finally {
      split.mockRestore()
    }
  })

  it('retains legacy albumArtist fallback while expression albumArtist stays literal', () => {
    const legacy = compileRule({
      conditions: [
        { field: 'genre', value: null },
        { field: 'albumArtist', value: 'Artist' },
      ],
    })
    const explicit = compileRule({
      expression: {
        type: 'predicate',
        field: 'albumArtist',
        operator: 'has',
        value: 'Artist',
      },
    })
    expect(legacy(track({ artist: 'ARTIST' }))).toBe(true)
    expect(legacy(track({ artist: 'ARTIST', albumArtist: 'Other' }))).toBe(false)
    expect(explicit(track({ artist: 'ARTIST' }))).toBe(false)
  })

  it('resolves relative dates for each batch and preserves inclusive boundaries and invalid dates', () => {
    const now = Date.UTC(2026, 9, 20)
    const rule: SmartPlaylistRule = {
      expression: {
        type: 'predicate',
        field: 'added',
        operator: 'addedWithin',
        value: '1 days ago',
      },
    }
    const item = track({ createdAt: '2026-10-19 00:00:00' })
    expect(compileRule(rule, now)(item)).toBe(true)
    expect(compileRule(rule, now + 1)(item)).toBe(false)
    expect(compileRule(rule, now)(track({ createdAt: 'invalid' }))).toBe(false)
    expect(
      compileRule(
        {
          expression: {
            type: 'predicate',
            field: 'added',
            operator: 'addedBefore',
            value: '1 days ago',
          },
        },
        now,
      )(item),
    ).toBe(true)
  })
})
