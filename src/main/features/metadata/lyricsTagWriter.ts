import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'
import { MetadataSaveError } from './metadataSaveError'

export const LYRICS_TAG_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.ogg', '.opus'])

// Only the private staging copy is writable; structured text never enters a shell/command line.
const source = `
const { parentPort, workerData } = require('node:worker_threads');
const { File, ReadStyle, TagTypes, ByteVector } = require(workerData.modulePath);
// The public Xiph setter trims strings. Adapt its public serialization on this staging
// instance only, retaining the vendor, other fields, pictures and optional framing byte.
function preserveXiphLyrics(comment, text) {
  const render = comment.render.bind(comment);
  comment.render = (framing) => {
    const bytes = Buffer.from(render(framing).toByteArray());
    const vendorEnd = 4 + bytes.readUInt32LE(0);
    const count = bytes.readUInt32LE(vendorEnd);
    let cursor = vendorEnd + 4;
    const fields = [];
    const length = (size) => {
      const value = Buffer.alloc(4);
      value.writeUInt32LE(size);
      return value;
    };
    for (let index = 0; index < count; index++) {
      const start = cursor;
      const size = bytes.readUInt32LE(cursor);
      cursor += 4;
      const field = bytes.subarray(cursor, cursor + size);
      cursor += size;
      const separator = field.indexOf(61);
      if (separator < 0 || field.subarray(0, separator).toString('ascii').toUpperCase() !== 'LYRICS')
        fields.push(bytes.subarray(start, cursor));
    }
    if (text !== '') {
      const field = Buffer.from('LYRICS=' + text, 'utf8');
      fields.push(Buffer.concat([length(field.length), field]));
    }
    return ByteVector.fromByteArray(Buffer.concat([
      bytes.subarray(0, vendorEnd), length(fields.length), ...fields, bytes.subarray(cursor),
    ]));
  };
}
let file;
try {
  file = File.createFromPath(workerData.path, workerData.mime, ReadStyle.None);
  if (!file.isWritable) throw new Error('Lyrics tag is not safely writable');
  file.tag.lyrics = workerData.text;
  if (['taglib/flac', 'taglib/ogg', 'taglib/opus'].includes(workerData.mime)) {
    const comments = file.tag.comments || [file.getTag(TagTypes.Xiph, true)];
    for (const comment of comments) {
      if (!comment) throw new Error('Missing Xiph comment');
      preserveXiphLyrics(comment, workerData.text);
    }
  }
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
