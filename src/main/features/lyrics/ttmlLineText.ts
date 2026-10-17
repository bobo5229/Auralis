import { XMLSerializer, type Element } from '@xmldom/xmldom'
import {
  MAX_TTML_LINE_CHARACTERS,
  type ReplaceLyricsEditorLineText,
} from '@shared/types/lyricsEditor'
import { readDuetDocument } from './duetDocument'
import { LyricsEditorError } from './lyricsEditorError'
import { hasInvalidXmlCharacters } from './ttmlDocument'

/** First phase edits direct paragraph text, preserving every structured descendant as read-only. */
export function plainParagraphText(paragraph: Element): string | null {
  let text = ''
  for (let node = paragraph.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === node.TEXT_NODE || node.nodeType === node.CDATA_SECTION_NODE)
      text += node.nodeValue ?? ''
    else if (
      node.nodeType !== node.COMMENT_NODE &&
      node.nodeType !== node.PROCESSING_INSTRUCTION_NODE
    )
      return null
  }
  return text.length <= MAX_TTML_LINE_CHARACTERS && !/[\r\n\u2028\u2029]/u.test(text) ? text : null
}

/** XML text nodes, never renderer-supplied markup. File publication remains with saveEditor. */
export function replaceTtmlLineText(text: string, request: ReplaceLyricsEditorLineText): string {
  if (
    typeof request.text !== 'string' ||
    request.text.length > MAX_TTML_LINE_CHARACTERS ||
    /[\r\n\u2028\u2029]/u.test(request.text) ||
    hasInvalidXmlCharacters(request.text)
  )
    throw new LyricsEditorError('invalid-line-text')
  const source = readDuetDocument(text)
  if (source.snapshot.revision !== request.expectedRevision)
    throw new LyricsEditorError('stale-revision')
  if (!source.snapshot.editable) throw new LyricsEditorError('unsupported-document')
  const paragraph = source.lines.get(request.lineId)
  if (!paragraph) throw new LyricsEditorError('unknown-line')
  const line = source.snapshot.lines.find((line) => line.id === request.lineId)!
  const original = plainParagraphText(paragraph)
  if (!line.editable || original === null) throw new LyricsEditorError('read-only-line')
  if (original === request.text) return text
  let inserted = false
  for (let node = paragraph.firstChild; node; ) {
    const next = node.nextSibling
    if (node.nodeType === node.TEXT_NODE || node.nodeType === node.CDATA_SECTION_NODE) {
      if (!inserted) {
        paragraph.insertBefore(source.document.createTextNode(request.text), node)
        inserted = true
      }
      paragraph.removeChild(node)
    }
    node = next
  }
  if (!inserted) paragraph.appendChild(source.document.createTextNode(request.text))
  return new XMLSerializer().serializeToString(source.document)
}
