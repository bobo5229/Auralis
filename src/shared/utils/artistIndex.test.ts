import { describe, expect, it } from 'vitest'
import { buildArtistAnchors, createArtistIndex, resolveIndexArtist } from './artistIndex'

describe('artist index', () => {
  it('uses album artist, then artist, without changing display names', () => {
    expect(resolveIndexArtist('  ', ' 周杰伦 ')).toBe(' 周杰伦 ')
    expect(resolveIndexArtist('Various Artists', 'Solo')).toBe('Various Artists')
    expect(resolveIndexArtist(null, ' ')).toBeNull()
  })
  it('groups pinyin, nonletters and unknown values consistently', () => {
    const index = createArtistIndex()
    expect(
      ['重庆', '周杰伦', ' beatles ', '2PM', '★乐队', 'Øystein', 'Unknown Artist', null].map(
        (name) => index.classify(name).letter,
      ),
    ).toEqual(['C', 'Z', 'B', '#', '#', '#', '#', '#'])
    const sorted = ['★乐队', '周杰伦', 'Adele', '2PM', '重庆'].sort(index.compare)
    expect(sorted.map((name) => index.classify(name).letter)).toEqual(['A', 'C', 'Z', '#', '#'])
    const anchors = buildArtistAnchors(sorted, (value) => value)
    expect(anchors.find((item) => item.letter === '#')?.rowIndex).toBe(3)
    expect(anchors.find((item) => item.letter === 'B')?.rowIndex).toBeNull()
  })
})
