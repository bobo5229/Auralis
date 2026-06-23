<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useTheme } from '@renderer/composables/useTheme'

const { isDark, nextThemeLabel, toggleTheme } = useTheme()

const primaryNav = [
  { to: '/', label: 'Library' },
  { to: '/albums', label: 'Albums' },
  { to: '/playback', label: 'Playback' },
  { to: '/archive', label: 'Archive' },
  { to: '/search', label: 'Search' },
]

const utilityNav = [
  { to: '/virtual-list', label: 'Virtual List' },
  { to: '/settings', label: 'Settings' },
]
</script>

<template>
  <aside class="app-sidebar">
    <div class="px-5 py-5">
      <div class="flex items-center justify-between">
        <div class="min-w-0 text-xl font-semibold tracking-0">Auralis</div>
        <button
          class="theme-toggle-button"
          type="button"
          :aria-label="nextThemeLabel"
          :title="nextThemeLabel"
          @click="toggleTheme"
        >
          <span class="h-4 w-4" :class="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"></span>
        </button>
      </div>
      <div class="mt-1 text-xs text-ink/52">Local Music Archive</div>
    </div>

    <nav class="flex flex-1 flex-col gap-6 px-3">
      <section>
        <div class="sidebar-section-label">Library</div>
        <RouterLink
          v-for="item in primaryNav"
          :key="item.to"
          :to="item.to"
          class="sidebar-link"
          active-class="sidebar-link-active"
        >
          {{ item.label }}
        </RouterLink>
      </section>

      <section>
        <div class="sidebar-section-label">Tools</div>
        <RouterLink
          v-for="item in utilityNav"
          :key="item.to"
          :to="item.to"
          class="sidebar-link"
          active-class="sidebar-link-active"
        >
          {{ item.label }}
        </RouterLink>
      </section>
    </nav>
  </aside>
</template>
