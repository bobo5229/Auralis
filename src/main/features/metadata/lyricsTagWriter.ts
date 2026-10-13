import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'
import { MetadataSaveError } from './metadataSaveError'

export const LYRICS_TAG_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.ogg', '.opus'])

// Only the private staging copy is writable; structured text never enters a shell/command line.
const source = `
const { parentPort, workerData } = require('node:worker_threads');
const { File, ReadStyle } = require(workerData.modulePath);
let file;
try {
  file = File.createFromPath(workerData.path, workerData.mime, ReadStyle.None);
  if (!file.isWritable) throw new Error('Lyrics tag is not safely writable');
  file.tag.lyrics = workerData.text;
  file.save();
} catch (error) {
  parentPort.postMessage({ message: error.message });
} finally {
  file?.dispose();
  parentPort.close();
}
`

export async function writeLyricsStagingTag(
  path: string,
  extension: string,
  text: string,
): Promise<void> {
  if (!LYRICS_TAG_EXTENSIONS.has(extension))
    throw new MetadataSaveError('tag-write-failed', 'Unsupported embedded lyrics format')
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(source, {
      eval: true,
      workerData: {
        modulePath: createRequire(import.meta.url).resolve('node-taglib-sharp'),
        path,
        mime: `taglib/${extension.slice(1)}`,
        text,
      },
    })
    let failure: Error | undefined
    worker.on('message', () => {
      failure = new MetadataSaveError('tag-write-failed', 'Lyrics tag write failed')
    })
    worker.once('error', (error) => {
      failure = error
    })
    worker.once('exit', (code) => {
      if (failure) reject(failure)
      else if (code !== 0)
        reject(new MetadataSaveError('tag-write-failed', 'Lyrics tag worker exited'))
      else resolve()
    })
  })
}
