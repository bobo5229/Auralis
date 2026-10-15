import { XMLSerializer, type Element } from '@xmldom/xmldom'
import {
  elementChildren,
  isTtmlElement,
  ownAgent,
  readDuetDocument,
  XML_NAMESPACE,
  XMLNS_NAMESPACE,
  type DuetDocument,
} from './duetDocument'
import {
  DuetLyricsError,
  type AssignDuetLinesRequest,
  type ConfigureDuetRequest,
  type DuetEditResult,
  type DuetLyricsSnapshot,
  type RenameDuetPerformerRequest,
} from './duetTypes'
import { hasInvalidXmlCharacters, TTML_METADATA_NAMESPACE, TTML_NAMESPACE } from './ttmlDocument'

export { DuetLyricsError } from './duetTypes'
export type {
  AssignDuetLinesRequest,
  ConfigureDuetRequest,
  DuetAssignment,
  DuetEditResult,
  DuetIssue,
  DuetLine,
  DuetLyricsSnapshot,
  DuetPerformer,
  RenameDuetPerformerRequest,
} from './duetTypes'

/** Pure, revision-scoped editing. Never writes a file or changes the library. */
export function readDuetLyrics(text: string): DuetLyricsSnapshot {
  return readDuetDocument(text).snapshot
}

function editableDocument(text: string, request: { expectedRevision: string }): DuetDocument {
  if (!request || typeof request !== 'object' || typeof request.expectedRevision !== 'string')
    throw new DuetLyricsError('invalid-request', 'Expected a source revision')
  const source = readDuetDocument(text)
  if (request.expectedRevision !== source.snapshot.revision)
    throw new DuetLyricsError(
      'stale-revision',
      'The TTML source changed; reload its line identities before editing',
    )
  if (!source.snapshot.editable)
    throw new DuetLyricsError(
      'unsupported-document',
      'Resolve the reported performer or document issues before editing',
    )
  return source
}

function checkedName(name: string): string {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 200 ||
    hasInvalidXmlCharacters(name)
  )
    throw new DuetLyricsError(
      'invalid-request',
      'Performer names must contain 1 to 200 valid characters',
    )
  return name.trim()
}

function metadataPrefix(source: DuetDocument, context?: Element): string {
  const root = source.document.documentElement!
  const scope = context ?? root
  const existing = scope.lookupPrefix(TTML_METADATA_NAMESPACE)
  if (existing && scope.lookupNamespaceURI(existing) === TTML_METADATA_NAMESPACE) return existing
  let prefix = 'ttm'
  let suffix = 1
  while (
    (root.lookupNamespaceURI(prefix) &&
      root.lookupNamespaceURI(prefix) !== TTML_METADATA_NAMESPACE) ||
    (scope.lookupNamespaceURI(prefix) &&
      scope.lookupNamespaceURI(prefix) !== TTML_METADATA_NAMESPACE)
  )
    prefix = `ttm${suffix++}`
  root.setAttributeNS(XMLNS_NAMESPACE, `xmlns:${prefix}`, TTML_METADATA_NAMESPACE)
  return prefix
}

function putAgent(source: DuetDocument, element: Element, value: string): void {
  // Preserve local aliases where possible. Never overwrite an unrelated namespace binding.
  const attribute = element.getAttributeNodeNS(TTML_METADATA_NAMESPACE, 'agent')
  const prefix =
    attribute?.prefix && element.lookupNamespaceURI(attribute.prefix) === TTML_METADATA_NAMESPACE
      ? attribute.prefix
      : metadataPrefix(source, element)
  element.setAttributeNS(TTML_METADATA_NAMESPACE, `${prefix}:agent`, value)
}

function setName(source: DuetDocument, agent: Element, name: string): boolean {
  const names = elementChildren(agent).filter(
    (element) => element.namespaceURI === TTML_METADATA_NAMESPACE && element.localName === 'name',
  )
  let full =
    names.find((element) => element.getAttribute('type') === 'full') ??
    names.find((element) => !element.hasAttribute('type'))
  if ((full ?? names[0])?.textContent === name) return false
  if (!full) {
    full = source.document.createElementNS(
      TTML_METADATA_NAMESPACE,
      `${metadataPrefix(source, agent)}:name`,
    )
    agent.appendChild(full)
  }
  full.setAttribute('type', 'full')
  full.textContent = name
  return true
}

function newAgent(source: DuetDocument, preferredId: string, type: 'person' | 'group'): Element {
  let id = preferredId
  let suffix = 2
  while (source.usedIds.has(id)) id = `${preferredId}-${suffix++}`
  source.usedIds.add(id)
  const root = source.document.documentElement!
  let head = elementChildren(root).find((element) => isTtmlElement(element, 'head'))
  if (!head) {
    head = source.document.createElementNS(
      TTML_NAMESPACE,
      `${root.prefix ? `${root.prefix}:` : ''}head`,
    )
    root.insertBefore(head, source.body)
  }
  let metadata = elementChildren(head).find((element) => isTtmlElement(element, 'metadata'))
  if (!metadata) {
    metadata = source.document.createElementNS(
      TTML_NAMESPACE,
      `${head.prefix ? `${head.prefix}:` : ''}metadata`,
    )
    head.insertBefore(metadata, head.firstChild)
  }
  // Append after existing definitions, including documents with multiple metadata blocks.
  // This preserves the two-person role order after a missing performer is added.
  const lastAgent = [...source.agents.values()].at(-1)
  if (lastAgent && lastAgent.parentNode?.nodeType === lastAgent.ELEMENT_NODE)
    metadata = lastAgent.parentNode as Element
  const agent = source.document.createElementNS(
    TTML_METADATA_NAMESPACE,
    `${metadataPrefix(source, metadata)}:agent`,
  )
  agent.setAttribute('type', type)
  agent.setAttributeNS(XML_NAMESPACE, 'xml:id', id)
  metadata.appendChild(agent)
  source.agents.set(id, agent)
  return agent
}

function result(source: DuetDocument, original: string, changed: boolean): DuetEditResult {
  if (!changed) return { text: original, changed: false, snapshot: source.snapshot }
  const text = new XMLSerializer().serializeToString(source.document)
  const snapshot = readDuetLyrics(text)
  if (!snapshot.editable)
    throw new DuetLyricsError(
      'unsupported-document',
      'The edited document did not pass performer validation',
    )
  return { text, changed: true, snapshot }
}

/** Phase-one editor: create only missing person slots, without names or a chorus group. */
export function ensureDuetPerformerSlots(text: string, expectedRevision: string): DuetEditResult {
  const source = editableDocument(text, { expectedRevision })
  let changed = false
  for (const [existing, preferred] of [
    [source.snapshot.roles.performer1, 'v1'],
    [source.snapshot.roles.performer2, 'v2'],
  ] as const) {
    if (!existing) {
      newAgent(source, preferred, 'person')
      changed = true
    }
  }
  return result(source, text, changed)
}

/** Create the nameless same-line chorus only when it is actually assigned. */
export function ensureDuetTogetherSlot(text: string, expectedRevision: string): DuetEditResult {
  const source = editableDocument(text, { expectedRevision })
  if (source.snapshot.roles.together) return result(source, text, false)
  newAgent(source, 'v1000', 'group')
  return result(source, text, true)
}

/** Create missing roles and update the two names. Existing IDs and per-line assignments stay intact. */
export function configureDuetPerformers(
  text: string,
  request: ConfigureDuetRequest,
): DuetEditResult {
  const source = editableDocument(text, request)
  const firstName = checkedName(request.performer1Name)
  const secondName = checkedName(request.performer2Name)
  const groupName =
    request.togetherName === undefined ? undefined : checkedName(request.togetherName)
  let changed = false
  const definitions = [
    {
      existing: source.snapshot.roles.performer1,
      preferred: 'v1',
      type: 'person' as const,
      name: firstName,
    },
    {
      existing: source.snapshot.roles.performer2,
      preferred: 'v2',
      type: 'person' as const,
      name: secondName,
    },
    {
      existing: source.snapshot.roles.together,
      preferred: 'v1000',
      type: 'group' as const,
      name: groupName,
    },
  ]
  for (const definition of definitions) {
    let agent = definition.existing ? source.agents.get(definition.existing) : undefined
    if (!agent) {
      agent = newAgent(source, definition.preferred, definition.type)
      changed = true
    }
    if (definition.name !== undefined) changed = setName(source, agent, definition.name) || changed
  }
  return result(source, text, changed)
}

export function renameDuetPerformer(
  text: string,
  request: RenameDuetPerformerRequest,
): DuetEditResult {
  const source = editableDocument(text, request)
  const name = checkedName(request.name)
  const agent = source.agents.get(request.performerId)
  if (!agent)
    throw new DuetLyricsError('unknown-performer', 'Performer ID is not defined in this document')
  return result(source, text, setName(source, agent, name))
}

/** Move assignments down only along edited branches, preserving unselected siblings' inheritance. */
function distributeInheritedAgents(source: DuetDocument, selected: Element[]): void {
  const branches = new Set<Element>()
  const targets = new Set(selected)
  for (const line of selected) {
    for (
      let node = line.parentNode;
      node && node.nodeType === node.ELEMENT_NODE;
      node = node.parentNode
    ) {
      branches.add(node as Element)
      if (node === source.body) break
    }
  }
  // Reject meaningful direct text that could lose its inherited role without changing its structure.
  for (const branch of branches) {
    for (let child = branch.firstChild; child; child = child.nextSibling) {
      if (
        (child.nodeType === child.TEXT_NODE || child.nodeType === child.CDATA_SECTION_NODE) &&
        child.nodeValue?.trim()
      )
        throw new DuetLyricsError(
          'unsupported-inheritance',
          'Cannot move an inherited assignment across text outside a lyric paragraph',
        )
    }
  }
  function walk(element: Element): void {
    if (targets.has(element) || !branches.has(element)) return
    const value = ownAgent(element)
    const children = elementChildren(element)
    if (value !== null) {
      element.removeAttributeNS(TTML_METADATA_NAMESPACE, 'agent')
      for (const child of children) {
        if (ownAgent(child) === null) putAgent(source, child, value)
      }
    }
    for (const child of children) walk(child)
  }
  walk(source.body)
}

export function assignDuetLines(text: string, request: AssignDuetLinesRequest): DuetEditResult {
  const source = editableDocument(text, request)
  if (
    !Array.isArray(request.lineIds) ||
    request.lineIds.length > MAX_BATCH_LINES ||
    request.lineIds.some((id) => typeof id !== 'string') ||
    !['unassigned', 'performer-1', 'performer-2', 'together'].includes(request.assignment)
  )
    throw new DuetLyricsError(
      'invalid-request',
      'Expected a bounded list of line identities and a supported assignment',
    )
  const selectedIds = new Set(request.lineIds)
  const views = new Map(source.snapshot.lines.map((line) => [line.id, line]))
  for (const id of selectedIds) {
    const line = views.get(id)
    if (!line)
      throw new DuetLyricsError('unknown-line', 'Line identity is not part of this revision')
    if (!line.editable)
      throw new DuetLyricsError(
        'read-only-line',
        'Mixed or unknown per-word assignments are read-only',
      )
  }
  if (!selectedIds.size) return result(source, text, false)
  const agentId =
    request.assignment === 'performer-1'
      ? source.snapshot.roles.performer1
      : request.assignment === 'performer-2'
        ? source.snapshot.roles.performer2
        : request.assignment === 'together'
          ? source.snapshot.roles.together
          : null
  if (request.assignment !== 'unassigned' && !agentId)
    throw new DuetLyricsError(
      'unconfigured-role',
      'Configure the requested performer before assigning lines',
    )
  const changed = [...selectedIds].filter((id) => views.get(id)!.assignment !== request.assignment)
  if (!changed.length) return result(source, text, false)
  const targets = changed.map((id) => source.lines.get(id)!)
  distributeInheritedAgents(source, targets)
  for (const target of targets) {
    // Uniform word assignments can be replaced as a whole; mixed lines were rejected above.
    function removeAssignments(element: Element): void {
      element.removeAttributeNS(TTML_METADATA_NAMESPACE, 'agent')
      for (const child of elementChildren(element)) removeAssignments(child)
    }
    removeAssignments(target)
    if (agentId) putAgent(source, target, agentId)
  }
  return result(source, text, true)
}

const MAX_BATCH_LINES = 100000
