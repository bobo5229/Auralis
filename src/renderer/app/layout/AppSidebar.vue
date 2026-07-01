<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from '@renderer/composables/useTheme'

const route = useRoute()
const { isDark, nextThemeLabel, isThemeTransitioning, toggleThemeFromElement } = useTheme()
const themeButton = ref<HTMLButtonElement>()

function handleThemeToggle(): void {
  if (!themeButton.value) return
  toggleThemeFromElement(themeButton.value)
}
const activePath = ref(route.path)

const primaryNav = [
  { to: '/', label: 'Library', icon: 'i-lucide-music' },
  { to: '/albums', label: 'Albums', icon: 'i-lucide-disc-3' },
  { to: '/playback', label: 'Playback', icon: 'i-lucide-headphones' },
  { to: '/archive', label: 'Archive', icon: 'i-lucide-archive' },
  { to: '/search', label: 'Search', icon: 'i-lucide-search' },
]

const utilityNav = [{ to: '/settings', label: 'Settings', icon: 'i-lucide-settings' }]

watch(
  () => route.path,
  (path) => {
    activePath.value = path
  },
)

function setPendingActive(path: string): void {
  activePath.value = path
}

function setPendingActiveFromPointer(event: PointerEvent, path: string): void {
  if (event.button !== 0) {
    return
  }

  setPendingActive(path)
}
</script>

<template>
  <aside class="app-sidebar">
    <div class="px-5 py-5">
      <div class="flex items-center justify-between">
        <div class="min-w-0 text-xl font-semibold tracking-0">Auralis</div>
        <button
          ref="themeButton"
          class="theme-toggle-button"
          type="button"
          :aria-label="nextThemeLabel"
          :title="nextThemeLabel"
          :aria-disabled="isThemeTransitioning"
          @click="handleThemeToggle"
        >
          <span class="h-4 w-4" :class="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"></span>
        </button>
      </div>
      <div class="mt-1 text-xs text-[var(--auralis-text-subtle)]">Local Music Archive</div>
    </div>

    <nav class="flex flex-1 flex-col gap-6 px-3">
      <section>
        <div class="sidebar-section-label">Library</div>
        <RouterLink
          v-for="item in primaryNav"
          :key="item.to"
          :to="item.to"
          class="sidebar-link"
          :class="{
            'sidebar-link-active':
              activePath === item.to ||
              (item.to === '/albums' && activePath.startsWith('/albums/')),
          }"
          @pointerdown="setPendingActiveFromPointer($event, item.to)"
          @keydown.enter="setPendingActive(item.to)"
          @keydown.space="setPendingActive(item.to)"
        >
          <span class="inline-block h-4 w-4" :class="item.icon"></span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </section>

      <section>
        <div class="sidebar-section-label">Tools</div>
        <RouterLink
          v-for="item in utilityNav"
          :key="item.to"
          :to="item.to"
          class="sidebar-link"
          :class="{ 'sidebar-link-active': activePath === item.to }"
          @pointerdown="setPendingActiveFromPointer($event, item.to)"
          @keydown.enter="setPendingActive(item.to)"
          @keydown.space="setPendingActive(item.to)"
        >
          <span class="inline-block h-4 w-4" :class="item.icon"></span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </section>
    </nav>
  </aside>
</template>
