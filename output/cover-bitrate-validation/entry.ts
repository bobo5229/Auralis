import { createApp, h, nextTick, reactive } from 'vue'
import { createI18n } from 'vue-i18n'
import 'virtual:uno.css'
import '../../src/renderer/app/styles/main.css'
import messages from '../../src/renderer/locales/zh-Hans.json'
import AlbumCoverTrackRow from '../../src/renderer/features/library/components/AlbumCoverTrackRow.vue'
import type { TrackListItem } from '../../src/shared/types/libraryScan'

const state = reactive({ collapsed: false, max: false })
const sample: TrackListItem = {
  id: 1, title: '晴天 · A very long track title for checking truncation and alignment',
  artist: '周杰伦', album: '叶惠美', albumArtist: '周杰伦', trackNo: 1, discNo: 1,
  releaseDate: null, copyright: null, composer: null, durationSeconds: 272,
  bitrateBps: 320000, artworkCacheKey: null, genre: 'Pop; Electronic',
  availability: 'available', playCount: 0, lastPlayedAt: null, createdAt: '',
}
const tracks = [
  sample,
  { ...sample, id: 2, trackNo: 2, title: '多艺术家曲目', artist: 'Artist A; Artist B', bitrateBps: 1411200 },
  { ...sample, id: 3, trackNo: 3, title: '缺失比特率', bitrateBps: null },
  { ...sample, id: 4, trackNo: 4, title: '选中曲目', bitrateBps: 1411200 },
  { ...sample, id: 5, trackNo: 5, title: '正在播放', artist: 'Artist A; Artist B', bitrateBps: 9216000 },
  { ...sample, id: 6, trackNo: 6, title: '长时长与更高比特率', durationSeconds: 7545, bitrateBps: 11289600 },
]
createApp({ render: () => h('main', {
  class: ['app-shell', { 'is-lyrics-collapsed': state.collapsed }],
  style: {
    display: 'block', minHeight: '100vh', padding: '24px', color: 'var(--auralis-text)',
    background: 'var(--auralis-bg)', '--library-cover-track-row-height': '48px',
    '--auralis-song-cover-duration-size': state.max ? '18px' : '12px',
    '--auralis-song-cover-title-size': state.max ? '20px' : '14px',
    '--auralis-song-cover-artist-size': state.max ? '18px' : '12px',
    '--auralis-song-cover-genre-size': state.max ? '24px' : '12px',
  },
}, [h('p', { style: 'margin-bottom:20px' }, '歌曲 / 封面视图 · 比特率'),
  ...tracks.map((track) => h(AlbumCoverTrackRow, {
    track, nowPlaying: track.id === 5, selected: track.id === 4, isPlaying: false, index: track.id - 1,
  })),
]) }).use(createI18n({ legacy: false, locale: 'zh-Hans', messages: { 'zh-Hans': messages } })).directive('tooltip', {}).mount('#app')
Object.assign(window, { setScenario: async (collapsed: boolean, max: boolean) => {
  state.collapsed = collapsed; state.max = max; await nextTick()
} })
