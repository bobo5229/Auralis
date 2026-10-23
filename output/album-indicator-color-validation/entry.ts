import { createApp, h, ref } from 'vue'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import '../../src/renderer/app/styles/main.css'
import '../../src/renderer/features/albums/styles/albumDetail.typography.css'
import AlbumDetailTrackList from '../../src/renderer/features/albums/components/AlbumDetailTrackList.vue'
import { i18n } from '../../src/renderer/i18n'
import { setPlayingIconPreset } from '../../src/renderer/features/appearance/composables/usePlayingIconPreference'

const playing = ref(true)
const selected = ref<number | null>(null)
Object.assign(window, { configureIndicator(preset: 'equalizer' | 'blocks-wave', active: boolean, select: boolean) {
  setPlayingIconPreset(preset)
  playing.value = active
  selected.value = select ? 1 : null
} })
const tracks = [1, 2].map(id => ({
  id, title: id === 1 ? 'Back In Black' : 'Hells Bells', artist: 'AC/DC', album: 'Back In Black', albumArtist: 'AC/DC',
  trackNo: id, discNo: 1, releaseDate: '1980', copyright: null, composer: null,
  durationSeconds: 255, bitrateBps: 320000, artworkCacheKey: null, genre: 'Rock',
  availability: 'available', playCount: 0, lastPlayedAt: null, createdAt: '2026-10-11',
}))
createApp({ render: () => h('main', { class: 'album-detail-container', style: {
  width: '520px', margin: '30px', '--auralis-album-detail-accent': '#24333a',
} }, [h(AlbumDetailTrackList, { groups: [{ discNo: null, tracks }], albumArtist: 'Various Artists',
  selectedTrackId: selected.value, currentTrackId: 1, highlightedTrackId: null, isPlaying: playing.value,
})]) }).use(i18n).mount('#app')
