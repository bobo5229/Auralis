import { XMLSerializer, type Element } from '@xmldom/xmldom'
import { elementChildren, readDuetDocument, type DuetDocument } from './duetDocument'
import { parseTtmlTime, formatTtmlTime } from './conversionTime'
import { LyricsEditorError } from './lyricsEditorError'
import { readTtmlPlayback } from './ttmlPlayback'
import type { RetimeLyricsEditorLines } from '@shared/types/lyricsEditor'
import type { ConversionWarnings } from './conversionTypes'

function milliseconds(value: string): number {
  const warnings: ConversionWarnings = new Set()
  const time = parseTtmlTime(value, warnings)
  // Do not round a more precise source merely by opening or moving it.
  if (warnings.size) throw new LyricsEditorError('unsupported-timing')
  return time
}

/** Only self-contained absolute paragraph timing can be translated without changing neighbours. */
function timedElements(paragraph: Element): Element[] {
  if (!paragraph.hasAttribute('begin')) throw new LyricsEditorError('unsupported-timing')
  for (let parent = paragraph.parentNode; parent?.nodeType === 1; parent = parent.parentNode) {
    const element = parent as Element
    if (['begin', 'end', 'dur'].some((name) => element.hasAttribute(name)))
      throw new LyricsEditorError('unsupported-timing')
  }
  const elements: Element[] = []
  function visit(element: Element): void {
    elements.push(element)
    for (const name of ['begin', 'end', 'dur']) {
      if (element.hasAttribute(name)) milliseconds(element.getAttribute(name)!)
    }
    for (const child of elementChildren(element)) visit(child)
  }
  visit(paragraph)
  return elements
}

export function timingEditableLines(source: DuetDocument): Set<string> {
  const ids = new Set<string>()
  for (const [id, paragraph] of source.lines) {
    try {
      timedElements(paragraph)
      ids.add(id)
    } catch {
      // Performer editing remains available for unsupported timing structures.
    }
  }
  return ids
}

function setParagraphEnd(paragraph: Element, elements: Element[], endMs: number): boolean {
  const startMs = milliseconds(paragraph.getAttribute('begin')!)
  if (endMs <= startMs) throw new LyricsEditorError('invalid-end-time')
  const ends: number[] = []
  if (paragraph.hasAttribute('end')) ends.push(milliseconds(paragraph.getAttribute('end')!))
  if (paragraph.hasAttribute('dur'))
    ends.push(startMs + milliseconds(paragraph.getAttribute('dur')!))
  if (ends.length && Math.min(...ends) === endMs) return false

  // Changing the paragraph boundary must not clip any explicit word/auxiliary timing.
  const starts = new Map<Element, number>([[paragraph, startMs]])
  for (const element of elements.slice(1)) {
    const start = element.hasAttribute('begin')
      ? milliseconds(element.getAttribute('begin')!)
      : starts.get(element.parentNode as Element)!
    starts.set(element, start)
    const childEnds: number[] = []
    if (element.hasAttribute('end')) childEnds.push(milliseconds(element.getAttribute('end')!))
    if (element.hasAttribute('dur'))
      childEnds.push(start + milliseconds(element.getAttribute('dur')!))
    if (start >= endMs || (childEnds.length && Math.min(...childEnds) > endMs))
      throw new LyricsEditorError('invalid-end-time')
  }
  paragraph.setAttribute('end', formatTtmlTime(endMs))
  if (paragraph.hasAttribute('dur')) paragraph.setAttribute('dur', formatTtmlTime(endMs - startMs))
  return true
}

/** Atomic draft operation: shift a line with its words, or change only its end boundary. */
export function retimeTtmlLines(text: string, request: RetimeLyricsEditorLines): string {
  const source = readDuetDocument(text)
  if (source.snapshot.revision !== request.expectedRevision)
    throw new LyricsEditorError('stale-revision')
  if (!source.snapshot.editable) throw new LyricsEditorError('unsupported-document')
  const ids = [...new Set(request.lineIds)]
  if (
    !ids.length ||
    ids.length > 10000 ||
    !['set', 'set-end', 'shift'].includes(request.mode) ||
    !Number.isSafeInteger(request.valueMs) ||
    (request.mode !== 'shift' && (ids.length !== 1 || request.valueMs < 0))
  )
    throw new LyricsEditorError('invalid-request')
  let changed = false
  for (const id of ids) {
    const paragraph = source.lines.get(id)
    if (!paragraph) throw new LyricsEditorError('unknown-line')
    const elements = timedElements(paragraph)
    if (request.mode === 'set-end') {
      changed = setParagraphEnd(paragraph, elements, request.valueMs) || changed
      continue
    }
    const delta =
      request.mode === 'set'
        ? request.valueMs - milliseconds(paragraph.getAttribute('begin')!)
        : request.valueMs
    if (!delta) continue
    for (const element of elements) {
      for (const name of ['begin', 'end']) {
        if (!element.hasAttribute(name)) continue
        const shifted = milliseconds(element.getAttribute(name)!) + delta
        if (!Number.isSafeInteger(shifted) || shifted < 0)
          throw new LyricsEditorError('invalid-time')
        element.setAttribute(name, formatTtmlTime(shifted))
      }
    }
    changed = true
  }
  if (!changed) return text
  const edited = new XMLSerializer().serializeToString(source.document)
  const playback = readTtmlPlayback(edited)
  if (playback.error) throw new LyricsEditorError(playback.error)
  return edited
}
