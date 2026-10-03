import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import LibraryContextMenu from './LibraryContextMenu.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
afterEach(() => vi.unstubAllGlobals())

async function renderMenu(hideInsert: boolean) {
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  const app = createSSRApp({
    render: () =>
      h(LibraryContextMenu, {
        open: true,
        source: 'track',
        trackTitle: 'Track',
        albumTitle: 'Album',
        anchor: { clientX: 10, clientY: 10, returnFocusTrackId: 1, openReason: 'pointer' },
        canLocateCurrent: true,
        canInsert: !hideInsert,
        hideInsert,
        currentViewMode: 'cover',
        playlists: [],
        playlistFeedback: null,
        playlistLoading: false,
        playlistLoadError: null,
        creatingPlaylist: false,
      }),
  })
  app.directive('tooltip', {})
  const context: { teleports?: Record<string, string> } = {}
  await renderToString(app, context)
  return context.teleports?.body ?? ''
}

describe('LibraryContextMenu insert visibility', () => {
  it('does not render the insert row for the current track, preserving later item indices', async () => {
    const html = await renderMenu(true)
    expect(html).not.toContain('library.contextMenu.insertTrack')
    expect(html).not.toContain('data-context-main-index="2"')
    expect(html).toContain('data-context-main-index="3"')
    expect(html).toContain('data-context-main-index="4"')
  })

  it('renders the insert row for another track', async () => {
    const html = await renderMenu(false)
    expect(html).toContain('library.contextMenu.insertTrack')
    expect(html).toContain('data-context-main-index="2"')
  })
})
