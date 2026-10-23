import { reactive, ref } from 'vue'
import { browserPreviewApi } from '../../../src/renderer/shared/ipc/browserPreviewApi'
import cover from '../assets/album-sleeve-cover.webp'

const tracks = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  title: ['Feel My Rhythm', 'Rainbow Halo', 'Beg For Me'][i % 3],
  artist: 'Red Velvet',
  albumArtist: 'Red Velvet',
  album: ['Feel My Rhythm', 'The ReVe Festival', 'Material Study', 'Quiet Hours'][
    Math.floor(i / 3)
  ],
  artworkCacheKey: `fixture:${Math.floor(i / 3)}`,
  genre: null,
  releaseDate: '2022-03-21',
  trackNo: (i % 3) + 1,
  discNo: 1,
  duration: 210,
  composer: null,
  copyright: null,
}))
export const auralis = new Proxy(browserPreviewApi, {
  get(target, group: keyof typeof browserPreviewApi) {
    if (group === 'library')
      return new Proxy(target.library, {
        get(library, method: keyof typeof library) {
          if (method === 'getTracks') return async () => tracks
          return library[method]
        },
      })
    return target[group]
  },
})
export const getArtworkUrl = () => cover
export const useArtworkPalette = () => ({ palette: ref({ quality: 'fallback', accents: [] }) })
const state = reactive({
  currentTrackId: null as number | null,
  currentTrack: null as unknown,
  isPlaying: false,
  currentTime: 0,
  duration: 210,
  queue: [],
  error: null,
})
const playback = {
  state,
  queueSession: ref(null),
  playTrackFromQueue: async () => {},
  replaceCurrentPlaybackQueue: () => {},
  togglePlayPause: () => {
    state.isPlaying = !state.isPlaying
  },
}
export const usePlayback = () => playback
