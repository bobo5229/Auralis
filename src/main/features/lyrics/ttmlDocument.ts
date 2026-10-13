import { DOMParser, onWarningStopParsing, type Element, type Node } from '@xmldom/xmldom'

export const TTML_NAMESPACE = 'http://www.w3.org/ns/ttml'
export const TTML_METADATA_NAMESPACE = `${TTML_NAMESPACE}#metadata`
export const MAX_LYRICS_CHARACTERS = 8 * 1024 * 1024
export const MAX_CONVERSION_ITEMS = 100000

export function hasInvalidXmlCharacters(text: string): boolean {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
    text,
  )
}

/** Read-only parsing: never resolves external resources or serializes over the source. */
export function parseTtmlDocument(text: string) {
  if (text.length > MAX_LYRICS_CHARACTERS || /<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new Error('TTML exceeds the input limit or contains a DTD/entity declaration')
  }
  const document = new DOMParser({ onError: onWarningStopParsing }).parseFromString(
    text.replace(/^\uFEFF/, '').trim(),
    'application/xml',
  )
  const root = document.documentElement
  if (root?.localName !== 'tt' || root.namespaceURI !== TTML_NAMESPACE) {
    throw new Error('Expected a TTML document root')
  }
  // xmldom accepts some invalid numeric character references. Check decoded values too.
  const pending: Node[] = [document]
  while (pending.length) {
    const node = pending.pop()!
    if (hasInvalidXmlCharacters(node.nodeValue ?? '')) throw new Error('Invalid XML character')
    if (node.nodeType === node.ELEMENT_NODE) {
      const attributes = (node as Element).attributes
      for (let i = 0; i < attributes.length; i++) {
        if (hasInvalidXmlCharacters(attributes.item(i)?.value ?? ''))
          throw new Error('Invalid XML attribute character')
      }
    }
    for (let child = node.firstChild; child; child = child.nextSibling) pending.push(child)
  }
  for (let child = root.firstChild; child; child = child.nextSibling) {
    if (
      child.nodeType === child.ELEMENT_NODE &&
      child.localName === 'body' &&
      child.namespaceURI === TTML_NAMESPACE
    )
      return document
  }
  throw new Error('Expected a TTML body')
}
