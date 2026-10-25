<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsSegmentedControl from '@renderer/shared/components/SettingsSegmentedControl.vue'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'

const { t } = useI18n()
const {
  songInfoScript,
  lyricsScript,
  songInfoPersistFailed,
  lyricsPersistFailed,
  setSongInfoScript,
  setLyricsScript,
} = useChineseTextDisplay()
const options = ['simplified', 'traditional'] as const
const rows = [
  { id: 'songInfo', value: songInfoScript, failed: songInfoPersistFailed, set: setSongInfoScript },
  { id: 'lyrics', value: lyricsScript, failed: lyricsPersistFailed, set: setLyricsScript },
] as const
</script>

<template>
  <div class="settings-group chinese-text-settings">
    <div class="settings-group-header">
      <h2 class="settings-group-title">{{ t('settings.appearance.groups.textDisplay') }}</h2>
    </div>
    <div class="settings-group-card">
      <div v-for="row in rows" :key="row.id" class="settings-row settings-row--with-desc">
        <div>
          <strong>{{ t(`settings.appearance.textDisplay.${row.id}`) }}</strong>
          <span :id="`text-display-${row.id}-description`">{{
            t(`settings.appearance.textDisplay.${row.id}Description`)
          }}</span>
          <span v-if="row.failed.value" role="status">{{
            t('settings.appearance.textDisplay.persistFailed')
          }}</span>
        </div>
        <SettingsSegmentedControl
          :id="`text-display-${row.id}`"
          :label="t(`settings.appearance.textDisplay.${row.id}`)"
          :describedby="`text-display-${row.id}-description`"
          :model-value="row.value.value"
          :options="
            options.map((value) => ({
              value,
              label: t(`settings.appearance.textDisplay.${value}`),
            }))
          "
          @update:model-value="row.set($event as (typeof options)[number])"
        />
      </div>
    </div>
  </div>
</template>
