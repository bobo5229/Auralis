import type { TrackListItem } from '@shared/types/libraryScan'
import type {
  CreateSmartPlaylistResult,
  SmartPlaylist,
  SmartPlaylistDetail,
  SmartPlaylistExpression,
  SmartPlaylistExpressionRule,
  SmartPlaylistRule,
  SmartPlaylistRuleCondition,
  SmartPlaylistTrackCount,
  SmartPlaylistViewMode,
} from '@shared/types/smartPlaylist'
import { parseSmartPlaylistQuery } from '@shared/smartPlaylists/queryParser'
import { normalizeDelimitedValue, splitDelimitedValues } from '@shared/utils/delimitedValues'
import { SmartPlaylistRepository } from '@main/repositories/smartPlaylistRepository'
import { TrackRepository } from '@main/repositories/trackRepository'

function normalizeCondition(condition: SmartPlaylistRuleCondition): SmartPlaylistRuleCondition {
  return {
    field: condition.field,
    value: condition.value === null ? null : condition.value.trim(),
  }
}

function isExpressionRule(rule: SmartPlaylistRule): rule is SmartPlaylistExpressionRule {
  return 'expression' in rule
}

function normalizeRelativeDuration(value: string, operator: 'addedBefore' | 'addedWithin'): string {
  const normalized = value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  const match = normalized.match(
    /^([1-9]\d*) (day|days|week|weeks|month|months|year|years)( ago)?$/,
  )

  if (!match) {
    throw new Error(
      operator === 'addedBefore'
        ? 'ADDED BEFORE 需要类似 "30 days ago"、"2 weeks ago" 的时间'
        : 'ADDED WITHIN 需要类似 "30 days"、"2 weeks" 的时间',
    )
  }

  const [, amount, unit, ago] = match
  if (operator === 'addedBefore' && !ago) {
    throw new Error('ADDED BEFORE 的时间需要以 ago 结尾，例如 "30 days ago"')
  }

  const normalizedUnit = unit.endsWith('s') ? unit : `${unit}s`
  return operator === 'addedBefore'
    ? `${amount} ${normalizedUnit} ago`
    : `${amount} ${normalizedUnit}`
}

function normalizeExpression(expression: SmartPlaylistExpression): SmartPlaylistExpression {
  if (expression.type === 'predicate') {
    if (expression.operator === 'addedBefore' || expression.operator === 'addedWithin') {
      return {
        ...expression,
        value: normalizeRelativeDuration(expression.value ?? '', expression.operator),
      }
    }

    return {
      ...expression,
      value: expression.value?.trim(),
    }
  }

  return {
    type: expression.type,
    operands: expression.operands.map(normalizeExpression),
  }
}

function normalizeRule(rule: SmartPlaylistRule): SmartPlaylistRule {
  if (isExpressionRule(rule)) {
    return { expression: normalizeExpression(rule.expression) }
  }

  const fieldOrder = { genre: 0, albumArtist: 1 } as const
  return {
    conditions: rule.conditions
      .map(normalizeCondition)
      .sort((left, right) => fieldOrder[left.field] - fieldOrder[right.field]),
  }
}

function canonicalRule(rule: SmartPlaylistRule): string {
  if (isExpressionRule(rule)) {
    const canonicalizeExpression = (expression: SmartPlaylistExpression): unknown => {
      if (expression.type === 'predicate') {
        return {
          type: expression.type,
          field: expression.field,
          operator: expression.operator,
          value:
            expression.value === undefined ? undefined : normalizeDelimitedValue(expression.value),
        }
      }

      const operands = expression.operands
        .map(canonicalizeExpression)
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      return { type: expression.type, operands }
    }

    return JSON.stringify(canonicalizeExpression(normalizeExpression(rule.expression)))
  }

  return JSON.stringify({
    conditions: rule.conditions.map((condition) => ({
      field: condition.field,
      value: condition.value === null ? null : normalizeDelimitedValue(condition.value),
    })),
  })
}

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

function parseTrackCreatedAt(value: string): number {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  return new Date(normalized).getTime()
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

function matchesRule(track: TrackListItem, rule: SmartPlaylistRule): boolean {
  if (isExpressionRule(rule)) return matchesExpression(track, rule.expression)

  return rule.conditions.every((condition) => matchesCondition(track, condition))
}

export class SmartPlaylistService {
  constructor(
    private readonly smartPlaylistRepository: SmartPlaylistRepository,
    private readonly trackRepository: TrackRepository,
  ) {}

  list(): SmartPlaylist[] {
    return this.smartPlaylistRepository.list()
  }

  listTrackCounts(): SmartPlaylistTrackCount[] {
    const tracks = this.trackRepository.getAll()
    return this.smartPlaylistRepository.list().map((playlist) => ({
      playlistId: playlist.id,
      trackCount: tracks.filter((track) => matchesRule(track, playlist.rule)).length,
    }))
  }

  getDetail(id: number): SmartPlaylistDetail | null {
    const playlist = this.smartPlaylistRepository.getById(id)
    if (!playlist) return null

    return {
      playlist,
      tracks: this.trackRepository.getAll().filter((track) => matchesRule(track, playlist.rule)),
    }
  }

  create(name: string, rule: SmartPlaylistRule): CreateSmartPlaylistResult {
    const normalizedRule = normalizeRule(rule)
    const canonical = canonicalRule(normalizedRule)
    const playlists = this.smartPlaylistRepository.list()
    const existing = playlists.find((playlist) => canonicalRule(playlist.rule) === canonical)

    if (existing) return { playlist: existing, created: false }

    return {
      playlist: this.smartPlaylistRepository.create(
        this.getAvailableName(name, playlists),
        normalizedRule,
      ),
      created: true,
    }
  }

  createFromQuery(query: string): CreateSmartPlaylistResult {
    const expression = parseSmartPlaylistQuery(query)
    const playlists = this.smartPlaylistRepository.list()
    return this.create(this.getAvailableManualName(playlists), { expression })
  }

  rename(id: number, name: string): SmartPlaylist | null {
    const playlist = this.smartPlaylistRepository.getById(id)
    if (!playlist) return null

    const others = this.smartPlaylistRepository.list().filter((item) => item.id !== id)
    return this.smartPlaylistRepository.rename(id, this.getAvailableName(name, others))
  }

  updateViewMode(id: number, viewMode: SmartPlaylistViewMode): SmartPlaylist | null {
    return this.smartPlaylistRepository.updateViewMode(id, viewMode)
  }

  delete(id: number): boolean {
    return this.smartPlaylistRepository.delete(id)
  }

  reorder(ids: number[]): SmartPlaylist[] {
    const existing = this.smartPlaylistRepository.list()
    const existingIds = new Set(existing.map((playlist) => playlist.id))
    const uniqueIds = new Set(ids)

    if (
      ids.length !== existing.length ||
      uniqueIds.size !== ids.length ||
      ids.some((id) => !existingIds.has(id))
    ) {
      return existing
    }

    return this.smartPlaylistRepository.reorder(ids)
  }

  private getAvailableName(name: string, playlists: SmartPlaylist[]): string {
    const baseName = name.trim()
    const names = new Set(playlists.map((playlist) => playlist.name.trim().toLocaleLowerCase()))
    if (!names.has(baseName.toLocaleLowerCase())) return baseName

    let suffix = 2
    while (names.has(`${baseName} (${suffix})`.toLocaleLowerCase())) suffix += 1
    return `${baseName} (${suffix})`
  }

  private getAvailableManualName(playlists: SmartPlaylist[]): string {
    const names = new Set(playlists.map((playlist) => playlist.name.trim().toLocaleLowerCase()))
    let suffix = 1
    while (names.has(`智能歌单${suffix}`.toLocaleLowerCase())) suffix += 1
    return `智能歌单${suffix}`
  }
}
