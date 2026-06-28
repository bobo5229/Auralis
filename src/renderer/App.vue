<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppTitleBar from './app/layout/AppTitleBar.vue'
import AppSidebar from './app/layout/AppSidebar.vue'
import NowPlayingPanel from './app/layout/NowPlayingPanel.vue'
import PlayerBar from './app/layout/PlayerBar.vue'
</script>

<template>
  <div class="app-window" data-app-shell-root>
    <AppTitleBar />
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
  </div>
</template>
