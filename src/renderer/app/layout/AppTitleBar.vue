<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { auralis } from '@renderer/shared/ipc/client'

const route = useRoute()

const title = computed(() => String(route.meta.title ?? 'Auralis'))

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
