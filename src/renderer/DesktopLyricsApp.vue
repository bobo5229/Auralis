<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { DesktopLyricsPayload } from '@shared/types/desktopLyrics'
import { desktopLyricsApi } from './shared/ipc/desktopLyricsClient'

const fallbackPayload: DesktopLyricsPayload = {
  trackId: null,
  title: null,
  artist: null,
  currentLine: '',
  nextLine: '',
  status: 'idle',
  isPlaying: false,
}

const payload = ref<DesktopLyricsPayload>(fallbackPayload)

const unsubscribeUpdate = desktopLyricsApi.desktopLyrics.onUpdate((nextPayload) => {
  payload.value = nextPayload
})

onMounted(() => {
  document.documentElement.classList.add('desktop-lyrics-root')
})

onBeforeUnmount(() => {
  document.documentElement.classList.remove('desktop-lyrics-root')
  unsubscribeUpdate()
})
</script>

<template>
  <main class="desktop-lyrics-window">
    <div class="desktop-lyrics-drag-region" aria-hidden="true"></div>
    <section class="desktop-lyrics-lines" aria-label="桌面歌词">
      <div class="desktop-lyrics-line desktop-lyrics-line-current">
        {{ payload.currentLine }}
      </div>
      <div class="desktop-lyrics-line desktop-lyrics-line-next">
        {{ payload.nextLine }}
      </div>
    </section>
  </main>
</template>
