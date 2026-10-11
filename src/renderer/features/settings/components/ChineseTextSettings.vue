<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import type { ChineseScript } from '@renderer/features/appearance/utils/chineseText'

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
const buttons = ref<Record<string, HTMLButtonElement | null>>({})
function select(row: (typeof rows)[number], value: ChineseScript): void {
  row.set(value)
  buttons.value[`${row.id}-${value}`]?.focus()
}
</script>

<template>
  <div class="settings-group chinese-text-settings">
    <div class="settings-group-header">
      <h2 class="settings-group-title">{{ t('settings.appearance.textDisplay.title') }}</h2>
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
        <div
          class="settings-segmented-control"
          role="radiogroup"
          :aria-label="t(`settings.appearance.textDisplay.${row.id}`)"
          :aria-describedby="`text-display-${row.id}-description`"
        >
          <button
            v-for="option in options"
            :key="option"
            :ref="
              (el) => {
                buttons[`${row.id}-${option}`] = el as HTMLButtonElement | null
              }
            "
            type="button"
            class="settings-segmented-option"
            role="radio"
            :aria-checked="row.value.value === option"
            :tabindex="row.value.value === option ? 0 : -1"
            :class="{ 'is-selected': row.value.value === option }"
            @click="select(row, option)"
            @keydown.left.prevent="
              select(row, row.value.value === 'simplified' ? 'traditional' : 'simplified')
            "
            @keydown.right.prevent="
              select(row, row.value.value === 'simplified' ? 'traditional' : 'simplified')
            "
            @keydown.up.prevent="
              select(row, row.value.value === 'simplified' ? 'traditional' : 'simplified')
            "
            @keydown.down.prevent="
              select(row, row.value.value === 'simplified' ? 'traditional' : 'simplified')
            "
            @keydown.home.prevent="select(row, 'simplified')"
            @keydown.end.prevent="select(row, 'traditional')"
          >
            {{ t(`settings.appearance.textDisplay.${option}`) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
