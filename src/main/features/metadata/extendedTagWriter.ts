import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'
import type { AudioTagEdit } from './audioTagEdit'
import { MetadataSaveError } from './metadataSaveError'
import { splitDelimitedValues } from '@shared/utils/delimitedValues'

const source = `
const {parentPort,workerData:d}=require('node:worker_threads');
const {File,ReadStyle,TagTypes,MpegAudioFileSettings,Picture,PictureType,ByteVector}=require(d.modulePath);
MpegAudioFileSettings.defaultTagTypes=TagTypes.Id3v2;
let file;
try {
 file=File.createFromPath(d.path,d.mime,ReadStyle.None);
 if(!file.isWritable) throw new Error('Unwritable staging file');
 const tag=file.tag, changed=new Set(d.fields), value=d.values;
 if(d.flacText) {
   const comment=file.getTag(TagTypes.Xiph,true);
   for(const [field,key] of [['title','TITLE'],['albumTitle','ALBUM'],['releaseDate','DATE']]) if(changed.has(field)) comment.setFieldAsStrings(key,...(value[field] ? [value[field]] : []));
   for(const [field,key,plural,list] of [['artistDisplay','ARTIST','ARTISTS',d.lists.artists],['albumArtistDisplay','ALBUMARTIST','ALBUMARTISTS',d.lists.albumArtists],['genreDisplay','GENRE',null,d.lists.genres]]) if(changed.has(field)) {
     comment.setFieldAsStrings(key,...list);
     if(plural && comment.getFieldFirstValue(plural)!==undefined) comment.setFieldAsStrings(plural,...list);
   }
   if(changed.has('releaseDate') && comment.getFieldFirstValue('YEAR')!==undefined) comment.setFieldAsStrings('YEAR',...(value.releaseDate ? [value.releaseDate.slice(0,4)] : []));
 }
 if(changed.has('trackNo') || changed.has('trackTotal')) {tag.track=value.trackNo||0;tag.trackCount=value.trackTotal||0;}
 if(changed.has('discNo') || changed.has('discTotal')) {tag.disc=value.discNo||0;tag.discCount=value.discTotal||0;}
 if(changed.has('composer')) tag.composers=d.composers;
 if(changed.has('copyright')) tag.copyright=value.copyright||undefined;
 if(changed.has('isrc')) tag.isrc=value.isrc||undefined;
 if(['taglib/flac','taglib/ogg','taglib/opus'].includes(d.mime)) {
   const comments=tag.comments || [file.getTag(TagTypes.Xiph,false)];
   for(const comment of comments) {
    if(!comment) continue;
    for(const [alias,field,group] of [['TOTALTRACKS','trackTotal','trackNo'],['TOTALDISCS','discTotal','discNo']])
      if((changed.has(field)||changed.has(group)) && comment.getFieldFirstValue(alias)!==undefined) comment.setFieldAsUint(alias,value[field]||0);
   }
 }
 if(d.artwork?.length) {
   const originals=tag.pictures;
   const selected=new Map(d.artwork.filter(change=>change.kind!=='add').map(change=>[change.index,change]));
   const create=(change,previous)=>{
     const picture=Picture.fromData(ByteVector.fromByteArray(change.data));
     picture.mimeType=change.mimeType;
     picture.type=previous?.type ?? PictureType.FrontCover;
     picture.description=previous?.description;
     return picture;
   };
   const pictures=[];
   originals.forEach((picture,index)=>{const change=selected.get(index);if(!change) pictures.push(picture);else if(change.kind==='replace') pictures.push(create(change,picture));});
   for(const change of d.artwork) if(change.kind==='add') pictures.push(create(change));
   tag.pictures=pictures;
 }
 file.save();
} catch(error) {parentPort.postMessage({message:error.message});}
finally {file?.dispose();parentPort.close();}
`
export const EXTENDED_TAG_FIELDS = [
  'trackNo',
  'trackTotal',
  'discNo',
  'discTotal',
  'composer',
  'copyright',
  'isrc',
] as const

/** Changes only supported fields on a disposable staging copy; media never enters a transcoder. */
export async function writeExtendedStagingTags(
  path: string,
  extension: string,
  metadata: AudioTagEdit,
): Promise<void> {
  const flacText = extension === '.flac' && !!metadata.resolvedArtworkChanges?.length
  const fields = flacText
    ? [...(metadata.editedFields ?? [])]
    : EXTENDED_TAG_FIELDS.filter((field) => metadata.editedFields?.includes(field))
  if (!fields.length && !metadata.resolvedArtworkChanges?.length) return
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(source, {
      eval: true,
      workerData: {
        modulePath: createRequire(import.meta.url).resolve('node-taglib-sharp'),
        path,
        mime: `taglib/${extension.slice(1)}`,
        flacText,
        lists: {
          artists: splitDelimitedValues(metadata.artistDisplay),
          albumArtists: splitDelimitedValues(metadata.albumArtistDisplay),
          genres: splitDelimitedValues(metadata.genreDisplay),
        },
        fields,
        artwork: metadata.resolvedArtworkChanges,
        values: Object.fromEntries(
          [
            ...EXTENDED_TAG_FIELDS,
            'title',
            'artistDisplay',
            'albumTitle',
            'albumArtistDisplay',
            'genreDisplay',
            'releaseDate',
          ].map((field) => [field, metadata[field as keyof AudioTagEdit]]),
        ),
        composers: splitDelimitedValues(metadata.composer ?? null),
      },
    })
    let failure: Error | undefined
    worker.on('message', () => {
      failure = new MetadataSaveError('tag-write-failed', 'Extended tag write failed')
    })
    worker.once('error', (error) => {
      failure = error
    })
    worker.once('exit', (code) => {
      if (failure) reject(failure)
      else if (code !== 0)
        reject(new MetadataSaveError('tag-write-failed', 'Extended tag writer exited'))
      else resolve()
    })
  })
}
