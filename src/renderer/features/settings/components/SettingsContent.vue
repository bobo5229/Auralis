<script setup lang="ts">
import AppearanceSettings from './AppearanceSettings.vue'
import PlaybackSettings from './PlaybackSettings.vue'
import MusicLibrarySettings from './MusicLibrarySettings.vue'
import AboutSettings from './AboutSettings.vue'
import type { SettingsSection } from '../utils/settingsSections'
import '../styles/settings.chrome.css'

defineProps<{ section: SettingsSection }>()
</script>

<template>
  <div class="settings-surface">
    <AppearanceSettings v-if="section === 'appearance'" />
    <PlaybackSettings v-else-if="section === 'playback'" />
    <MusicLibrarySettings v-else-if="section === 'library'" />
    <AboutSettings v-else />
  </div>
</template>

<style scoped>
.settings-surface {
  min-width: 0;
  container-type: inline-size;
}
</style>
