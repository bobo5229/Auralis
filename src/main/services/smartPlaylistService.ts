import type { TrackListItem } from '@shared/types/libraryScan'
import type {
  CreateSmartPlaylistResult,
  SmartPlaylist,
  SmartPlaylistDetail,
  SmartPlaylistRule,
  SmartPlaylistRuleCondition,
  SmartPlaylistViewMode,
} from '@shared/types/smartPlaylist'
import { normalizeDelimitedValue, splitDelimitedValues } from '@shared/utils/delimitedValues'
import { SmartPlaylistRepository } from '@main/repositories/smartPlaylistRepository'
import { TrackRepository } from '@main/repositories/trackRepository'

function normalizeCondition(condition: SmartPlaylistRuleCondition): SmartPlaylistRuleCondition {
  return {
    field: condition.field,
    value: condition.value === null ? null : condition.value.trim(),
  }
}

function normalizeRule(rule: SmartPlaylistRule): SmartPlaylistRule {
  const fieldOrder = { genre: 0, albumArtist: 1 } as const
  return {
    conditions: rule.conditions
      .map(normalizeCondition)
      .sort((left, right) => fieldOrder[left.field] - fieldOrder[right.field]),
  }
}

function canonicalRule(rule: SmartPlaylistRule): string {
  return JSON.stringify({
    conditions: normalizeRule(rule).conditions.map((condition) => ({
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
      tracks: this.trackRepository
        .getAll()
        .filter((track) =>
          playlist.rule.conditions.every((condition) => matchesCondition(track, condition)),
        ),
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
}
