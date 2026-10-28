import type { TrackListItem } from '@shared/types/libraryScan'
import type {
  SmartPlaylist,
  SmartPlaylistExpression,
  SmartPlaylistRule,
  SmartPlaylistPredicate,
} from '@shared/types/smartPlaylist'
import { normalizeDelimitedValue } from '@shared/utils/delimitedValues'
import { getTrackFacetMatchValues, type TrackValueField } from '@shared/smartPlaylists/trackFacets'
import { isExpressionRule } from './smartPlaylistRules'

function parseRelativeDurationMs(value: string): number {
  const match = value
    .trim()
    .toLocaleLowerCase()
    .match(/^([1-9]\d*) (days|weeks|months|years)(?: ago)?$/)

  if (!match) return Number.NaN

  const amount = Number(match[1])
  const unit = match[2]
  const dayMs = 24 * 60 * 60 * 1000

  if (unit === 'days') return amount * dayMs
  if (unit === 'weeks') return amount * 7 * dayMs
  if (unit === 'months') return amount * 30 * dayMs
  return amount * 365 * dayMs
}

export function parseTrackCreatedAt(value: string): number {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  return new Date(normalized).getTime()
}

function compareTracksByCreatedAtDesc(left: TrackListItem, right: TrackListItem): number {
  const leftCreatedAt = parseTrackCreatedAt(left.createdAt)
  const rightCreatedAt = parseTrackCreatedAt(right.createdAt)

  if (Number.isFinite(leftCreatedAt) && Number.isFinite(rightCreatedAt)) {
    return rightCreatedAt - leftCreatedAt || right.id - left.id
  }
  if (Number.isFinite(leftCreatedAt)) return -1
  if (Number.isFinite(rightCreatedAt)) return 1
  return right.id - left.id
}

type ValueField = TrackValueField
interface MatchContext {
  track: TrackListItem
  values: Partial<Record<ValueField, string[]>>
}
type MatchExpression = (context: MatchContext) => boolean

function getValues(context: MatchContext, field: ValueField): string[] {
  const cached = context.values[field]
  if (cached) return cached
  const values = getTrackFacetMatchValues(context.track, field)
  context.values[field] = values
  return values
}

function compileValue(field: ValueField, expected: string | null): MatchExpression {
  if (expected === null) return (context) => getValues(context, field).length === 0
  const normalized = normalizeDelimitedValue(expected)
  return (context) => getValues(context, field).includes(normalized)
}

function isValuePredicate(
  expression: SmartPlaylistExpression,
): expression is SmartPlaylistPredicate {
  return (
    expression.type === 'predicate' &&
    expression.field !== 'added' &&
    (expression.operator === 'has' || expression.operator === 'isEmpty')
  )
}

function compileExpression(expression: SmartPlaylistExpression, now: number): MatchExpression {
  if (expression.type !== 'predicate') {
    // Builder value groups are ORs on one field. Match them in one set lookup per
    // track value instead of walking up to 64 identical field predicates.
    const first = expression.operands[0]
    if (
      expression.type === 'or' &&
      first &&
      isValuePredicate(first) &&
      expression.operands.every(
        (operand) => isValuePredicate(operand) && operand.field === first.field,
      )
    ) {
      const predicates = expression.operands as SmartPlaylistPredicate[]
      const expected = new Set(
        predicates
          .filter((item) => item.operator === 'has')
          .map((item) => normalizeDelimitedValue(item.value!)),
      )
      const matchesEmpty = predicates.some((item) => item.operator === 'isEmpty')
      return (context) => {
        const values = getValues(context, first.field as ValueField)
        return (matchesEmpty && values.length === 0) || values.some((value) => expected.has(value))
      }
    }
    const operands = expression.operands.map((operand) => compileExpression(operand, now))
    return expression.type === 'and'
      ? (context) => operands.every((operand) => operand(context))
      : (context) => operands.some((operand) => operand(context))
  }
  if (expression.operator === 'addedBefore' || expression.operator === 'addedWithin') {
    const threshold = now - parseRelativeDurationMs(expression.value!)
    return (context) => {
      const createdAt = parseTrackCreatedAt(context.track.createdAt)
      if (!Number.isFinite(createdAt) || !Number.isFinite(threshold)) return false
      return expression.operator === 'addedBefore' ? createdAt <= threshold : createdAt >= threshold
    }
  }
  return compileValue(
    expression.field as ValueField,
    expression.operator === 'isEmpty' ? null : expression.value!,
  )
}

/** Compile constants once; normalized fields live only for the current track evaluation. */
export function compileRule(
  rule: SmartPlaylistRule,
  now = Date.now(),
): (track: TrackListItem) => boolean {
  if ('preset' in rule) throw new Error('播放统计预设必须按播放记录查询')
  const matches = isExpressionRule(rule)
    ? compileExpression(rule.expression, now)
    : (() => {
        const conditions = rule.conditions.map((condition) =>
          compileValue(
            condition.field === 'genre' ? 'genre' : 'albumArtistOrArtist',
            condition.value,
          ),
        )
        return (context: MatchContext) => conditions.every((condition) => condition(context))
      })()
  return (track) => matches({ track, values: {} })
}

export function matchesRule(track: TrackListItem, rule: SmartPlaylistRule): boolean {
  return compileRule(rule)(track)
}

function hasAddedWithinPredicate(expression: SmartPlaylistExpression): boolean {
  if (expression.type === 'predicate') {
    return expression.field === 'added' && expression.operator === 'addedWithin'
  }

  return expression.operands.some(hasAddedWithinPredicate)
}

export function sortRecentAddedTracks(tracks: readonly TrackListItem[]): TrackListItem[] {
  // 首次出现的专辑即最新入库的专辑，与封面视图使用相同的分组键。
  const albums = new Map<string, TrackListItem[]>()
  for (const track of [...tracks].sort(compareTracksByCreatedAtDesc)) {
    const key = `${track.albumArtist || track.artist || ''}\u0000${track.album || ''}`
    const album = albums.get(key)
    if (album) album.push(track)
    else albums.set(key, [track])
  }
  return [...albums.values()].flatMap((album) =>
    album.sort(
      (left, right) =>
        (left.discNo ?? 1) - (right.discNo ?? 1) ||
        (left.trackNo ?? Infinity) - (right.trackNo ?? Infinity) ||
        compareTracksByCreatedAtDesc(left, right),
    ),
  )
}

export function isRecentAddedSmartPlaylist(playlist: SmartPlaylist): boolean {
  return (
    playlist.name.trim() === '最近添加' &&
    isExpressionRule(playlist.rule) &&
    hasAddedWithinPredicate(playlist.rule.expression)
  )
}
