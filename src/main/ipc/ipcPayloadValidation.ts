import { ipcChannels } from '@shared/ipc/channels'
import type { IpcInvokeChannel } from '@shared/ipc/contracts'
import { LIBRARY_CATALOG_MAX_PAGE_SIZE } from '@shared/types/libraryCatalog'

const MAX_TEXT_LENGTH = 8_192
const MAX_QUERY_LENGTH = 4_096
const MAX_CURSOR_LENGTH = 4_096
const MAX_SESSION_ID_LENGTH = 256
const MAX_ID_LIST_LENGTH = 10_000
const MAX_REORDER_LIST_LENGTH = 5_000
const MAX_VALIDATION_NODES = 50_000
const MAX_PAYLOAD_STRING_UNITS = 262_144
const MAX_RULE_DEPTH = 16
const MAX_RULE_NODES = 256

const dangerousPropertyNames = new Set(['__proto__', 'constructor', 'prototype'])

type DesktopLyricsInvokeChannel =
  | 'desktop-lyrics:toggle'
  | 'desktop-lyrics:is-visible'
  | 'desktop-lyrics:toggle-mouse-passthrough'
  | 'desktop-lyrics:is-mouse-passthrough-enabled'
  | 'desktop-lyrics:update'

export type DomainIpcInvokeChannel = Exclude<IpcInvokeChannel, DesktopLyricsInvokeChannel>

export type IpcPayloadKind = 'void' | 'optional' | 'required'

interface ValidationContext {
  nodes: number
  stringUnits: number
}

type Validator = (value: unknown, path: string, context: ValidationContext) => void

interface ShapeField {
  optional?: boolean
  validator: Validator
}

export interface IpcPayloadPolicy {
  kind: IpcPayloadKind
  validator?: Validator
}

class PayloadValidationFailure extends Error {}

export class IpcPayloadValidationError extends Error {
  constructor(channel: string, reason: string) {
    super(`Invalid IPC payload for "${channel}": ${reason}`)
    this.name = 'IpcPayloadValidationError'
  }
}

function fail(path: string, expectation: string): never {
  throw new PayloadValidationFailure(`${path} ${expectation}`)
}

function touch(context: ValidationContext, path: string): void {
  context.nodes += 1
  if (context.nodes > MAX_VALIDATION_NODES) {
    fail(path, 'exceeds the structural size limit')
  }
}

const booleanValue: Validator = (value, path, context) => {
  touch(context, path)
  if (typeof value !== 'boolean') fail(path, 'must be a boolean')
}

function stringValue(options: { max: number; min?: number } = { max: MAX_TEXT_LENGTH }): Validator {
  return (value, path, context) => {
    touch(context, path)
    if (typeof value !== 'string') fail(path, 'must be a string')
    if (value.length < (options.min ?? 0) || value.length > options.max) {
      fail(path, 'has an invalid length')
    }
    context.stringUnits += value.length
    if (context.stringUnits > MAX_PAYLOAD_STRING_UNITS) {
      fail(path, 'exceeds the aggregate string size limit')
    }
  }
}

function finiteNumber(options: { min?: number; max?: number; integer?: boolean } = {}): Validator {
  return (value, path, context) => {
    touch(context, path)
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail(path, 'must be a finite number')
    }
    if (options.integer && !Number.isSafeInteger(value)) {
      fail(path, 'must be a safe integer')
    }
    if (options.min !== undefined && value < options.min) fail(path, 'is below the minimum')
    if (options.max !== undefined && value > options.max) fail(path, 'exceeds the maximum')
  }
}

const positiveId = finiteNumber({ integer: true, min: 1 })
const positiveLimit = finiteNumber({ integer: true, min: 1, max: MAX_ID_LIST_LENGTH })
const archiveYear = finiteNumber({ integer: true, min: 1970, max: new Date().getFullYear() })
const metadataYear = finiteNumber({ integer: true, min: 1, max: 9_999 })

function enumValue(values: readonly string[]): Validator {
  const allowed = new Set(values)
  return (value, path, context) => {
    touch(context, path)
    if (typeof value !== 'string' || !allowed.has(value)) fail(path, 'has an unsupported value')
  }
}

function nullable(validator: Validator): Validator {
  return (value, path, context) => {
    if (value === null) {
      touch(context, path)
      return
    }
    validator(value, path, context)
  }
}

function arrayOf(validator: Validator, options: { max: number; min?: number }): Validator {
  return (value, path, context) => {
    touch(context, path)
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      fail(path, 'must be a plain array')
    }
    if (value.length < (options.min ?? 0) || value.length > options.max) {
      fail(path, 'has an invalid item count')
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) fail(`${path}[${index}]`, 'must be present')
      validator(value[index], `${path}[${index}]`, context)
    }
  }
}

function objectShape(fields: Record<string, ShapeField>): Validator {
  const allowedKeys = new Set(Object.keys(fields))

  return (value, path, context) => {
    touch(context, path)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail(path, 'must be a plain object')
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      fail(path, 'must not have a custom prototype')
    }

    const keys = Reflect.ownKeys(value)
    for (const key of keys) {
      if (typeof key !== 'string') fail(path, 'must not contain symbol properties')
      if (dangerousPropertyNames.has(key)) fail(path, 'contains a forbidden property')
      if (!allowedKeys.has(key)) fail(path, 'contains an unexpected property')
    }

    const descriptors = Object.getOwnPropertyDescriptors(value)
    for (const [key, field] of Object.entries(fields)) {
      const descriptor = descriptors[key]
      if (!descriptor) {
        if (!field.optional) fail(`${path}.${key}`, 'is required')
        continue
      }
      if (!('value' in descriptor)) fail(`${path}.${key}`, 'must be a data property')
      if (descriptor.value === undefined && field.optional) continue
      field.validator(descriptor.value, `${path}.${key}`, context)
    }
  }
}

function required(validator: Validator): IpcPayloadPolicy {
  return { kind: 'required', validator }
}

function optional(validator: Validator): IpcPayloadPolicy {
  return { kind: 'optional', validator }
}

function voidPayload(): IpcPayloadPolicy {
  return { kind: 'void' }
}

function field(validator: Validator, optional = false): ShapeField {
  return { optional, validator }
}

const idPayload = (key: 'id' | 'jobId' | 'rootId' | 'trackId'): Validator =>
  objectShape({ [key]: field(positiveId) })

const namePayload = objectShape({
  id: field(positiveId),
  name: field(stringValue({ min: 1, max: 512 })),
})

const viewModePayload = objectShape({
  id: field(positiveId),
  viewMode: field(enumValue(['flat', 'cover'])),
})

const albumKey = objectShape({
  albumArtist: field(stringValue({ max: MAX_TEXT_LENGTH })),
  album: field(stringValue({ max: MAX_TEXT_LENGTH })),
})

const dateKey: Validator = (value, path, context) => {
  stringValue({ min: 10, max: 10 })(value, path, context)
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(path, 'must use the YYYY-MM-DD format')
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    fail(path, 'must be a valid calendar date')
  }
}

const partialDate: Validator = (value, path, context) => {
  stringValue({ min: 4, max: 10 })(value, path, context)
  if (typeof value !== 'string') return
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(value)
  if (!match) fail(path, 'must use YYYY, YYYY-MM, or YYYY-MM-DD')
  const month = match[2] === undefined ? 1 : Number(match[2])
  const day = match[3] === undefined ? 1 : Number(match[3])
  const date = new Date(Date.UTC(Number(match[1]), month - 1, day))
  if (date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    fail(path, 'must be a valid partial date')
  }
}

const isoTimestamp: Validator = (value, path, context) => {
  stringValue({ min: 20, max: 64 })(value, path, context)
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    fail(path, 'must be an ISO-8601 timestamp with a timezone')
  }
}

const smartPlaylistRule: Validator = (value, path, context) => {
  let ruleNodes = 0

  const countRuleNode = (nodePath: string, depth: number): void => {
    ruleNodes += 1
    if (depth > MAX_RULE_DEPTH) fail(nodePath, 'exceeds the rule depth limit')
    if (ruleNodes > MAX_RULE_NODES) fail(nodePath, 'exceeds the rule node limit')
  }

  const expression: Validator = (node, nodePath, nodeContext) => {
    const validateExpression = (candidate: unknown, candidatePath: string, depth: number): void => {
      countRuleNode(candidatePath, depth)
      const baseShape = objectShape({
        type: field(enumValue(['predicate', 'and', 'or'])),
        field: field(enumValue(['genre', 'artist', 'albumArtist', 'added']), true),
        operator: field(enumValue(['has', 'isEmpty', 'addedBefore', 'addedWithin']), true),
        value: field(stringValue({ min: 1, max: MAX_TEXT_LENGTH }), true),
        operands: field(
          arrayOf((operand, operandPath) => validateExpression(operand, operandPath, depth + 1), {
            min: 1,
            max: 64,
          }),
          true,
        ),
      })
      baseShape(candidate, candidatePath, nodeContext)

      const record = candidate as Record<string, unknown>
      if (record.type === 'predicate') {
        if (!Object.hasOwn(record, 'field') || !Object.hasOwn(record, 'operator')) {
          fail(candidatePath, 'is missing predicate fields')
        }
        if (Object.hasOwn(record, 'operands'))
          fail(candidatePath, 'mixes predicate and boolean fields')
        if (record.operator === 'isEmpty' && Object.hasOwn(record, 'value')) {
          fail(candidatePath, 'must omit value for isEmpty')
        }
        if (record.operator !== 'isEmpty' && !Object.hasOwn(record, 'value')) {
          fail(candidatePath, 'requires a predicate value')
        }
        return
      }

      if (!Object.hasOwn(record, 'operands')) fail(candidatePath, 'requires operands')
      if (
        Object.hasOwn(record, 'field') ||
        Object.hasOwn(record, 'operator') ||
        Object.hasOwn(record, 'value')
      ) {
        fail(candidatePath, 'mixes boolean and predicate fields')
      }
    }

    validateExpression(node, nodePath, 1)
  }

  const legacyCondition = objectShape({
    field: field(enumValue(['genre', 'albumArtist'])),
    value: field(nullable(stringValue({ max: MAX_TEXT_LENGTH }))),
  })

  const ruleShape = objectShape({
    conditions: field(arrayOf(legacyCondition, { min: 1, max: 128 }), true),
    expression: field(expression, true),
  })
  ruleShape(value, path, context)

  const record = value as Record<string, unknown>
  const hasConditions = Object.hasOwn(record, 'conditions')
  const hasExpression = Object.hasOwn(record, 'expression')
  if (hasConditions === hasExpression) fail(path, 'must contain exactly one rule representation')
}

const rankingPayload = objectShape({
  range: field(enumValue(['day', 'week', 'month', 'year'])),
  target: field(enumValue(['track', 'album'])),
  date: field(dateKey, true),
  weekStartDate: field(dateKey, true),
  year: field(archiveYear, true),
  month: field(finiteNumber({ integer: true, min: 1, max: 12 }), true),
})

const editableMetadata = objectShape({
  trackId: field(positiveId),
  title: field(nullable(stringValue({ max: MAX_TEXT_LENGTH }))),
  artistDisplay: field(nullable(stringValue({ max: MAX_TEXT_LENGTH }))),
  albumTitle: field(nullable(stringValue({ max: MAX_TEXT_LENGTH }))),
  albumArtistDisplay: field(nullable(stringValue({ max: MAX_TEXT_LENGTH }))),
  genreDisplay: field(nullable(stringValue({ max: MAX_TEXT_LENGTH }))),
  year: field(nullable(metadataYear)),
  releaseDate: field(nullable(partialDate)),
})

export const domainIpcPayloadPolicies = {
  [ipcChannels.database.exportBackup]: voidPayload(),
  [ipcChannels.database.restoreBackup]: voidPayload(),
  [ipcChannels.app.getInfo]: voidPayload(),
  [ipcChannels.app.exportDiagnostics]: voidPayload(),
  [ipcChannels.library.getStats]: voidPayload(),
  [ipcChannels.library.selectRoot]: voidPayload(),
  [ipcChannels.library.getRoots]: voidPayload(),
  [ipcChannels.library.startScan]: required(idPayload('rootId')),
  [ipcChannels.library.cancelScan]: required(idPayload('jobId')),
  [ipcChannels.library.getScanStatus]: optional(objectShape({ jobId: field(positiveId, true) })),
  [ipcChannels.library.getTracks]: voidPayload(),
  [ipcChannels.library.getTrackPage]: required(
    objectShape({
      cursor: field(stringValue({ min: 1, max: MAX_CURSOR_LENGTH }), true),
      limit: field(
        finiteNumber({ integer: true, min: 1, max: LIBRARY_CATALOG_MAX_PAGE_SIZE }),
        true,
      ),
      refresh: field(booleanValue, true),
    }),
  ),
  [ipcChannels.smartPlaylists.list]: voidPayload(),
  [ipcChannels.smartPlaylists.listTrackCounts]: voidPayload(),
  [ipcChannels.smartPlaylists.getDetail]: required(idPayload('id')),
  [ipcChannels.smartPlaylists.create]: required(
    objectShape({
      name: field(stringValue({ min: 1, max: 512 })),
      rule: field(smartPlaylistRule),
    }),
  ),
  [ipcChannels.smartPlaylists.createFromQuery]: required(
    objectShape({ query: field(stringValue({ min: 1, max: MAX_QUERY_LENGTH })) }),
  ),
  [ipcChannels.smartPlaylists.rename]: required(namePayload),
  [ipcChannels.smartPlaylists.updateViewMode]: required(viewModePayload),
  [ipcChannels.smartPlaylists.delete]: required(idPayload('id')),
  [ipcChannels.smartPlaylists.reorder]: required(
    objectShape({ ids: field(arrayOf(positiveId, { max: MAX_REORDER_LIST_LENGTH })) }),
  ),
  [ipcChannels.playlists.list]: voidPayload(),
  [ipcChannels.playlists.listTrackCounts]: voidPayload(),
  [ipcChannels.playlists.listSidebarItems]: voidPayload(),
  [ipcChannels.playlists.getDetail]: required(idPayload('id')),
  [ipcChannels.playlists.create]: voidPayload(),
  [ipcChannels.playlists.rename]: required(namePayload),
  [ipcChannels.playlists.updateViewMode]: required(viewModePayload),
  [ipcChannels.playlists.delete]: required(idPayload('id')),
  [ipcChannels.playlists.addTracks]: required(
    objectShape({
      id: field(positiveId),
      trackIds: field(arrayOf(positiveId, { max: MAX_ID_LIST_LENGTH })),
    }),
  ),
  [ipcChannels.playlists.reorderSidebarItems]: required(
    objectShape({
      items: field(
        arrayOf(
          objectShape({
            kind: field(enumValue(['playlist', 'smart'])),
            id: field(positiveId),
          }),
          { max: MAX_REORDER_LIST_LENGTH },
        ),
      ),
    }),
  ),
  [ipcChannels.lyrics.getByTrackId]: required(idPayload('trackId')),
  [ipcChannels.playback.getAudioUrl]: required(idPayload('trackId')),
  [ipcChannels.playback.getRandomTrack]: optional(
    objectShape({ excludeTrackId: field(positiveId, true) }),
  ),
  [ipcChannels.playback.getRandomAlbumTracks]: optional(
    objectShape({ excludeAlbumKey: field(albumKey, true) }),
  ),
  [ipcChannels.playback.getAlbumTracks]: required(objectShape({ albumKey: field(albumKey) })),
  [ipcChannels.playback.recordEffectivePlay]: required(
    objectShape({
      trackId: field(positiveId),
      sessionId: field(stringValue({ min: 1, max: MAX_SESSION_ID_LENGTH })),
      playedAtIso: field(isoTimestamp),
    }),
  ),
  [ipcChannels.archive.getListeningHeatmap]: required(objectShape({ year: field(archiveYear) })),
  [ipcChannels.archive.getDailyListeningDetail]: required(objectShape({ date: field(dateKey) })),
  [ipcChannels.archive.getAnnualListeningInsights]: required(
    objectShape({ year: field(archiveYear) }),
  ),
  [ipcChannels.archive.getListeningRanking]: required(rankingPayload),
  [ipcChannels.archive.getListeningGenreSpectrum]: required(
    objectShape({ year: field(archiveYear) }),
  ),
  [ipcChannels.archive.resetPlayStats]: voidPayload(),
  [ipcChannels.metadata.refreshTrack]: required(idPayload('trackId')),
  [ipcChannels.metadata.refreshTracks]: required(
    objectShape({ trackIds: field(arrayOf(positiveId, { min: 1, max: MAX_ID_LIST_LENGTH })) }),
  ),
  [ipcChannels.metadata.refreshMissing]: optional(
    objectShape({ limit: field(positiveLimit, true) }),
  ),
  [ipcChannels.metadata.refreshLyricsMissing]: optional(
    objectShape({ limit: field(positiveLimit, true) }),
  ),
  [ipcChannels.metadata.getRefreshStatus]: required(idPayload('jobId')),
  [ipcChannels.metadata.listRefreshFailures]: optional(
    objectShape({ limit: field(positiveLimit, true) }),
  ),
  [ipcChannels.metadata.clearRefreshFailures]: voidPayload(),
  [ipcChannels.metadata.getTrackMetadata]: required(idPayload('trackId')),
  [ipcChannels.metadata.updateTrackMetadata]: required(editableMetadata),
  [ipcChannels.window.enterMiniPlayer]: voidPayload(),
  [ipcChannels.window.restoreFromMiniPlayer]: voidPayload(),
  [ipcChannels.window.getMiniPlayerState]: voidPayload(),
  [ipcChannels.window.setMiniPlayerPopover]: required(
    objectShape({
      open: field(booleanValue),
      direction: field(enumValue(['above', 'below'])),
      height: field(finiteNumber({ integer: true, min: 0, max: 4_096 })),
    }),
  ),
} satisfies Record<DomainIpcInvokeChannel, IpcPayloadPolicy>

export function parseDomainIpcPayload(
  channel: DomainIpcInvokeChannel,
  args: readonly unknown[],
): unknown {
  const policy: IpcPayloadPolicy = domainIpcPayloadPolicies[channel]

  try {
    if (args.length > 1) fail('payload', 'must be the only invoke argument')

    const value = args[0]
    if (policy.kind === 'void') {
      if (value !== undefined) fail('payload', 'must be omitted')
      return undefined
    }

    if (value === undefined) {
      if (policy.kind === 'optional') return undefined
      fail('payload', 'is required')
    }

    policy.validator?.(value, 'payload', { nodes: 0, stringUnits: 0 })
    return value
  } catch (error) {
    const reason =
      error instanceof PayloadValidationFailure ? error.message : 'could not be validated safely'
    throw new IpcPayloadValidationError(channel, reason)
  }
}
