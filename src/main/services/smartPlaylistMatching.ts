import type { TrackListItem } from '@shared/types/libraryScan'
import type {
  SmartPlaylist,
  SmartPlaylistExpression,
  SmartPlaylistRule,
  SmartPlaylistRuleCondition,
} from '@shared/types/smartPlaylist'
import { normalizeDelimitedValue, splitDelimitedValues } from '@shared/utils/delimitedValues'
import { isExpressionRule } from './smartPlaylistRules'

function matchesValue(rawValue: string | null | undefined, expected: string | null): boolean {
  const values = splitDelimitedValues(rawValue)
  if (expected === null) return values.length === 0

  const normalizedExpected = normalizeDelimitedValue(expected)
  return values.some((value) => normalizeDelimitedValue(value) === normalizedExpected)
}

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

function matchesAddedAt(
  track: TrackListItem,
  operator: 'addedBefore' | 'addedWithin',
  value: string,
): boolean {
  const createdAtMs = parseTrackCreatedAt(track.createdAt)
  const durationMs = parseRelativeDurationMs(value)

  if (!Number.isFinite(createdAtMs) || !Number.isFinite(durationMs)) return false

  const threshold = Date.now() - durationMs
  return operator === 'addedBefore' ? createdAtMs <= threshold : createdAtMs >= threshold
}

function matchesCondition(track: TrackListItem, condition: SmartPlaylistRuleCondition): boolean {
  if (condition.field === 'genre') {
    return matchesValue(track.genre, condition.value)
  }

  return matchesValue(track.albumArtist || track.artist, condition.value)
}

function matchesExpression(track: TrackListItem, expression: SmartPlaylistExpression): boolean {
  if (expression.type !== 'predicate') {
    return expression.type === 'and'
      ? expression.operands.every((operand) => matchesExpression(track, operand))
      : expression.operands.some((operand) => matchesExpression(track, operand))
  }

  if (expression.operator === 'addedBefore' || expression.operator === 'addedWithin') {
    return matchesAddedAt(track, expression.operator, expression.value!)
  }

  const rawValue =
    expression.field === 'genre'
      ? track.genre
      : expression.field === 'artist'
        ? track.artist
        : track.albumArtist

  if (expression.operator === 'isEmpty') {
    return splitDelimitedValues(rawValue).length === 0
  }
  return matchesValue(rawValue, expression.value!)
}

export function matchesRule(track: TrackListItem, rule: SmartPlaylistRule): boolean {
  if ('preset' in rule) {
    throw new Error('播放统计预设必须按播放记录查询')
  }
  if (isExpressionRule(rule)) return matchesExpression(track, rule.expression)

  return rule.conditions.every((condition) => matchesCondition(track, condition))
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
