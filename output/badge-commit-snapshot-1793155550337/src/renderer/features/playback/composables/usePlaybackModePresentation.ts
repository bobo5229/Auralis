// @unocss-include
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlaybackMode } from '../types'

const modeIcons: Record<PlaybackMode, string> = {
  'repeat-all': 'i-ph-repeat',
  sequential: 'i-ph-arrow-right',
  'repeat-one': 'i-ph-repeat-once',
  shuffle: 'i-ph-shuffle',
  'album-shuffle': 'i-ph-vinyl-record',
}

export function usePlaybackModePresentation(mode: MaybeRefOrGetter<PlaybackMode>) {
  const { t } = useI18n()
  const options = computed(() =>
    (Object.keys(modeIcons) as PlaybackMode[]).map((id) => ({
      id,
      icon: modeIcons[id],
      label: t(`player.modeOption.${id}`),
      description: id === 'album-shuffle' ? t('player.albumShuffleDescription') : '',
    })),
  )
  const icon = computed(() => modeIcons[toValue(mode)])
  const label = computed(() =>
    t('player.currentMode', { mode: t(`player.modeOption.${toValue(mode)}`) }),
  )
  const tooltip = computed(() =>
    toValue(mode) === 'album-shuffle'
      ? `${label.value} · ${t('player.albumShuffleDescription')}`
      : label.value,
  )

  return { options, icon, label, tooltip }
}
