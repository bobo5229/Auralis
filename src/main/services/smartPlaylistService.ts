import type { TrackListItem } from '@shared/types/libraryScan'
import type {
  CreateSmartPlaylistResult,
  SmartPlaylist,
  SmartPlaylistDetail,
  SmartPlaylistRule,
  SmartPlaylistTrackCount,
  SmartPlaylistViewMode,
} from '@shared/types/smartPlaylist'
import { parseSmartPlaylistQuery } from '@shared/smartPlaylists/queryParser'
import {
  assertRecentAddedDays,
  DEFAULT_RECENT_ADDED_DAYS,
} from '@shared/smartPlaylists/recentAdded'
import {
  assertRecentFrequentDays,
  DEFAULT_RECENT_FREQUENT_DAYS,
  isRecentFrequentRule,
  resolveRecentFrequentDateRange,
} from '@shared/smartPlaylists/recentFrequent'
import { assertValidSmartPlaylistRule, normalizeRule, canonicalRule } from './smartPlaylistRules'
import {
  matchesRule,
  parseTrackCreatedAt,
  sortRecentAddedTracks,
  isRecentAddedSmartPlaylist,
} from './smartPlaylistMatching'

export { assertValidSmartPlaylistRule } from './smartPlaylistRules'

import { SmartPlaylistRepository } from '@main/repositories/smartPlaylistRepository'
import { TrackRepository } from '@main/repositories/trackRepository'

/** Short TTL: listTrackCounts + getDetail often fire in bursts; avoid multi-getAll of large libraries. */
const TRACK_LIST_CACHE_TTL_MS = 3000

export class SmartPlaylistService {
  /**
   * Brief in-process cache of getAll() tracks.
   * Database revisions invalidate this cache before an immediate post-change refresh.
   */
  private trackListCache: { tracks: TrackListItem[]; expiresAt: number; revision: string } | null =
    null

  constructor(
    private readonly smartPlaylistRepository: SmartPlaylistRepository,
    private readonly trackRepository: TrackRepository,
  ) {}

  list(): SmartPlaylist[] {
    return this.smartPlaylistRepository.list()
  }

  listTrackCounts(): SmartPlaylistTrackCount[] {
    const tracks = this.getTracksCached()
    const now = new Date()
    const presetTracks = new Map<string, TrackListItem[]>()
    return this.smartPlaylistRepository.list().map((playlist) => ({
      playlistId: playlist.id,
      trackCount: this.getPlaylistTracks(playlist, tracks, now, presetTracks).length,
    }))
  }

  getDetail(id: number): SmartPlaylistDetail | null {
    const playlist = this.smartPlaylistRepository.getById(id)
    if (!playlist) return null
    const tracks = this.getPlaylistTracks(playlist, this.getTracksCached(), new Date())

    return {
      playlist,
      tracks: isRecentAddedSmartPlaylist(playlist) ? sortRecentAddedTracks(tracks) : tracks,
    }
  }

  create(name: string, rule: SmartPlaylistRule): CreateSmartPlaylistResult {
    assertValidSmartPlaylistRule(rule)
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

  createRecentAdded(
    days = DEFAULT_RECENT_ADDED_DAYS,
    defaultName = '最近添加',
  ): CreateSmartPlaylistResult {
    return this.create(defaultName, { preset: 'recentAdded', days })
  }

  updateRecentAddedDays(id: number, days: number): SmartPlaylist | null {
    assertRecentAddedDays(days)
    const playlist = this.smartPlaylistRepository.getById(id)
    if (!playlist) return null
    if (!('preset' in playlist.rule) || playlist.rule.preset !== 'recentAdded') {
      throw new Error('仅最近添加歌单支持修改此时间范围')
    }
    return this.smartPlaylistRepository.updateRule(id, { preset: 'recentAdded', days })
  }

  createRecentFrequent(days = DEFAULT_RECENT_FREQUENT_DAYS): CreateSmartPlaylistResult {
    return this.create('最近常听', { preset: 'recentFrequent', days })
  }

  updateRecentFrequentDays(id: number, days: number): SmartPlaylist | null {
    assertRecentFrequentDays(days)
    const playlist = this.smartPlaylistRepository.getById(id)
    if (!playlist) return null
    if (!isRecentFrequentRule(playlist.rule)) {
      throw new Error('仅最近常听歌单支持修改时间范围')
    }
    return this.smartPlaylistRepository.updateRule(id, { preset: 'recentFrequent', days })
  }

  private getPlaylistTracks(
    playlist: SmartPlaylist,
    tracks: TrackListItem[],
    now: Date,
    presetTracks = new Map<string, TrackListItem[]>(),
  ): TrackListItem[] {
    if (!('preset' in playlist.rule)) {
      return tracks.filter((track) => matchesRule(track, playlist.rule))
    }
    const rule = playlist.rule
    const key = canonicalRule(rule)
    const cached = presetTracks.get(key)
    if (cached) return cached
    if (rule.preset === 'recentAdded') {
      const end = now.getTime()
      const start = end - rule.days * 86_400_000
      const result = sortRecentAddedTracks(
        tracks.filter((track) => {
          const added = parseTrackCreatedAt(track.createdAt)
          return added >= start && added <= end
        }),
      )
      presetTracks.set(key, result)
      return result
    }
    let ids: number[]
    if (rule.preset === 'mostListened') {
      ids = this.smartPlaylistRepository.getMostListenedTrackIds()
    } else {
      const { startDate, endDate } = resolveRecentFrequentDateRange(rule.days, now)
      ids =
        rule.preset === 'recentPlayed'
          ? this.smartPlaylistRepository.getRecentPlayedTrackIds(startDate, endDate)
          : this.smartPlaylistRepository.getRecentFrequentTrackIds(startDate, endDate)
    }
    const byId = new Map(tracks.map((track) => [track.id, track]))
    const result = ids.flatMap((id) => {
      const track = byId.get(id)
      return track ? [track] : []
    })
    presetTracks.set(key, result)
    return result
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
    const revision = this.trackRepository.getChangeToken()
    if (
      this.trackListCache &&
      this.trackListCache.expiresAt > now &&
      this.trackListCache.revision === revision
    ) {
      return this.trackListCache.tracks
    }

    const tracks = this.trackRepository.getAll()
    this.trackListCache = {
      tracks,
      expiresAt: now + TRACK_LIST_CACHE_TTL_MS,
      revision,
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
