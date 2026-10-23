import { type Element, type Node } from '@xmldom/xmldom'
import { parseTtmlTime, checkedMilliseconds } from './conversionTime'
import {
  LyricsConversionError,
  type ConversionDocument,
  type ConversionLine,
  type ConversionWarnings,
  type TtmlToLrcOptions,
} from './conversionTypes'
import {
  parseTtmlDocument,
  TTML_NAMESPACE,
  TTML_METADATA_NAMESPACE,
  MAX_CONVERSION_ITEMS,
} from './ttmlDocument'

const AURALIS_NAMESPACE = 'urn:auralis:lyrics'
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'
const ITUNES_NAMESPACE = 'http://itunes.apple.com/lyric-ttml-extensions'
const PARAMETER_NAMESPACE = `${TTML_NAMESPACE}#parameter`
const STYLING_NAMESPACE = `${TTML_NAMESPACE}#styling`
const AUXILIARY_ROLES = new Set(['x-translation', 'x-roman', 'x-bg'])

function children(element: Element): Element[] {
  const result: Element[] = []
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === node.ELEMENT_NODE) result.push(node as Element)
  }
  return result
}

function role(element: Element): string {
  return element.getAttributeNS(TTML_METADATA_NAMESPACE, 'role') ?? ''
}

function plainText(element: Element): string {
  let preserve = false
  for (
    let node: Node | null = element;
    node && node.nodeType === node.ELEMENT_NODE;
    node = node.parentNode
  ) {
    const space = (node as Element).getAttributeNS(XML_NAMESPACE, 'space')
    if (space) {
      preserve = space === 'preserve'
      break
    }
  }
  function collect(node: Node): string {
    if (node.nodeType === node.TEXT_NODE || node.nodeType === node.CDATA_SECTION_NODE)
      return node.nodeValue ?? ''
    if (node.nodeType !== node.ELEMENT_NODE) return ''
    const current = node as Element
    if (current !== element && AUXILIARY_ROLES.has(role(current))) return ''
    const ruby = current.getAttributeNS(STYLING_NAMESPACE, 'ruby')
    if (ruby === 'text' || ruby === 'textContainer') return ''
    if (current.localName === 'br' && current.namespaceURI === TTML_NAMESPACE) return '\u0000'
    let text = ''
    for (let child = current.firstChild; child; child = child.nextSibling) text += collect(child)
    return text
  }
  const text = collect(element)
  return preserve
    ? text.replaceAll('\u0000', '\n')
    : text
        .split('\u0000')
        .map((line) => line.replace(/[\t\r\n ]+/g, ' ').replace(/^ +| +$/g, ''))
        .join('\n')
}

interface TimeContext {
  start: number
  end?: number
  timed: boolean
}

export function parseTtmlForConversion(
  raw: string,
  warnings: ConversionWarnings,
  options: TtmlToLrcOptions,
  onParagraph?: (index: number, lines: readonly ConversionLine[]) => void,
): ConversionDocument {
  let document
  try {
    document = parseTtmlDocument(raw)
  } catch {
    throw new LyricsConversionError('invalid-ttml', 'Malformed or unsupported TTML document')
  }
  const root = document.documentElement!
  if (
    options.timingMode !== undefined &&
    options.timingMode !== 'absolute' &&
    options.timingMode !== 'relative'
  ) {
    throw new LyricsConversionError('invalid-option', 'Unknown TTML timing mode')
  }
  const mode = options.timingMode ?? 'absolute'
  const timeBase = root.getAttributeNS(PARAMETER_NAMESPACE, 'timeBase')
  if (timeBase && timeBase !== 'media')
    throw new LyricsConversionError('unsupported-timing', 'Only media-based TTML is supported')
  // Validate depth before walking content/text to keep malformed input bounded.
  const all: Element[] = []
  const stack: Array<{ element: Element; depth: number }> = [{ element: root, depth: 0 }]
  while (stack.length) {
    const { element, depth } = stack.pop()!
    if (depth > 128)
      throw new LyricsConversionError('invalid-ttml', 'TTML nesting exceeds the conversion limit')
    if (all.length >= MAX_CONVERSION_ITEMS)
      throw new LyricsConversionError('invalid-input', 'TTML exceeds the conversion item limit')
    all.push(element)
    for (const child of children(element)) stack.push({ element: child, depth: depth + 1 })
  }
  const metadata: Array<[string, string]> = []
  const linkedAnnotations = new Map<string, string[]>()
  let title: string | undefined
  const artists: string[] = []
  for (const element of all) {
    if (element.getAttribute('timeContainer') === 'seq')
      throw new LyricsConversionError(
        'unsupported-timing',
        'Sequential TTML containers are not supported',
      )
    if (
      element.hasAttributeNS(TTML_METADATA_NAMESPACE, 'agent') ||
      (element.namespaceURI === TTML_METADATA_NAMESPACE && element.localName === 'agent')
    )
      warnings.add('performers-dropped')
    if (
      element.hasAttribute('style') ||
      element.hasAttribute('region') ||
      element.namespaceURI === STYLING_NAMESPACE ||
      element.localName === 'styling' ||
      element.localName === 'layout'
    )
      warnings.add('presentation-dropped')
    for (let i = 0; i < element.attributes.length; i++) {
      const attribute = element.attributes.item(i)!
      if (attribute.namespaceURI === STYLING_NAMESPACE) warnings.add('presentation-dropped')
      if (
        (attribute.namespaceURI === ITUNES_NAMESPACE && attribute.localName !== 'key') ||
        (attribute.namespaceURI === XML_NAMESPACE && attribute.localName === 'lang')
      ) {
        warnings.add('metadata-dropped')
      }
    }
  }
  function readHead(element: Element): void {
    if (element.namespaceURI === AURALIS_NAMESPACE && element.localName === 'meta') {
      const key = element.getAttribute('name') ?? ''
      const value = element.getAttribute('value') ?? ''
      if (/^[a-z][a-z\d_-]*$/i.test(key) && key !== 'offset') metadata.push([key, value])
      else warnings.add('metadata-dropped')
    } else if (element.namespaceURI === TTML_METADATA_NAMESPACE && element.localName === 'title')
      title ??= plainText(element)
    else if (element.namespaceURI === TTML_METADATA_NAMESPACE && element.localName === 'name')
      artists.push(plainText(element))
    else if (element.localName === 'text' && element.hasAttribute('for')) {
      const key = element.getAttribute('for')!
      linkedAnnotations.set(key, [...(linkedAnnotations.get(key) ?? []), plainText(element)])
      warnings.add('annotations-flattened')
    } else if (
      ![
        'head',
        'metadata',
        'agent',
        'translations',
        'translation',
        'transliterations',
        'transliteration',
        'iTunesMetadata',
      ].includes(element.localName ?? '') &&
      element.namespaceURI !== STYLING_NAMESPACE
    )
      warnings.add('metadata-dropped')
    for (const child of children(element)) readHead(child)
  }
  for (const head of children(root).filter((element) => element.localName === 'head'))
    readHead(head)
  if (title && !metadata.some(([key]) => key === 'ti')) metadata.unshift(['ti', title])
  if (artists.length && !metadata.some(([key]) => key === 'ar'))
    metadata.push(['ar', [...new Set(artists.filter(Boolean))].join('; ')])

  function context(element: Element, parent: TimeContext): TimeContext {
    const begin = element.getAttribute('begin')
    const end = element.getAttribute('end')
    const dur = element.getAttribute('dur')
    for (const name of ['begin', 'end', 'dur']) {
      if (element.hasAttribute(name) && !element.getAttribute(name)?.trim())
        throw new LyricsConversionError('unsupported-timing', 'Empty TTML timing attribute')
    }
    const base = mode === 'relative' ? parent.start : 0
    const start = begin ? checkedMilliseconds(base + parseTtmlTime(begin, warnings)) : parent.start
    const ends = [parent.end]
    if (end) ends.push(checkedMilliseconds(base + parseTtmlTime(end, warnings)))
    if (dur) ends.push(checkedMilliseconds(start + parseTtmlTime(dur, warnings)))
    const resolvedEnd = Math.min(...ends.filter((value): value is number => value !== undefined))
    if (resolvedEnd < start)
      throw new LyricsConversionError('invalid-ttml', 'TTML ends before it begins')
    return {
      start,
      end: Number.isFinite(resolvedEnd) ? resolvedEnd : undefined,
      timed: parent.timed || !!begin,
    }
  }

  const lines: ConversionLine[] = []
  function emit(element: Element, frame: TimeContext): ConversionLine[] {
    let earliest: number | undefined
    function wordTimes(current: Element, parent: TimeContext): void {
      for (const child of children(current)) {
        if (AUXILIARY_ROLES.has(role(child))) continue
        const childFrame = context(child, parent)
        if (child.hasAttribute('begin')) {
          earliest = Math.min(earliest ?? Infinity, childFrame.start)
          warnings.add('word-timing-dropped')
        }
        if (child.hasAttribute('end') || child.hasAttribute('dur'))
          warnings.add('word-timing-dropped')
        wordTimes(child, childFrame)
      }
    }
    wordTimes(element, frame)
    if (!frame.timed && earliest === undefined)
      throw new LyricsConversionError('invalid-ttml', 'A lyric line has no usable timing')
    const startMs = element.hasAttribute('begin') ? frame.start : (earliest ?? frame.start)
    if (frame.end !== undefined) warnings.add('line-ends-dropped')
    const parts = plainText(element).split(/\r?\n|\r/)
    if (lines.length + parts.length > MAX_CONVERSION_ITEMS)
      throw new LyricsConversionError('invalid-input', 'TTML exceeds the conversion line limit')
    const emitted = parts.map((text) => ({ startMs, endMs: frame.end, text }))
    for (const line of emitted) lines.push(line)
    return emitted
  }

  let paragraphIndex = 0
  function walk(element: Element, parent: TimeContext, inParagraph = false): void {
    const frame = context(element, parent)
    const paragraph = element.namespaceURI === TTML_NAMESPACE && element.localName === 'p'
    const auxiliary = inParagraph && AUXILIARY_ROLES.has(role(element))
    if (paragraph || auxiliary) {
      if (auxiliary) warnings.add('annotations-flattened')
      const emitted = emit(element, frame)
      if (paragraph) onParagraph?.(paragraphIndex++, emitted)
      if (paragraph) {
        const key = element.getAttributeNS(ITUNES_NAMESPACE, 'key')
        for (const text of (key ? linkedAnnotations.get(key) : []) ?? []) {
          lines.push({ startMs: lines.at(-1)!.startMs, text })
        }
      }
    }
    for (const child of children(element)) walk(child, frame, inParagraph || paragraph)
  }
  for (const body of children(root).filter(
    (element) => element.localName === 'body' && element.namespaceURI === TTML_NAMESPACE,
  )) {
    walk(body, { start: 0, timed: false })
  }
  if (!lines.length) throw new LyricsConversionError('invalid-ttml', 'No lyric paragraphs found')
  lines.sort((a, b) => a.startMs - b.startMs)
  return { lines, metadata }
}
