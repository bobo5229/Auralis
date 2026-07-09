import type { TrackListItem } from '@shared/types/libraryScan'
import type {
  CreateSmartPlaylistResult,
  SmartPlaylist,
  SmartPlaylistDetail,
  SmartPlaylistExpression,
  SmartPlaylistExpressionRule,
  SmartPlaylistRule,
  SmartPlaylistRuleCondition,
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

function normalizeExpression(expression: SmartPlaylistExpression): SmartPlaylistExpression {
  if (expression.type === 'predicate') {
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
