/** Bits reserved for historical user edits; ordinary file tags carry no override. */
export const METADATA_OVERRIDE = {
  title: 1,
  artist: 2,
  album: 4,
  albumArtist: 8,
  genre: 16,
  year: 32,
  releaseDate: 64,
} as const

export const ALL_METADATA_OVERRIDES = Object.values(METADATA_OVERRIDE).reduce(
  (mask, bit) => mask | bit,
  0,
)
