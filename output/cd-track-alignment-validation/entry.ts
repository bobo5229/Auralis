import { createApp, h, reactive } from 'vue'
import CdTrackList from '@renderer/features/albums/components/CdTrackList.vue'
import { i18n } from '@renderer/i18n'
import { setMotionPreference } from '@renderer/shared/animation/motionPreference'
import '@renderer/features/albums/styles/cdTypography.css'
import './surface.css'

const state = reactive({currentTrackId: 1, isPlaying: true, mounted: true, dark: false, events: [] as number[], tracks: [
  {id: 1, trackNo: 1, discNo: 1, title: '夜曲 Nocturne — Live at the Concert Hall', artist: '独奏艺术家 / Guest Artist'},
  {id: 2, trackNo: null, discNo: 1, title: 'A Long Song Title Without a Track Number', artist: 'Album Artist'},
  {id: 3, trackNo: 3, discNo: 1, title: '春日 · Andante', artist: '另一位艺术家'},
]})
const nativeMatchMedia = window.matchMedia.bind(window)
const listeners = new Set<unknown>()
window.matchMedia = query => {
  const media = nativeMatchMedia(query)
  const add = media.addEventListener.bind(media), remove = media.removeEventListener.bind(media)
  media.addEventListener = ((type, fn, options) => {listeners.add(fn); add(type, fn, options)}) as typeof media.addEventListener
  media.removeEventListener = ((type, fn, options) => {listeners.delete(fn); remove(type, fn, options)}) as typeof media.removeEventListener
  return media
}
Object.assign(window, { preview: state, reduce: setMotionPreference, listenerCount: () => listeners.size })
createApp({render: () => h('main', {class: 'cd-page', 'data-theme': state.dark ? 'dark' : 'light'}, [state.mounted ? h(CdTrackList, {
  tracks: state.tracks as never, albumArtist: 'Album Artist', mode: 'sequential', currentTrackId: state.currentTrackId, isPlaying: state.isPlaying,
  onPlay: (id: number) => state.events.push(id),
}) : null])}).use(i18n).mount('#app')
