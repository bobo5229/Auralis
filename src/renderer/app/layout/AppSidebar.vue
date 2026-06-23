<script setup lang="ts">
import { RouterLink } from 'vue-router'

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
      <div class="text-xl font-semibold tracking-0">Auralis</div>
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
