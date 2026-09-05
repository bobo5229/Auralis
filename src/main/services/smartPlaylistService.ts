import type { TrackListItem } from '@shared/types/libraryScan'
import type {
  CreateSmartPlaylistResult,
  SmartPlaylist,
  SmartPlaylistDetail,
  SmartPlaylistExpression,
  SmartPlaylistExpressionRule,
  SmartPlaylistPredicateOperator,
  SmartPlaylistQueryField,
  SmartPlaylistRule,
  SmartPlaylistRuleCondition,
  SmartPlaylistRuleField,
  SmartPlaylistTrackCount,
  SmartPlaylistViewMode,
} from '@shared/types/smartPlaylist'
import { parseSmartPlaylistQuery } from '@shared/smartPlaylists/queryParser'
import { normalizeDelimitedValue, splitDelimitedValues } from '@shared/utils/delimitedValues'
import { SmartPlaylistRepository } from '@main/repositories/smartPlaylistRepository'
import { TrackRepository } from '@main/repositories/trackRepository'

/** Short TTL: listTrackCounts + getDetail often fire in bursts; avoid multi-getAll of large libraries. */
const TRACK_LIST_CACHE_TTL_MS = 3000

const LEGACY_RULE_FIELDS = new Set<SmartPlaylistRuleField>(['genre', 'albumArtist'])
const QUERY_FIELDS = new Set<SmartPlaylistQueryField>(['genre', 'artist', 'albumArtist', 'added'])
const PREDICATE_OPERATORS = new Set<SmartPlaylistPredicateOperator>([
  'has',
  'isEmpty',
  'addedBefore',
  'addedWithin',
])

function normalizeCondition(condition: SmartPlaylistRuleCondition): SmartPlaylistRuleCondition {
  return {
    field: condition.field,
    value: condition.value === null ? null : condition.value.trim(),
  }
}

/**
 * Reject empty / garbage rules that would match the entire library or fail silently.
 * Used by create / createFromQuery paths.
 */
export function assertValidSmartPlaylistRule(rule: SmartPlaylistRule): void {
  if (!rule || typeof rule !== 'object') {
    throw new Error('无效的智能歌单规则')
  }

  if (isExpressionRule(rule)) {
    assertValidExpression(rule.expression)
    return
  }

  if (!('conditions' in rule) || !Array.isArray(rule.conditions)) {
    throw new Error('无效的智能歌单规则')
  }

  if (rule.conditions.length === 0) {
    throw new Error('智能歌单规则不能为空')
  }

  for (const condition of rule.conditions) {
    if (!condition || typeof condition !== 'object') {
      throw new Error('无效的智能歌单条件')
    }
    if (!LEGACY_RULE_FIELDS.has(condition.field as SmartPlaylistRuleField)) {
      throw new Error(`不支持的规则字段: ${String(condition.field)}`)
    }
    if (condition.value !== null && typeof condition.value !== 'string') {
      throw new Error('规则值必须是字符串或 null')
    }
    if (typeof condition.value === 'string' && condition.value.trim().length === 0) {
      throw new Error('规则值不能为空字符串')
    }
  }
}

function assertValidExpression(expression: SmartPlaylistExpression): void {
  if (!expression || typeof expression !== 'object' || !('type' in expression)) {
    throw new Error('无效的智能歌单表达式')
  }

  if (expression.type === 'predicate') {
    if (!QUERY_FIELDS.has(expression.field as SmartPlaylistQueryField)) {
      throw new Error(`不支持的查询字段: ${String(expression.field)}`)
    }
    if (!PREDICATE_OPERATORS.has(expression.operator as SmartPlaylistPredicateOperator)) {
      throw new Error(`不支持的操作符: ${String(expression.operator)}`)
    }

    const field = expression.field
    const operator = expression.operator

    if (field === 'added') {
      if (operator !== 'addedBefore' && operator !== 'addedWithin') {
        throw new Error('ADDED 字段只能使用 BEFORE 或 WITHIN')
      }
      if (typeof expression.value !== 'string' || expression.value.trim().length === 0) {
        throw new Error('ADDED 规则需要时间值')
      }
      return
    }

    if (operator === 'isEmpty') {
      return
    }

    if (operator === 'has') {
      if (typeof expression.value !== 'string' || expression.value.trim().length === 0) {
        throw new Error('HAS 规则需要非空查询值')
      }
      return
    }

    throw new Error(`${field} 字段不支持操作符 ${operator}`)
  }

  if (expression.type === 'and' || expression.type === 'or') {
    if (!Array.isArray(expression.operands) || expression.operands.length === 0) {
      throw new Error(expression.type === 'and' ? 'AND 规则不能为空' : 'OR 规则不能为空')
    }

    for (const operand of expression.operands) {
      assertValidExpression(operand)
    }
    return
  }

  throw new Error(`不支持的表达式类型: ${String((expression as { type: unknown }).type)}`)
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

function matchesRule(track: TrackListItem, rule: SmartPlaylistRule): boolean {
  if (isExpressionRule(rule)) return matchesExpression(track, rule.expression)

  return rule.conditions.every((condition) => matchesCondition(track, condition))
}

function hasAddedWithinPredicate(expression: SmartPlaylistExpression): boolean {
  if (expression.type === 'predicate') {
    return expression.field === 'added' && expression.operator === 'addedWithin'
  }

  return expression.operands.some(hasAddedWithinPredicate)
}

function isRecentAddedSmartPlaylist(playlist: SmartPlaylist): boolean {
  return (
    playlist.name.trim() === '最近添加' &&
    isExpressionRule(playlist.rule) &&
    hasAddedWithinPredicate(playlist.rule.expression)
  )
}

export class SmartPlaylistService {
  /**
   * Brief in-process cache of getAll() tracks.
   * Invalidation: TTL only (no library-change hook wired here). Clear via clearTrackListCache().
   */
  private trackListCache: { tracks: TrackListItem[]; expiresAt: number } | null = null

  constructor(
    private readonly smartPlaylistRepository: SmartPlaylistRepository,
    private readonly trackRepository: TrackRepository,
  ) {}

  list(): SmartPlaylist[] {
    return this.smartPlaylistRepository.list()
  }

  listTrackCounts(): SmartPlaylistTrackCount[] {
    const tracks = this.getTracksCached()
    return this.smartPlaylistRepository.list().map((playlist) => ({
      playlistId: playlist.id,
      trackCount: tracks.filter((track) => matchesRule(track, playlist.rule)).length,
    }))
  }

  getDetail(id: number): SmartPlaylistDetail | null {
    const playlist = this.smartPlaylistRepository.getById(id)
    if (!playlist) return null
    const tracks = this.getTracksCached().filter((track) => matchesRule(track, playlist.rule))

    return {
      playlist,
      tracks: isRecentAddedSmartPlaylist(playlist)
        ? [...tracks].sort(compareTracksByCreatedAtDesc)
        : tracks,
    }
  }

  create(name: string, rule: SmartPlaylistRule): CreateSmartPlaylistResult {
    const normalizedRule = normalizeRule(rule)
    assertValidSmartPlaylistRule(normalizedRule)
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

  /** Drop the short-lived track list cache (e.g. after a known library mutation if wired). */
  clearTrackListCache(): void {
    this.trackListCache = null
  }

  /**
   * Load available tracks once per batch evaluation window.
   * listTrackCounts reuses one getAll() for all smart playlists; getDetail shares the same TTL cache.
   */
  private getTracksCached(): TrackListItem[] {
    const now = Date.now()
    if (this.trackListCache && this.trackListCache.expiresAt > now) {
      return this.trackListCache.tracks
    }

    const tracks = this.trackRepository.getAll()
    this.trackListCache = {
      tracks,
      expiresAt: now + TRACK_LIST_CACHE_TTL_MS,
    }
    return tracks
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
