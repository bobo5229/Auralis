import { ref, shallowRef } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'

export const tracks = shallowRef<TrackListItem[]>([])
export function setCatalog(count: number) {
  tracks.value = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Fixture track ${i + 1}`,
    artist: `Artist ${i % 193}`,
    albumArtist: `Artist ${String(i % 193).padStart(3, '0')}`,
    album: `${String(i + 1).padStart(6, '0')} · ${['夜航 Night Flight', 'Quiet Hours', '远行的声音', 'Still / Moving', '回声与城市 Echoes of the City'][i % 5]}`,
    releaseDate: i % 11 ? `${1980 + (i % 46)}-01-01` : null,
    artworkCacheKey: i % 37 ? `mock:${i}` : null,
    genre: null,
    trackNo: 1,
    discNo: 1,
    duration: 180,
  }))
}
const images = new Map<string, string>()
export function getArtworkUrl(key: string | null) {
  if (!key) return null
  if (images.has(key)) return images.get(key)!
  const i = Number(key.split(':')[1]) || 0
  const hue = (i * 137.508) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue} 35% 18%)"/><stop offset="1" stop-color="hsl(${(hue + 55) % 360} 48% 48%)"/></linearGradient></defs><rect width="420" height="420" fill="url(#g)"/><circle cx="${110 + (i % 160)}" cy="${130 + (i % 130)}" r="140" fill="none" stroke="hsl(${(hue + 120) % 360} 65% 78%)" stroke-width="${8 + (i % 40)}" opacity=".6"/><path d="M0 330L420 ${i % 240}V420H0Z" fill="#111" opacity=".25"/><text x="26" y="56" fill="#fff" font-family="sans-serif" font-size="15" letter-spacing="4">AURALIS / STUDIES</text><text x="25" y="385" fill="#fff" font-family="sans-serif" font-size="66" font-weight="600">${String(i + 1).padStart(4, '0')}</text></svg>`
  const url = 'data:image/svg+xml,' + encodeURIComponent(svg)
  images.set(key, url)
  if (images.size > 256) images.delete(images.keys().next().value!)
  return url
}
export const useArtworkPalette = () => ({
  palette: ref({ quality: 'fallback', key: null, accents: [] }),
})
export const prefetchArtworkPalette = () => {}
export const useAlbumCatalog = () => ({
  tracks,
  isLoading: ref(false),
  error: ref(null),
  refresh: async () => {},
})
export const usePlayback = () => ({
  state: { currentTrackId: null, currentTrack: null, isPlaying: false, selectedTrackId: null },
  playTrackFromQueue: () => {},
})
export const usePlayerDisplayMode = () => ({ displayMode: ref('normal') })
export const auralis = { library: {}, playlists: {}, smartPlaylists: {} }
