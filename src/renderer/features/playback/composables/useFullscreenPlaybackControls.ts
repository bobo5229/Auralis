// @unocss-include
import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import type { PlaybackPublicApi } from './usePlayback'
import { usePlaybackMetadataDisplay } from './usePlaybackMetadataDisplay'
import { useFullscreenInfoTypography } from './useFullscreenInfoTypography'
import { usePlaybackProgressInteraction } from './usePlaybackProgressInteraction'

interface Options {
  playback: Pick<
    PlaybackPublicApi,
    'state' | 'seekByRatio' | 'seekTo' | 'setVolume' | 'setPlaybackMode'
  >
  isOpen: Readonly<Ref<boolean>>
}

/** Presentation and explicit transport operations for the fullscreen controls. */
export function useFullscreenPlaybackControls({
  playback,
  isOpen: isFullscreenPlayerOpen,
}: Options) {
  const { t } = useI18n()
  const { songText, playbackSubtitle } = usePlaybackMetadataDisplay()
  const imgError = ref(false)
  const progressFillRef = ref<HTMLElement | null>(null)
  const { preference: infoTypography, style: infoTypographyStyle } = useFullscreenInfoTypography()

  // The lines carry their own size and weight so a parent variable cannot leave the subtitle inherited.
  const titleTypographyStyle = computed(() => ({
    fontSize: `${infoTypography.value.titleFontSizePx}px`,
    fontWeight: infoTypography.value.titleFontWeight,
  }))
  const subtitleTypographyStyle = computed(() => ({
    fontSize: `${infoTypography.value.subtitleFontSizePx}px`,
    fontWeight: infoTypography.value.subtitleFontWeight,
  }))
  const artworkCacheKey = computed(() => playback.state.currentTrack?.artworkCacheKey ?? null)
  const artworkUrl = computed(() => getArtworkUrl(artworkCacheKey.value))
  const title = computed(
    () => songText(playback.state.currentTrack?.title) || t('player.unknownTrack'),
  )
  const subtitle = computed(() =>
    playback.state.currentTrack
      ? playbackSubtitle(playback.state.currentTrack)
      : t('player.unknownTrack'),
  )

  const currentTimeLabel = computed(() => formatTime(playback.state.currentTime))
  const remainingTimeLabel = computed(() => {
    const remaining = Math.max(0, playback.state.duration - playback.state.currentTime)
    return playback.state.duration ? `-${formatTime(remaining)}` : '-0:00'
  })

  const volumeIconClass = computed(() => {
    if (playback.state.isMuted) return 'i-lucide-volume-x'
    if (playback.state.volume <= 0) return 'i-lucide-volume'
    if (playback.state.volume <= 0.33) return 'i-lucide-volume'
    if (playback.state.volume <= 0.66) return 'i-lucide-volume-1'
    return 'i-lucide-volume-2'
  })

  const volumeFillStyle = computed(() => ({
    clipPath: `inset(0 ${(1 - playback.state.volume) * 100}% 0 0 round 999px)`,
  }))

  const repeatButtonLabel = computed(() => {
    if (playback.state.playbackMode === 'repeat-all') return t('fullscreen.repeatEnableOne')
    if (playback.state.playbackMode === 'repeat-one') return t('fullscreen.repeatDisable')
    return t('fullscreen.repeatEnableAll')
  })

  const repeatIconClass = computed(() =>
    playback.state.playbackMode === 'repeat-one' ? 'i-lucide-repeat-1' : 'i-lucide-repeat',
  )

  function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
    const totalSeconds = Math.floor(seconds)
    const minutes = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  function renderProgressRatio(ratio: number): void {
    const fill = progressFillRef.value
    if (!fill) return
    fill.style.transform = `translateX(${(ratio - 1) * 100}%)`
  }

  const {
    valueNow: progressValueNow,
    ratio: progressRatio,
    onPointerDown: handleProgressPointerDown,
    onPointerMove: handleProgressPointerMove,
    onPointerUp: handleProgressPointerUp,
    onPointerCancel: handleProgressPointerCancel,
    onKeydown: handleProgressKeydown,
  } = usePlaybackProgressInteraction({
    duration: computed(() => playback.state.duration),
    currentTime: computed(() => playback.state.currentTime),
    isPlaying: computed(() => playback.state.isPlaying),
    active: isFullscreenPlayerOpen,
    seekByRatio: playback.seekByRatio,
    seekTo: playback.seekTo,
    renderRatio: renderProgressRatio,
    maxVisualFps: 30,
    resolveSeekStepSeconds: (shiftKey) => (shiftKey ? 10 : 5),
  })

  watch(
    () => playback.state.currentTrackId,
    () => {
      imgError.value = false
    },
  )

  function handleVolumeInput(event: Event): void {
    playback.setVolume(Number((event.target as HTMLInputElement).value))
  }

  function handleRepeatClick(): void {
    if (playback.state.playbackMode === 'repeat-all') {
      playback.setPlaybackMode('repeat-one')
      return
    }
    if (playback.state.playbackMode === 'repeat-one') {
      playback.setPlaybackMode('sequential')
      return
    }
    playback.setPlaybackMode('repeat-all')
  }

  return {
    imgError,
    progressFillRef,
    artworkCacheKey,
    artworkUrl,
    title,
    subtitle,
    infoTypographyStyle,
    titleTypographyStyle,
    subtitleTypographyStyle,
    currentTimeLabel,
    remainingTimeLabel,
    volumeIconClass,
    volumeFillStyle,
    repeatButtonLabel,
    repeatIconClass,
    progressValueNow,
    progressRatio,
    handleProgressPointerDown,
    handleProgressPointerMove,
    handleProgressPointerUp,
    handleProgressPointerCancel,
    handleProgressKeydown,
    handleVolumeInput,
    handleRepeatClick,
  }
}
