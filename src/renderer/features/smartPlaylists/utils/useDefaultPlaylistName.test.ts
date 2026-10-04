import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { i18n } from '@renderer/i18n'
import { useDefaultPlaylistName } from './useDefaultPlaylistName'

afterEach(() => {
  i18n.global.locale.value = 'zh-Hans'
})
describe('smart playlist creation name', () => {
  it('updates an untouched template but preserves user text, then resets on the next creation', async () => {
    const scope = effectScope()
    const state = scope.run(() =>
      useDefaultPlaylistName(() => i18n.global.t('smartBuilder.defaultName')),
    )!
    expect(state.name.value).toBe('我的智能歌单')
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(state.name.value).toBe('My smart playlist')
    state.name.value = '夜航 / My collection'
    state.nameEdited.value = true
    i18n.global.locale.value = 'zh-Hans'
    await nextTick()
    expect(state.name.value).toBe('夜航 / My collection')
    state.reset()
    expect(state.name.value).toBe('我的智能歌单')
    expect(state.nameEdited.value).toBe(false)
    scope.stop()
  })
})
