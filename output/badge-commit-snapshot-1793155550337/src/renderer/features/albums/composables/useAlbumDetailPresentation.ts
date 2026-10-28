import { computed, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { formatGenreParts } from '@renderer/shared/media/formatGenre'
import { rankAlbumGenres } from '@shared/utils/albumGenres'
import { formatAlbumReleaseDate } from '../utils/formatAlbumReleaseDate'

export function useAlbumDetailPresentation(
  albumTracks: Readonly<Ref<TrackListItem[]>>,
  previewReleaseDate: Readonly<Ref<string | null>>,
) {
  const { t } = useI18n()
  const releaseDate = computed(
    () =>
      albumTracks.value.find((track) => track.releaseDate)?.releaseDate ?? previewReleaseDate.value,
  )
  const copyright = computed(
    () => albumTracks.value.find((track) => track.copyright)?.copyright ?? null,
  )

  /** 提取全部流派，去重并按包含该流派的曲目数量排序，同频次保留首次出现顺序。 */
  const albumGenrePills = computed(() => rankAlbumGenres(albumTracks.value))
  const albumHeroGenreLabel = computed(() => formatGenreParts(albumGenrePills.value.slice(0, 2)))

  /**
   * Hero 法律附录：仅显示版权，发行日期由右侧元数据展示。
   * 无真实数据时不渲染，绝不写「未知」占位。
   */
  const heroLegalLine = computed(() => {
    return copyright.value?.trim() || null
  })
  const albumReleaseDate = computed(() =>
    formatAlbumReleaseDate(releaseDate.value, t('albums.detail.unknownDate')),
  )
  /**
   * 多碟分组：至少两个不同有效 discNo（null 视为 1）时才分组并显示 Disc 头。
   * 单碟或全同一碟时 discNo 为 null，模板不渲染分组头。
   */
  const albumDiscGroups = computed(() => {
    const tracksInAlbum = albumTracks.value
    if (tracksInAlbum.length === 0)
      return [] as { discNo: number | null; tracks: TrackListItem[] }[]

    const distinctDiscs = new Set(tracksInAlbum.map((track) => track.discNo ?? 1))
    if (distinctDiscs.size < 2) {
      return [{ discNo: null, tracks: tracksInAlbum }]
    }

    const groups: { discNo: number; tracks: TrackListItem[] }[] = []
    for (const track of tracksInAlbum) {
      const discNo = track.discNo ?? 1
      const last = groups[groups.length - 1]
      if (last && last.discNo === discNo) {
        last.tracks.push(track)
      } else {
        groups.push({ discNo, tracks: [track] })
      }
    }
    return groups
  })
  return {
    albumGenrePills,
    albumHeroGenreLabel,
    heroLegalLine,
    albumReleaseDate,
    albumDiscGroups,
  }
}
