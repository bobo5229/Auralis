import { parentPort, workerData } from 'node:worker_threads'
import { parseFile } from 'music-metadata'
import { normalizeMetadata } from './metadataNormalizer'
import { writeArtworkToCache } from '../artwork/artworkCache'
import type {
  MetadataRefreshWorkerInput,
  MetadataRefreshWorkerMessage,
} from './metadataRefreshTypes'

const input = workerData as MetadataRefreshWorkerInput

let processed = 0
let failed = 0

function postMessage(message: MetadataRefreshWorkerMessage): void {
  parentPort?.postMessage(message)
}

function postProgress(): void {
  postMessage({
    type: 'progress',
    payload: { jobId: input.jobId, processed, failed },
  })
}

function stringifySnapshot(value: unknown): string | null {
  const seen = new WeakSet<object>()

  try {
    return JSON.stringify(value, (key, nestedValue: unknown) => {
      if (typeof nestedValue === 'bigint') {
        return nestedValue.toString()
      }

      if (nestedValue instanceof Uint8Array) {
        return key === 'data'
          ? { redacted: true, byteLength: nestedValue.byteLength }
          : Array.from(nestedValue)
      }

      if (nestedValue && typeof nestedValue === 'object') {
        if (seen.has(nestedValue)) {
          return '[Circular]'
        }

        seen.add(nestedValue)
      }

      return nestedValue
    })
  } catch {
    return null
  }
}

async function resolveArtwork(
  filePath: string,
  metadata: Awaited<ReturnType<typeof parseFile>>,
): Promise<string | null> {
  const picture = metadata.common.picture?.[0]

  if (picture) {
    const source = { data: Buffer.from(picture.data), mimeType: picture.format }
    return writeArtworkToCache(input.artworkCacheDir, source)
  }

  return null
}

async function processTrack(trackId: number, filePath: string): Promise<void> {
  try {
    const metadata = await parseFile(filePath, { duration: true })
    const normalized = normalizeMetadata(metadata)
    const artworkCacheKey = await resolveArtwork(filePath, metadata)

    postMessage({
      type: 'result',
      payload: {
        trackId,
        title: normalized.title,
        artistDisplay: normalized.artistDisplay,
        artists: normalized.artists,
        artist: normalized.artist,
        albumTitle: normalized.albumTitle,
        album: normalized.album,
        albumArtistDisplay: normalized.albumArtistDisplay,
        albumArtists: normalized.albumArtists,
        albumArtist: normalized.albumArtist,
        trackNo: normalized.trackNo,
        discNo: normalized.discNo,
        durationSeconds: normalized.durationSeconds,
        year: normalized.year,
        releaseDate: normalized.releaseDate,
        genres: normalized.genres,
        genre: normalized.genre,
        lyricsText: normalized.lyricsText,
        lyricsFormat: normalized.lyricsFormat,
        artworkCacheKey,
        rawCommonJson: stringifySnapshot(metadata.common) ?? '{}',
        rawNativeJson: stringifySnapshot(metadata.native),
      },
    })

    processed += 1
  } catch (error) {
    failed += 1
    postMessage({
      type: 'failure',
      payload: {
        jobId: input.jobId,
        trackId,
        filePath,
        reason: error instanceof Error ? error.message : 'Unable to parse metadata',
      },
    })
  }

  postProgress()
}

async function run(): Promise<void> {
  for (const track of input.tracks) {
    await processTrack(track.trackId, track.filePath)
  }

  postMessage({ type: 'complete' })
}

run().catch((error: unknown) => {
  postMessage({
    type: 'fatal',
    payload: {
      jobId: input.jobId,
      reason: error instanceof Error ? error.message : 'Metadata refresh worker failed',
    },
  })
})
