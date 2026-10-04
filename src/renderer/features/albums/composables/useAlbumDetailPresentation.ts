import { computed, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { formatGenreParts, splitGenreValues } from '@renderer/features/library/utils/formatGenre'
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
  const totalDurationSeconds = computed(() =>
    albumTracks.value.reduce((total, track) => total + (track.durationSeconds ?? 0), 0),
  )

  function collectGenreCounts(): { label: string; count: number; firstSeen: number }[] {
    const genreCounts = new Map<string, { label: string; count: number; firstSeen: number }>()
    let firstSeen = 0

    for (const track of albumTracks.value) {
      const trackGenres = new Map<string, string>()

      for (const genre of splitGenreValues(track.genre)) {
        trackGenres.set(genre.toLocaleLowerCase(), genre)
      }

      for (const [key, genre] of trackGenres) {
        const existing = genreCounts.get(key)

        if (existing) {
          existing.count += 1
        } else {
          genreCounts.set(key, { label: genre, count: 1, firstSeen })
          firstSeen += 1
        }
      }
    }

    return [...genreCounts.values()].sort(
      (left, right) => right.count - left.count || left.firstSeen - right.firstSeen,
    )
  }

  /** 提取全部流派，去重并按包含该流派的曲目数量排序，同频次保留首次出现顺序。 */
  const albumGenrePills = computed<string[]>(() => collectGenreCounts().map((genre) => genre.label))
  const albumHeroGenreLabel = computed(() => formatGenreParts(albumGenrePills.value.slice(0, 2)))
  function formatMetricsDuration(seconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(seconds))
    const minutes = Math.floor(totalSeconds / 60)
    return t('albums.detail.duration.minutes', { minutes, seconds: totalSeconds % 60 })
  }

  const metricsTrackCount = computed(() => albumTracks.value.length)
  const metricsTotalDuration = computed(() => formatMetricsDuration(totalDurationSeconds.value))

  const metricsListenData = computed(() => {
    let totalPlays = 0
    let listenedSeconds = 0

    for (const track of albumTracks.value) {
      const playCount = track.playCount ?? 0
      totalPlays += playCount
      listenedSeconds += playCount * (track.durationSeconds ?? 0)
    }

    return { totalPlays, listenedSeconds }
  })

  const metricsTotalPlays = computed(() => metricsListenData.value.totalPlays)

  const metricsPlaysLabel = computed(() => {
    const count = metricsTotalPlays.value
    const key =
      count === 1 ? 'albums.detail.metrics.playsUnitOne' : 'albums.detail.metrics.playsUnit'
    return t(key, { count })
  })

  const metricsTotalTime = computed(() => {
    const seconds = metricsListenData.value.listenedSeconds
    if (seconds <= 0) {
      return t('albums.detail.metrics.minutesUnit', { minutes: 0 })
    }

    if (seconds < 3600) {
      const minutes = Math.max(1, Math.round(seconds / 60))
      return t('albums.detail.metrics.minutesUnit', { minutes })
    }

    const hoursTenths = Math.round((seconds / 3600) * 10) / 10
    const hoursLabel =
      Number.isInteger(hoursTenths) || hoursTenths >= 10
        ? String(Math.round(hoursTenths))
        : hoursTenths.toFixed(1)
    return t('albums.detail.metrics.hoursUnit', { hours: hoursLabel })
  })

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
    metricsTrackCount,
    metricsTotalDuration,
    metricsPlaysLabel,
    metricsTotalTime,
    heroLegalLine,
    albumReleaseDate,
    albumDiscGroups,
  }
}
