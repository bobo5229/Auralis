import * as v from 'valibot'
import { ipcChannels } from '@shared/ipc/channels'
import type { IpcInvokeChannel } from '@shared/ipc/contracts'
import { LIBRARY_CATALOG_MAX_PAGE_SIZE } from '@shared/types/libraryCatalog'
import { assertRecentAddedDays } from '@shared/smartPlaylists/recentAdded'

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

export type DomainIpcInvokeChannel = IpcInvokeChannel

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

function parseSchema<TSchema extends v.GenericSchema>(
  schema: TSchema,
  value: unknown,
  path: string,
): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, value, { abortEarly: true, abortPipeEarly: true })
  if (!result.success) {
    const issue = result.issues[0]
    const suffix = (issue.path ?? [])
      .map(({ key }) => (typeof key === 'number' ? `[${key}]` : `.${key}`))
      .join('')
    // Every schema supplies a fixed message. Never expose received values or
    // serialize Valibot issues, which retain references to the input payload.
    fail(`${path}${suffix}`, issue.message)
  }
  return result.output
}

function schemaValidator(schema: v.GenericSchema): Validator {
  return (value, path, context) => {
    touch(context, path)
    parseSchema(schema, value, path)
  }
}

const booleanValue = schemaValidator(v.boolean('must be a boolean'))

function stringValue(options: { max: number; min?: number } = { max: MAX_TEXT_LENGTH }): Validator {
  const schema = v.pipe(
    v.string('must be a string'),
    v.minLength(options.min ?? 0, 'has an invalid length'),
    v.maxLength(options.max, 'has an invalid length'),
  )
  return (value, path, context) => {
    touch(context, path)
    const text = parseSchema(schema, value, path)
    context.stringUnits += text.length
    if (context.stringUnits > MAX_PAYLOAD_STRING_UNITS) {
      fail(path, 'exceeds the aggregate string size limit')
    }
  }
}

function finiteNumber(options: { min?: number; max?: number; integer?: boolean } = {}): Validator {
  const number = v.pipe(v.number('must be a finite number'), v.finite('must be a finite number'))
  return schemaValidator(
    v.pipe(
      options.integer ? v.pipe(number, v.safeInteger('must be a safe integer')) : number,
      v.minValue(options.min ?? -Infinity, 'is below the minimum'),
      v.maxValue(options.max ?? Infinity, 'exceeds the maximum'),
    ),
  )
}

const positiveId = finiteNumber({ integer: true, min: 1 })
function dataProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}

const recentAddedDays: Validator = (value, path, context) => {
  finiteNumber({ min: 1, integer: true })(value, path, context)
  try {
    assertRecentAddedDays(value as number)
  } catch {
    fail(path, 'must be 7, 30, 90 or 365 days')
  }
}
const nativePlaybackCommand: Validator = (value, path, context) => {
  const action = dataProperty(value, 'action')
  const fields: Record<string, ShapeField> = {
    session: field(finiteNumber({ integer: true, min: 0 })),
    action: field(
      enumValue(['start', 'next', 'pause', 'resume', 'stop', 'cancel-next', 'seek', 'volume']),
    ),
  }
  if (action === 'start' || action === 'next') fields.trackId = field(positiveId)
  if (action === 'start' || action === 'volume') {
    fields.volume = field(finiteNumber({ min: 0, max: 1 }))
    fields.muted = field(booleanValue)
  }
  if (action === 'next') {
    fields.trimDigitalSilence = field(booleanValue)
    fields.softTransition = field(booleanValue, true)
  }
  if (action === 'seek') fields.time = field(finiteNumber({ min: 0, max: 604800 }))
  objectShape(fields)(value, path, context)
}
const positiveLimit = finiteNumber({ integer: true, min: 1, max: MAX_ID_LIST_LENGTH })
const archiveYear = finiteNumber({ integer: true })
const metadataYear = finiteNumber({ integer: true })

function enumValue(values: readonly string[]): Validator {
  return schemaValidator(v.picklist(values, 'has an unsupported value'))
}

function nullable(validator: Validator): Validator {
  return (value, path, context) => {
    if (value === null) touch(context, path)
    parseSchema(
      v.nullable(
        v.custom((candidate) => {
          validator(candidate, path, context)
          return true
        }, 'has an invalid value'),
      ),
      value,
      path,
    )
  }
}

function arrayOf(validator: Validator, options: { max: number; min?: number }): Validator {
  const bounds = v.pipe(
    v.custom<unknown[]>(
      (value) => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype,
      'must be a plain array',
    ),
    v.minLength(options.min ?? 0, 'has an invalid item count'),
    v.maxLength(options.max, 'has an invalid item count'),
  )
  return (value, path, context) => {
    touch(context, path)
    // Reject oversized arrays before Valibot begins item traversal. Its array
    // schema accepts holes, whereas the IPC contract requires own indices.
    const items = parseSchema(bounds, value, path)
    for (let index = 0; index < items.length; index += 1) {
      if (!Object.hasOwn(items, index)) fail(`${path}[${index}]`, 'must be present')
    }
    let index = 0
    parseSchema(
      v.array(
        v.custom((item) => {
          validator(item, `${path}[${index++}]`, context)
          return true
        }, 'has an invalid item'),
        'must be a plain array',
      ),
      items,
      path,
    )
  }
}

function objectShape(fields: Record<string, ShapeField>): Validator {
  const entries = Object.entries(fields)
  const allowedKeys = new Set(entries.map(([key]) => key))

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
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key]
      if (!('value' in descriptor)) fail(`${path}.${key}`, 'must be a data property')
    }
    const schemaEntries: v.ObjectEntries = Object.create(null)
    for (const [key, field] of entries) {
      const schema = v.custom((candidate) => {
        field.validator(candidate, `${path}.${key}`, context)
        return true
      }, 'has an invalid value')
      schemaEntries[key] = field.optional ? v.optional(schema) : schema
    }
    // Preserve own non-enumerable data fields and ignore inherited properties,
    // as the previous validator did. Parsing never replaces the caller's input.
    const record = Object.create(null, descriptors)
    parseSchema(v.strictObject(schemaEntries, 'is required'), record, path)
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
}

const partialDate: Validator = (value, path, context) => {
  stringValue({ min: 4, max: 10 })(value, path, context)
  if (typeof value !== 'string' || !/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.test(value)) {
    fail(path, 'must use YYYY, YYYY-MM, or YYYY-MM-DD')
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
  if (value && typeof value === 'object' && 'preset' in value) {
    const preset = dataProperty(value, 'preset')
    if (preset === 'mostListened') {
      objectShape({ preset: field(enumValue(['mostListened'])) })(value, path, context)
      return
    }
    objectShape({
      preset: field(enumValue(['recentPlayed', 'recentAdded'])),
      days: field(
        preset === 'recentAdded' ? recentAddedDays : finiteNumber({ min: 1, integer: true }),
      ),
    })(value, path, context)
    return
  }
  let ruleNodes = 0

  const countRuleNode = (nodePath: string, depth: number): void => {
    ruleNodes += 1
    if (depth > MAX_RULE_DEPTH) fail(nodePath, 'exceeds the rule depth limit')
    if (ruleNodes > MAX_RULE_NODES) fail(nodePath, 'exceeds the rule node limit')
  }

  const expression: Validator = (node, nodePath, nodeContext) => {
    const validateExpression = (candidate: unknown, candidatePath: string, depth: number): void => {
      countRuleNode(candidatePath, depth)
      objectShape({
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
      })(candidate, candidatePath, nodeContext)
    }

    validateExpression(node, nodePath, 1)
  }

  const legacyCondition = objectShape({
    field: field(enumValue(['genre', 'albumArtist'])),
    value: field(nullable(stringValue({ max: MAX_TEXT_LENGTH }))),
  })

  objectShape({
    conditions: field(arrayOf(legacyCondition, { min: 1, max: 128 }), true),
    expression: field(expression, true),
  })(value, path, context)
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
  [ipcChannels.library.getAlbumDetail]: required(
    objectShape({
      albumArtist: field(stringValue({ max: MAX_TEXT_LENGTH })),
      albumTitle: field(stringValue({ max: MAX_TEXT_LENGTH })),
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
  [ipcChannels.smartPlaylists.createRecentAdded]: required(
    objectShape({ days: field(recentAddedDays, true) }),
  ),
  [ipcChannels.smartPlaylists.updateRecentAddedDays]: required(
    objectShape({ id: field(positiveId), days: field(recentAddedDays) }),
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
  [ipcChannels.playback.nativeAvailability]: voidPayload(),
  [ipcChannels.playback.spectrumSubscribe]: required(
    objectShape({
      subscriptionId: field(finiteNumber({ integer: true, min: 0 })),
      revision: field(finiteNumber({ integer: true, min: 0 })),
      enabled: field(booleanValue),
      trackId: field(nullable(positiveId)),
      currentTime: field(finiteNumber({ min: 0, max: 604800 })),
      isPlaying: field(booleanValue),
    }),
  ),
  [ipcChannels.playback.nativeCommand]: required(nativePlaybackCommand),
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
  [ipcChannels.playback.acquireReadLease]: required(idPayload('trackId')),
  [ipcChannels.playback.releaseReadLease]: required(
    objectShape({ leaseId: field(stringValue({ min: 1, max: 128 })) }),
  ),
  [ipcChannels.archive.getListeningHeatmap]: required(objectShape({ year: field(archiveYear) })),
  [ipcChannels.archive.getDailyListeningDetail]: required(objectShape({ date: field(dateKey) })),
  [ipcChannels.archive.getDailyAlbumStats]: required(objectShape({ date: field(dateKey) })),
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
  [ipcChannels.metadata.refreshLyricsMissing]: optional(
    objectShape({ limit: field(positiveLimit, true) }),
  ),
  [ipcChannels.metadata.getRefreshStatus]: required(idPayload('jobId')),
  [ipcChannels.metadata.listRefreshFailures]: optional(
    objectShape({ limit: field(positiveLimit, true) }),
  ),
  [ipcChannels.metadata.clearRefreshFailures]: voidPayload(),
  [ipcChannels.metadata.getTrackMetadata]: required(idPayload('trackId')),
  [ipcChannels.metadata.getTrackEditState]: required(idPayload('trackId')),
  [ipcChannels.metadata.updateTrackMetadata]: required(editableMetadata),
  [ipcChannels.window.control]: required(
    objectShape({ action: field(enumValue(['minimize', 'toggle-maximize', 'close'])) }),
  ),
  [ipcChannels.window.getMaximized]: voidPayload(),
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
