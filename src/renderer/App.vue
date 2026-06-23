<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppSidebar from './app/layout/AppSidebar.vue'
import NowPlayingPanel from './app/layout/NowPlayingPanel.vue'
import PlayerBar from './app/layout/PlayerBar.vue'
</script>

<template>
  <div class="app-shell">
    <AppSidebar />

    <main class="app-main">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </main>

    <NowPlayingPanel />
    <PlayerBar />
  </div>
</template>
