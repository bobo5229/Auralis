export const ALBUM_LIST_PARAMETER_STORAGE_KEY = 'auralis-album-list-parameters'
export const ALBUM_LIST_FONT_FIELDS = ['title', 'artist', 'year'] as const
export type AlbumListFontField = (typeof ALBUM_LIST_FONT_FIELDS)[number]
export const ALBUM_LIST_DEFAULT_SIZES = { title: 14, artist: 12, year: 11 } as const
export const ALBUM_LIST_DEFAULT_WEIGHTS = { title: 700, artist: 400, year: 400 } as const
export const ALBUM_LIST_SIZE_RANGES = {
  title: { min: 10, max: 24 },
  artist: { min: 10, max: 20 },
  year: { min: 9, max: 18 },
} as const
export const ALBUM_LIST_FONT_WEIGHTS = [400, 500, 600, 700] as const
export type AlbumListFontWeight = (typeof ALBUM_LIST_FONT_WEIGHTS)[number]
export const ALBUM_LIST_DEFAULT_RADIUS = 12
export const ALBUM_LIST_METADATA_GAP = 12
export const ALBUM_LIST_METADATA_MIN_HEIGHT = 58
export const ALBUM_LIST_TEXT_GAP = 3
export const ALBUM_LIST_LINE_HEIGHT = 1.25

export interface AlbumListParameters {
  sizes: Partial<Record<AlbumListFontField, number>>
  weights: Partial<Record<AlbumListFontField, AlbumListFontWeight>>
  rounded: boolean
  radius: number
}

export function defaultAlbumListParameters(): AlbumListParameters {
  return { sizes: {}, weights: {}, rounded: true, radius: ALBUM_LIST_DEFAULT_RADIUS }
}

export function isAlbumListSize(field: AlbumListFontField, value: unknown): value is number {
  const { min, max } = ALBUM_LIST_SIZE_RANGES[field]
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

export function isAlbumListWeight(value: unknown): value is AlbumListFontWeight {
  return ALBUM_LIST_FONT_WEIGHTS.some((weight) => weight === value)
}

export function isAlbumListRadius(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 4 &&
    value <= 24 &&
    value % 2 === 0
  )
}

export function parseAlbumListParameters(raw: string | null): AlbumListParameters {
  const result = defaultAlbumListParameters()
  if (!raw) return result
  try {
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || data.version !== 1) return result
    for (const field of ALBUM_LIST_FONT_FIELDS) {
      if (isAlbumListSize(field, data.sizes?.[field])) result.sizes[field] = data.sizes[field]
      if (isAlbumListWeight(data.weights?.[field])) result.weights[field] = data.weights[field]
    }
    if (typeof data.rounded === 'boolean') result.rounded = data.rounded
    if (isAlbumListRadius(data.radius)) result.radius = data.radius
  } catch {
    /* Unusable stored values use the current defaults. */
  }
  return result
}

export function albumListMetadataHeight(sizes: Record<AlbumListFontField, number>): number {
  return Math.max(
    ALBUM_LIST_METADATA_MIN_HEIGHT,
    Math.ceil(
      ALBUM_LIST_FONT_FIELDS.reduce(
        (sum, field) => sum + sizes[field] * ALBUM_LIST_LINE_HEIGHT,
        0,
      ) +
        ALBUM_LIST_TEXT_GAP * 2,
    ),
  )
}
