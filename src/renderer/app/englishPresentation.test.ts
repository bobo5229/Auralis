import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createI18n } from 'vue-i18n'
import en from '@renderer/locales/en.json'
import zh from '@renderer/locales/zh-Hans.json'
import type { AnnualAlbum, AnnualSummary } from '@shared/types/listeningArchive'
import ArchiveSummaryAlbums from '@renderer/features/archive/components/ArchiveSummaryAlbums.vue'
import ArchiveSummarySeasons from '@renderer/features/archive/components/ArchiveSummarySeasons.vue'
import PlaybackModeMenu from './layout/PlaybackModeMenu.vue'

vi.mock('@renderer/shared/preferences/useChineseTextDisplay', () => ({
  useChineseTextDisplay: () => ({
    songText: (value: string | null) => value ?? '',
    songValues: (value: string | null) => value ?? '',
  }),
}))
vi.mock('@renderer/features/archive/components/ArchiveSummaryArtwork.vue', () => ({
  default: { render: () => null },
}))

async function render(component: Component, props: Record<string, unknown>, locale = 'en') {
  const app = createSSRApp({ render: () => h(component, props) })
  app.use(createI18n({ legacy: false, locale, messages: { en, 'zh-Hans': zh } }))
  app.directive('tooltip', { getSSRProps: () => ({}) })
  return renderToString(app)
}
function album(plays: number): AnnualAlbum {
  return {
    key: 'album',
    album: 'Mixed TITLE 中文',
    albumArtist: 'Artist',
    artworkCacheKey: null,
    playCount: plays,
    durationSeconds: 300,
    trackCount: 1,
    firstPlayedDate: '2026-01-01',
    monthlyPlays: [plays, ...Array<number>(11).fill(0)],
    available: false,
  }
}

describe('localized UI presentation', () => {
  it.each([1, 2, 1000])(
    'renders album counts with the numeric plural selector (%i)',
    async (plays) => {
      const html = await render(ArchiveSummaryAlbums, { albums: [album(plays)] })
      expect(html).toContain(`${plays.toLocaleString('en')} ${plays === 1 ? 'play' : 'plays'}`)
      expect(html).toContain('1 track heard')
      expect(html).toContain(`January · ${plays} effective ${plays === 1 ? 'play' : 'plays'}`)
      expect(html).toContain('Mixed TITLE 中文')
    },
  )
  it('keeps Chinese count and month wording', async () => {
    const html = await render(ArchiveSummaryAlbums, { albums: [album(1000)] }, 'zh-Hans')
    expect(html).toContain('1,000 次')
    expect(html).toContain('1 月')
    expect(html).not.toContain('January')
    expect(html).toContain('Mixed TITLE 中文')
  })
  it('uses named English months and retains numeric Chinese months in season buttons', async () => {
    const summary: AnnualSummary = {
      year: 2026,
      playCount: 0,
      activeDays: 0,
      albumCount: 0,
      albums: [],
      tracks: [],
      artists: [],
      months: [],
      seasons: [
        { months: [3, 4, 5], album: null },
        { months: [6, 7, 8], album: null },
        { months: [9, 10, 11], album: null },
        { months: [1, 2, 12], album: null },
      ],
      peakDay: null,
      longestRun: null,
      selection: [],
    }
    const english = await render(ArchiveSummarySeasons, { summary })
    expect(english).toContain('<span>Jan</span>')
    expect(english).toContain('<span>Dec</span>')
    const chinese = await render(ArchiveSummarySeasons, { summary }, 'zh-Hans')
    expect(chinese).toContain('<span>1 月</span>')
    expect(chinese).not.toContain('<span>Jan</span>')
  })
  it('shows the album shuffle explanation inside the English menu and keeps the current mode', async () => {
    const html = await render(PlaybackModeMenu, { currentMode: 'album-shuffle', playbar: true })
    expect(html).toContain('playback-mode-description')
    expect(html).toContain(en.player.albumShuffleDescription)
    expect(html).toContain('aria-checked="true"')
    expect(html.match(/role="menuitemradio"/g)).toHaveLength(5)
    const chinese = await render(PlaybackModeMenu, { currentMode: 'album-shuffle' }, 'zh-Hans')
    expect(chinese).not.toContain('class="playback-mode-description"')
    expect(chinese.match(/role="menuitemradio"/g)).toHaveLength(5)
  })
})
