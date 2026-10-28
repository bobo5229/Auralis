import { afterEach, describe, expect, it } from 'vitest'
import { PlaylistService } from './playlistService'
import { SmartPlaylistService } from './smartPlaylistService'
import { getNativeUiMessages, setNativeUiLocale } from '@main/app/uiLocale'
import type { PlaylistRepository } from '@main/repositories/playlistRepository'
import type { SmartPlaylistRepository } from '@main/repositories/smartPlaylistRepository'
import type { TrackRepository } from '@main/repositories/trackRepository'
import type { Playlist } from '@shared/types/playlist'
import type { SmartPlaylist, SmartPlaylistRule } from '@shared/types/smartPlaylist'

afterEach(() => setNativeUiLocale('zh-Hans'))

describe('creation-only localized playlist templates', () => {
  it('keeps existing names and existing cross-kind suffix handling', () => {
    const items = [
      { name: '新建歌单 1', sortOrder: 0 },
      { name: 'New playlist 1', sortOrder: 1 },
    ]
    const smart = [{ name: 'New playlist 2', sortOrder: 2 }]
    const repository = {
      list: () => items,
      create: (name: string, sortOrder: number) => {
        const item = { name, sortOrder }
        items.push(item)
        return item as Playlist
      },
    } as unknown as PlaylistRepository
    const service = new PlaylistService(repository, {
      list: () => smart,
    } as unknown as SmartPlaylistRepository)
    setNativeUiLocale('en')
    expect(service.create(getNativeUiMessages().newPlaylist).name).toBe('New playlist 3')
    setNativeUiLocale('zh-Hans')
    expect(service.create(getNativeUiMessages().newPlaylist).name).toBe('新建歌单 2')
    expect(items.slice(0, 2).map((item) => item.name)).toEqual(['新建歌单 1', 'New playlist 1'])
    expect(smart[0].name).toBe('New playlist 2')
  })
  it('localizes a new recent-added template, reuses a matching rule without renaming it, and retains the default legacy name', () => {
    const items: SmartPlaylist[] = []
    const repository = {
      list: () => items,
      create: (name: string, rule: SmartPlaylistRule) => {
        const item = { id: items.length + 1, name, rule } as SmartPlaylist
        items.push(item)
        return item
      },
    } as unknown as SmartPlaylistRepository
    const service = new SmartPlaylistService(repository, {} as TrackRepository)
    setNativeUiLocale('en')
    expect(service.createRecentAdded(30, getNativeUiMessages().recentAdded).playlist.name).toBe(
      'Recently added',
    )
    setNativeUiLocale('zh-Hans')
    expect(service.createRecentAdded(30, getNativeUiMessages().recentAdded)).toMatchObject({
      created: false,
      playlist: { name: 'Recently added' },
    })
    expect(service.createRecentAdded(7).playlist.name).toBe('最近添加')
    expect(items.map((item) => item.name)).toEqual(['Recently added', '最近添加'])
  })
})
