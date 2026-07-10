<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { auralis } from '@renderer/shared/ipc/client'

const route = useRoute()

const smartPlaylistTitle = ref<string | null>(null)
const playlistTitle = ref<string | null>(null)

const smartPlaylistId = computed(() => {
  if (route.name !== 'smart-playlist') return null
  const parsed = Number(route.params.id)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
})
const playlistId = computed(() => {
  if (route.name !== 'playlist') return null
  const parsed = Number(route.params.id)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
})

const title = computed(() => {
  if (smartPlaylistId.value !== null) return smartPlaylistTitle.value ?? ''
  if (playlistId.value !== null) return playlistTitle.value ?? ''
  return String(route.meta.title ?? 'Auralis')
})

async function loadSmartPlaylistTitle(): Promise<void> {
  const id = smartPlaylistId.value
  smartPlaylistTitle.value = null

  if (id === null) return

  const detail = await auralis.smartPlaylists.getDetail(id)
  if (smartPlaylistId.value === id) {
    smartPlaylistTitle.value = detail?.playlist.name ?? null
  }
}

async function loadPlaylistTitle(): Promise<void> {
  const id = playlistId.value
  playlistTitle.value = null

  if (id === null) return

  const detail = await auralis.playlists.getDetail(id)
  if (playlistId.value === id) {
    playlistTitle.value = detail?.playlist.name ?? null
  }
}

function onSmartPlaylistsChanged(): void {
  void loadSmartPlaylistTitle()
}

function onPlaylistsChanged(): void {
  void loadPlaylistTitle()
}

watch(smartPlaylistId, () => {
  void loadSmartPlaylistTitle()
})

watch(playlistId, () => {
  void loadPlaylistTitle()
})

onMounted(() => {
  void loadSmartPlaylistTitle()
  void loadPlaylistTitle()
  window.addEventListener('auralis-smart-playlists-changed', onSmartPlaylistsChanged)
  window.addEventListener('auralis-playlists-changed', onPlaylistsChanged)
})

onBeforeUnmount(() => {
  window.removeEventListener('auralis-smart-playlists-changed', onSmartPlaylistsChanged)
  window.removeEventListener('auralis-playlists-changed', onPlaylistsChanged)
})

function minimize(): void {
  auralis.window.minimize()
}

function toggleMaximize(): void {
  auralis.window.toggleMaximize()
}

function close(): void {
  auralis.window.close()
}
</script>

<template>
  <header class="app-titlebar">
    <div class="app-titlebar-brand">
      <span class="app-titlebar-logo i-lucide-music"></span>
      <span>Auralis</span>
    </div>

    <div class="app-titlebar-title">{{ title }}</div>

    <div class="app-titlebar-controls">
      <button
        class="window-dot bg-[#f5c542]"
        aria-label="Minimize window"
        title="Minimize"
        @click="minimize"
      ></button>
      <button
        class="window-dot bg-[#44c74e]"
        aria-label="Maximize or restore window"
        title="Maximize / Restore"
        @click="toggleMaximize"
      ></button>
      <button
        class="window-dot bg-[#e9494b]"
        aria-label="Close window"
        title="Close"
        @click="close"
      ></button>
    </div>
  </header>
</template>
