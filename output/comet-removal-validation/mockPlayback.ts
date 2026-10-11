import { reactive, ref } from 'vue'
export const track = { id: 1, title: 'Wave preview', artist: 'Preview Artist', albumArtist: 'Preview Artist', album: 'Preview Album', duration: 240, artworkCacheKey: null, discNo: 1, trackNo: 1, releaseDate: '2026', composer: null, copyright: null, genre: null, filePath: 'preview.flac' }
export const state = reactive({ currentTrackId: 1, currentTrack: track, currentTime: 60, duration: 240, isPlaying: false, error: null, queue: [track], playbackRate: 1, volume: 1 })
const api = { state, queueSession: ref(null), togglePlayPause: async () => { state.isPlaying = !state.isPlaying }, seekTo: async (time) => { state.currentTime = time }, replaceCurrentPlaybackQueue: () => {}, playTrackFromQueue: async () => {} }
export function usePlayback() { return api }
