import type Database from 'better-sqlite3'

export function replaceMetadataTrackArtists(
  trackId: number,
  names: string[],
  role: string,
  upsertArtist: Database.Statement<[string]>,
  getArtistId: Database.Statement<[string], { id: number } | undefined>,
  deleteTrackArtists: Database.Statement<[number, string]>,
  insertTrackArtist: Database.Statement<[number, number, number, string]>,
): void {
  deleteTrackArtists.run(trackId, role)

  const seen = new Set<string>()
  let position = 0

  for (const rawName of names) {
    const name = rawName.trim()

    if (!name || seen.has(name)) {
      continue
    }

    seen.add(name)
    upsertArtist.run(name)

    const artist = getArtistId.get(name)
    if (!artist) {
      continue
    }

    insertTrackArtist.run(trackId, artist.id, position, role)
    position += 1
  }
}
