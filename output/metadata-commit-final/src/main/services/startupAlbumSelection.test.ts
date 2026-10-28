import { describe, expect, it } from 'vitest'
import type { StartupAlbumCandidate } from '@main/repositories/startupAlbumCandidate'
import { selectStartupAlbum } from './startupAlbumSelection'

const now = Date.parse('2026-10-10T12:00:00Z')
function album(name: string, plays = 0, days?: number, artist = name): StartupAlbumCandidate {
  return {
    album: name,
    albumArtist: artist,
    averagePlayCount: plays,
    unheardFraction: plays === 0 ? 1 : 0,
    lastPlayedAt: days === undefined ? null : new Date(now - days * 86_400_000).toISOString(),
  }
}
function draw(
  items: StartupAlbumCandidate[],
  branch: number,
  position: number,
  history: StartupAlbumCandidate[] = [],
) {
  const values = [branch, position]
  return selectStartupAlbum(items, history, () => values.shift()!, now)?.album
}

describe('startup album weighted discovery', () => {
  it('uses the 60/25/15 boundaries, with a genuinely uniform random direction', () => {
    const items = [album('unheard'), album('recent', 24, 0), album('old', 1, 90)]
    expect(draw(items, 0.599999, 0.5)).toBe('unheard')
    expect(draw(items, 0.6, 0.5)).toBe('old')
    expect(draw(items, 0.849999, 0.5)).toBe('old')
    expect(draw(items, 0.85, 0.5)).toBe('recent')
    expect(draw(items, 0.999, 0.999)).toBe('old')
  })
  it('gives less heard albums more chances without excluding familiar ones', () => {
    const items = [album('unheard'), album('familiar', 24)]
    expect(draw(items, 0, 0.8)).toBe('unheard')
    expect(draw(items, 0, 0.99)).toBe('familiar')
    const partial = { ...album('partial', 1), unheardFraction: 0.9 }
    expect(draw([partial, album('all heard', 1)], 0, 0.55)).toBe('partial')
  })
  it('caps rediscovery at 90 days and excludes unrecorded albums when heard ones exist', () => {
    const items = [album('unheard'), album('90 days', 2, 90), album('900 days', 2, 900)]
    expect(draw(items, 0.7, 0.49)).toBe('90 days')
    expect(draw(items, 0.7, 0.5)).toBe('900 days')
    expect(draw([album('future', 1, -1), album('today', 1, 0)], 0.7, 0.5)).toBe('today')
  })
  it('is uniform with no listening history in all directions', () => {
    const items = [album('A'), album('B'), album('C')]
    for (const branch of [0, 0.7, 0.9]) {
      expect(draw(items, branch, 0)).toBe('A')
      expect(draw(items, branch, 0.5)).toBe('B')
      expect(draw(items, branch, 0.999)).toBe('C')
    }
  })
  it('cools recent presentations and releases the oldest only as needed', () => {
    const items = [album('A'), album('B'), album('C')]
    expect(draw(items, 0.9, 0, items.slice(0, 2))).toBe('C')
    expect(draw(items, 0.9, 0, items)).toBe('C')
    expect(draw(items.slice(0, 2), 0.9, 0, items)).toBe('B')
    expect(draw([items[0]], 0, 0, items)).toBe('A')
    expect(selectStartupAlbum([], items)).toBeNull()
  })
  it('reduces recent artist weight without affecting the uniform branch', () => {
    const items = [album('A', 0, undefined, 'Artist'), album('B')]
    const history = [album('other', 0, undefined, 'Artist')]
    expect(draw(items, 0, 0.45, history)).toBe('B')
    expect(draw(items, 0.9, 0.45, history)).toBe('A')
  })
  it('keeps the mixture close to its expected distribution over repeated draws', () => {
    let seed = 12345
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296
    const items = [album('unheard'), album('recent', 24, 0), album('old', 1, 90)]
    const counts: Record<string, number> = { unheard: 0, recent: 0, old: 0 }
    for (let i = 0; i < 60000; i++) counts[selectStartupAlbum(items, [], random, now)!.album]++
    const weights = [1.5, 0.2, 1 / Math.sqrt(2)]
    const sum = weights.reduce((a, b) => a + b, 0)
    const expected = [
      (0.6 * weights[0]) / sum + 0.05,
      (0.6 * weights[1]) / sum + 0.25 / 11 + 0.05,
      (0.6 * weights[2]) / sum + (0.25 * 10) / 11 + 0.05,
    ]
    Object.values(counts).forEach((count, i) => expect(count / 60000).toBeCloseTo(expected[i], 2))
  })
})
