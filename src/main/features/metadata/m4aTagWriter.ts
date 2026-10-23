import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { splitDelimitedValues } from '@shared/utils/delimitedValues'
import { parseAudioMetadata } from './parseAudioMetadata'
import { resolveArtists, resolveAlbumArtists, resolveGenres } from './metadataNormalizer'
import { MetadataSaveError } from './metadataSaveError'

// The package performs synchronous, seek-based I/O. Run it outside the main
// event loop, and only on the transaction's disposable staging file. Static
// worker code + structured data also work in packaged Electron without a
// separately bundled entry or a native ABI dependency.
const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
const { Mpeg4File, ReadStyle, ByteVector, StringType, Mpeg4AppleDataBoxFlagType } = require(workerData.modulePath);
let file;
try {
  file = new Mpeg4File(workerData.path, ReadStyle.None);
  if (!file.isWritable) throw new Error('MP4 file is not safely writable');
  for (const [id, values] of workerData.fields) {
    // One data box per list item avoids the library's string helper joining
    // values or interpreting literal semicolons as separators.
    file.tag.setQuickTimeData(ByteVector.fromString(id, StringType.Latin1),
      values.map(value => ByteVector.fromString(value, StringType.UTF8)),
      Mpeg4AppleDataBoxFlagType.ContainsText);
  }
  for (const [mean, name] of workerData.removeFreeform) file.tag.setItunesStrings(mean, name);
  file.save();
} catch (error) {
  parentPort.postMessage({ message: error.message, code: error.code });
} finally {
  file?.dispose();
  parentPort.close();
}
`

/** Edit Apple atoms while retaining other atoms, artwork and encoded media. */
export async function writeM4aStagingTags(
  path: string,
  metadata: EditableTrackMetadata,
): Promise<void> {
  const before = await parseAudioMetadata(path)
  const fields: [string, string[]][] = []
  const textValues = (value: string | null | undefined): string[] =>
    value?.trim() ? [value.trim()] : []
  const patch = (id: string, actual: string[], requested: string[]) => {
    if (JSON.stringify(actual) !== JSON.stringify(requested)) fields.push([id, requested])
  }
  patch('©nam', textValues(before.common.title), textValues(metadata.title))
  patch('©ART', resolveArtists(before), splitDelimitedValues(metadata.artistDisplay))
  patch('©alb', textValues(before.common.album), textValues(metadata.albumTitle))
  patch('aART', resolveAlbumArtists(before), splitDelimitedValues(metadata.albumArtistDisplay))
  patch(
    '©day',
    textValues(before.common.date || String(before.common.year ?? '')),
    textValues(metadata.releaseDate || String(metadata.year ?? '')),
  )
  const genres = splitDelimitedValues(metadata.genreDisplay)
  const removeFreeform: [string, string][] = []
  if (JSON.stringify(resolveGenres(before)) !== JSON.stringify(genres)) {
    fields.push(['©gen', genres], ['gnre', []])
    for (const tag of before.native.iTunes ?? []) {
      const match = /^----:([^:]+):(.+)$/.exec(tag.id)
      if (
        match &&
        match[1]!.toLowerCase() === 'com.apple.itunes' &&
        match[2]!.toLowerCase() === 'genre'
      )
        removeFreeform.push([match[1]!, match[2]!])
    }
  }
  if (!fields.length) return
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: {
        modulePath: createRequire(import.meta.url).resolve('node-taglib-sharp'),
        path,
        fields,
        removeFreeform,
      },
    })
    let failure: Error | undefined
    worker.on('message', (result: { message: string; code?: string }) => {
      failure = Object.assign(new MetadataSaveError('tag-write-failed', result.message), {
        code: result.code,
      })
    })
    worker.once('error', (error) => {
      failure = error
    })
    // Wait for exit (and the file handle closing) before validation or cleanup.
    worker.once('exit', (code) => {
      if (failure) reject(failure)
      else if (code !== 0)
        reject(new MetadataSaveError('tag-write-failed', `MP4 tag worker exited with code ${code}`))
      else resolve()
    })
  })
}
