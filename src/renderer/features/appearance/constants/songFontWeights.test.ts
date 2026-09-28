import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SONG_COVER_FONT_FIELDS,
  SONG_FONT_WEIGHT_DEFAULTS,
  SONG_LIST_FONT_FIELDS,
  defaultSongFontWeight,
  emptySongFontWeightPreference,
  isSongFontWeightValue,
  parseStoredSongFontWeights,
  serializeSongFontWeights,
  songFontWeightCssVarName,
  songFontWeightCssVars,
} from './songFontWeights'

const root = resolve(import.meta.dirname, '../../../../..')

function source(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

function shortcutValue(config: string, name: string): string {
  const marker = `'${name}':`
  const start = config.indexOf(marker)
  const quote = config.indexOf("'", start + marker.length)
  const end = config.indexOf("'", quote + 1)
  return config.slice(quote + 1, end)
}

describe('parseStoredSongFontWeights', () => {
  it('uses the default table when storage is missing', () => {
    expect(parseStoredSongFontWeights(null)).toEqual({
      preference: emptySongFontWeightPreference(),
      retainStorage: false,
      issues: [],
    })
    expect(parseStoredSongFontWeights('')).toEqual({
      preference: emptySongFontWeightPreference(),
      retainStorage: false,
      issues: [],
    })
  })

  it('keeps legal overrides for both views', () => {
    const raw = JSON.stringify({
      version: 1,
      list: { title: 600 },
      cover: { title: 700, duration: 500 },
    })

    expect(parseStoredSongFontWeights(raw)).toEqual({
      preference: {
        list: { title: 600 },
        cover: { title: 700, duration: 500 },
      },
      retainStorage: false,
      issues: [],
    })
  })

  it('drops unknown fields and illegal weights without discarding legal ones', () => {
    const result = parseStoredSongFontWeights(
      JSON.stringify({
        version: 1,
        extra: true,
        list: { title: 650, artist: 500, note: 400 },
        cover: { album: '700', genre: 600 },
      }),
    )

    expect(result.preference).toEqual({
      list: { artist: 500 },
      cover: { genre: 600 },
    })
    expect(result.retainStorage).toBe(false)
    expect(result.issues).toEqual([
      'extra:unknown',
      'list.title:invalid',
      'list.note:unknown',
      'cover.album:invalid',
    ])
  })

  it('rejects unusable payloads and asks the caller to keep the original text', () => {
    expect(parseStoredSongFontWeights('{').retainStorage).toBe(true)
    expect(parseStoredSongFontWeights('{').preference).toEqual(emptySongFontWeightPreference())
    expect(parseStoredSongFontWeights('[]')).toMatchObject({
      retainStorage: true,
      issues: ['invalid-shape'],
    })
    expect(
      parseStoredSongFontWeights(JSON.stringify({ version: 2, list: { title: 600 }, cover: {} })),
    ).toMatchObject({
      preference: emptySongFontWeightPreference(),
      retainStorage: true,
      issues: ['unsupported-version'],
    })
  })

  it('does not treat the default label as a stored number', () => {
    const preference = { list: { artist: 500 as const }, cover: {} }
    expect(JSON.parse(serializeSongFontWeights(preference))).toEqual({
      version: 1,
      list: { artist: 500 },
      cover: {},
    })
    expect(isSongFontWeightValue('500')).toBe(false)
    expect(isSongFontWeightValue(450)).toBe(false)
    expect(defaultSongFontWeight('list', 'title')).toBe(700)
    expect(defaultSongFontWeight('cover', 'title')).toBe(500)
    expect(defaultSongFontWeight('list', 'discHeading')).toBeNull()
  })
})

describe('songFontWeightCssVars', () => {
  it('resolves every field from the default table or its own override', () => {
    const defaults = songFontWeightCssVars(emptySongFontWeightPreference())
    expect(defaults['--auralis-song-list-title-weight']).toBe('700')
    expect(defaults['--auralis-song-list-duration-weight']).toBe('400')
    expect(defaults['--auralis-song-cover-title-weight']).toBe('500')
    expect(defaults['--auralis-song-cover-album-weight']).toBe('700')
    expect(defaults['--auralis-song-cover-disc-heading-weight']).toBe('700')
    expect(Object.keys(defaults)).toHaveLength(
      SONG_LIST_FONT_FIELDS.length + SONG_COVER_FONT_FIELDS.length,
    )

    const overridden = songFontWeightCssVars({
      list: { title: 400 },
      cover: { title: 700 },
    })
    expect(overridden['--auralis-song-list-title-weight']).toBe('400')
    expect(overridden['--auralis-song-cover-title-weight']).toBe('700')
    expect(overridden['--auralis-song-list-artist-weight']).toBe(
      String(SONG_FONT_WEIGHT_DEFAULTS.list.artist),
    )
    expect(songFontWeightCssVarName('list', 'discHeading')).toBeNull()
  })
})

describe('song font weight style wiring', () => {
  const songRow = source('src/renderer/features/library/components/SongRow.vue')
  const albumGroup = source('src/renderer/features/library/components/AlbumCoverGroup.vue')
  const trackRow = source('src/renderer/features/library/components/AlbumCoverTrackRow.vue')
  const preview = source('src/renderer/features/settings/components/SongFontWeightPreview.vue')
  const libraryPage = source('src/renderer/features/library/pages/LibraryPage.vue')
  const uno = source('uno.config.ts')

  it('keeps the original weight as the fallback and removes competing utilities', () => {
    for (const field of SONG_LIST_FONT_FIELDS) {
      const declaration = `var(${songFontWeightCssVarName('list', field)}, ${SONG_FONT_WEIGHT_DEFAULTS.list[field]})`
      expect(songRow).toContain(declaration)
      expect(preview).toContain(declaration)
    }
    for (const field of SONG_COVER_FONT_FIELDS) {
      const declaration = `var(${songFontWeightCssVarName('cover', field)}, ${SONG_FONT_WEIGHT_DEFAULTS.cover[field]})`
      expect(`${albumGroup}\n${trackRow}`).toContain(declaration)
      expect(preview).toContain(declaration)
    }

    expect(songRow).not.toContain('font-bold')
    expect(songRow).not.toContain('font-semibold')
    expect(trackRow).not.toContain('font-medium')
    expect(trackRow).not.toContain('font-normal')
    for (const name of [
      'song-title',
      'song-artist',
      'song-album',
      'album-cover-meta-title',
      'album-cover-meta-line',
    ]) {
      expect(shortcutValue(uno, name)).not.toMatch(/font-(?:bold|semibold|medium)/)
    }
  })

  it('injects variables only on the library song surface', () => {
    expect(libraryPage).toContain("librarySurfaceKind.value === 'library'")
    expect(libraryPage).toContain('songFontWeightStyle')
    expect(libraryPage).toContain('LIBRARY_LAYOUT_CSS_VARS')
  })
})
