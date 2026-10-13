import { createHash } from 'node:crypto'
import type { Document, Element, Node } from '@xmldom/xmldom'
import {
  MAX_CONVERSION_ITEMS,
  MAX_LYRICS_CHARACTERS,
  parseTtmlDocument,
  TTML_METADATA_NAMESPACE,
  TTML_NAMESPACE,
} from './ttmlDocument'
import {
  DuetLyricsError,
  type DuetIssue,
  type DuetLine,
  type DuetLyricsSnapshot,
  type DuetPerformer,
} from './duetTypes'

export const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'
export const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/'
const AUXILIARY_ROLES = new Set(['x-translation', 'x-roman', 'x-bg'])

export function elementChildren(element: Element): Element[] {
  const result: Element[] = []
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === node.ELEMENT_NODE) result.push(node as Element)
  }
  return result
}

export function isTtmlElement(element: Element, name: string): boolean {
  return element.namespaceURI === TTML_NAMESPACE && element.localName === name
}

export function ownAgent(element: Element): string | null {
  return element.getAttributeNS(TTML_METADATA_NAMESPACE, 'agent')
}

function agentIds(value: string | null): string[] {
  return [...new Set((value ?? '').trim().split(/\s+/).filter(Boolean))].sort()
}

function nearestAgent(element: Element): string | null {
  for (let current: Node | null = element; current?.nodeType === 1; current = current.parentNode) {
    const value = ownAgent(current as Element)
    if (value !== null) return value
  }
  return null
}

function lineSummary(element: Element): string {
  function text(node: Node): string {
    if (node.nodeType === node.TEXT_NODE || node.nodeType === node.CDATA_SECTION_NODE)
      return node.nodeValue ?? ''
    if (node.nodeType !== node.ELEMENT_NODE) return ''
    const child = node as Element
    if (
      child !== element &&
      AUXILIARY_ROLES.has(child.getAttributeNS(TTML_METADATA_NAMESPACE, 'role') ?? '')
    )
      return ''
    const ruby = child.getAttributeNS(`${TTML_NAMESPACE}#styling`, 'ruby')
    if (ruby === 'text' || ruby === 'textContainer') return ''
    if (isTtmlElement(child, 'br')) return '\n'
    let result = ''
    for (let part = child.firstChild; part; part = part.nextSibling) result += text(part)
    return result
  }
  return text(element)
    .replace(/[\t\r\n ]+/g, ' ')
    .trim()
}

function lineAssignments(element: Element): string[][] {
  const assignments = new Map<string, string[]>()
  function add(value: string | null): void {
    const ids = agentIds(value)
    assignments.set(JSON.stringify(ids), ids)
  }
  function walk(current: Element, inherited: string | null): void {
    const own = ownAgent(current)
    const effective = own ?? inherited
    // Keep all explicit word/auxiliary assignments visible, including empty spans.
    if (current !== element && own !== null) add(own)
    for (let child = current.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === child.ELEMENT_NODE) walk(child as Element, effective)
      else if (
        (child.nodeType === child.TEXT_NODE || child.nodeType === child.CDATA_SECTION_NODE) &&
        child.nodeValue?.trim()
      )
        add(effective)
    }
  }
  walk(element, nearestAgent(element))
  if (!assignments.size) add(nearestAgent(element))
  return [...assignments.values()]
}

export interface DuetDocument {
  document: Document
  body: Element
  elements: Element[]
  agents: Map<string, Element>
  lines: Map<string, Element>
  usedIds: Set<string>
  snapshot: DuetLyricsSnapshot
}

export function readDuetDocument(text: string): DuetDocument {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_LYRICS_CHARACTERS)
    throw new DuetLyricsError('invalid-ttml', 'Expected TTML within the input size limit')
  let document: Document
  try {
    document = parseTtmlDocument(text)
  } catch {
    throw new DuetLyricsError('invalid-ttml', 'Malformed or unsupported TTML document')
  }
  const root = document.documentElement!
  const bodies = elementChildren(root).filter((element) => isTtmlElement(element, 'body'))
  const heads = elementChildren(root).filter((element) => isTtmlElement(element, 'head'))
  if (bodies.length !== 1 || heads.length > 1)
    throw new DuetLyricsError('invalid-ttml', 'Expected one body and at most one head')
  const body = bodies[0]
  const elements: Element[] = []
  function collect(element: Element, depth: number): void {
    if (depth > 128 || elements.length >= MAX_CONVERSION_ITEMS)
      throw new DuetLyricsError('invalid-ttml', 'TTML exceeds the editing structure limit')
    elements.push(element)
    for (const child of elementChildren(element)) collect(child, depth + 1)
  }
  collect(root, 0)
  const issues: DuetIssue[] = []
  const usedIds = new Set<string>()
  for (const element of elements) {
    const id = element.getAttributeNS(XML_NAMESPACE, 'id')
    if (id !== null) {
      if (usedIds.has(id)) issues.push({ code: 'duplicate-id', performerId: id })
      usedIds.add(id)
    }
  }
  const agents = new Map<string, Element>()
  const definitions = new Set<Element>()
  const performers: DuetPerformer[] = []
  for (const head of heads) {
    for (const metadata of elementChildren(head).filter((element) =>
      isTtmlElement(element, 'metadata'),
    )) {
      for (const agent of elementChildren(metadata).filter(
        (element) =>
          element.namespaceURI === TTML_METADATA_NAMESPACE && element.localName === 'agent',
      )) {
        definitions.add(agent)
        const id = agent.getAttributeNS(XML_NAMESPACE, 'id') ?? ''
        const type = agent.getAttribute('type')
        if (
          !/^[\p{L}_][\p{L}\p{N}\p{M}_.\-\u00b7]*$/u.test(id) ||
          !['person', 'group', 'other'].includes(type ?? '')
        )
          issues.push({ code: 'invalid-agent', performerId: id })
        const names = elementChildren(agent).filter(
          (element) =>
            element.namespaceURI === TTML_METADATA_NAMESPACE && element.localName === 'name',
        )
        const name = names.find((element) => element.getAttribute('type') === 'full') ?? names[0]
        performers.push({ id, type, name: name?.textContent ?? null })
        if (id) agents.set(id, agent)
      }
    }
  }
  const people = performers.filter(
    (performer) => performer.type === 'person' || performer.type === 'other',
  )
  const groups = performers.filter((performer) => performer.type === 'group')
  if (people.length > 2 || groups.length > 1) issues.push({ code: 'unsupported-performers' })
  const roles = {
    performer1: people[0]?.id ?? null,
    performer2: people[1]?.id ?? null,
    together: groups[0]?.id ?? null,
  }
  // Root-level assignments and agent definitions outside head/metadata cannot be edited safely.
  if (
    ownAgent(root) !== null ||
    elements.some(
      (element) =>
        element.namespaceURI === TTML_METADATA_NAMESPACE &&
        element.localName === 'agent' &&
        !definitions.has(element),
    )
  )
    issues.push({ code: 'unsupported-structure' })
  for (const element of elements) {
    const value = ownAgent(element)
    if (value === null) continue
    const ids = agentIds(value)
    if (!ids.length) issues.push({ code: 'invalid-agent' })
    for (const id of ids)
      if (!agents.has(id)) issues.push({ code: 'unknown-performer', performerId: id })
  }
  const lines = new Map<string, Element>()
  const views: DuetLine[] = []
  function readLines(element: Element, insideLine = false): void {
    const isLine = isTtmlElement(element, 'p')
    if (isLine) {
      if (insideLine) issues.push({ code: 'unsupported-structure' })
      const id = `line-${lines.size}`
      const assignments = lineAssignments(element)
      const ids = [...new Set(assignments.flat())]
      const mixed = assignments.length > 1 || assignments.some((set) => set.length > 1)
      let assignment: DuetLine['assignment'] = 'unassigned'
      if (mixed) assignment = 'mixed'
      else if (ids.length) {
        assignment =
          ids[0] === roles.performer1
            ? 'performer-1'
            : ids[0] === roles.performer2
              ? 'performer-2'
              : ids[0] === roles.together
                ? 'together'
                : 'unknown'
      }
      lines.set(id, element)
      views.push({
        id,
        xmlId: element.getAttributeNS(XML_NAMESPACE, 'id'),
        text: lineSummary(element),
        timing: {
          begin: element.getAttribute('begin'),
          end: element.getAttribute('end'),
          duration: element.getAttribute('dur'),
        },
        assignment,
        performerIds: ids,
        editable: !mixed && assignment !== 'unknown',
      })
    }
    for (const child of elementChildren(element)) readLines(child, insideLine || isLine)
  }
  readLines(body)
  const editable = issues.length === 0
  if (!editable)
    views.forEach((line) => {
      line.editable = false
    })
  return {
    document,
    body,
    elements,
    agents,
    lines,
    usedIds,
    snapshot: {
      revision: createHash('sha256').update(text, 'utf8').digest('hex'),
      performers,
      roles,
      lines: views,
      editable,
      issues,
    },
  }
}
