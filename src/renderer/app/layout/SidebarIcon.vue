<script setup lang="ts">
export type SidebarIconKind =
  | 'song'
  | 'albums'
  | 'cd'
  | 'archive'
  | 'playlist'
  | 'recentPlayed'
  | 'mostListened'
  | 'recentAdded'
  | 'custom'
  | 'filters'
  | 'refresh'
  | 'sun'
  | 'moon'
  | 'settings'

defineProps<{ kind: SidebarIconKind }>()
</script>

<template>
  <span class="sidebar-symbol" aria-hidden="true">
    <!-- 侧栏图标共用画布和线宽，选中态只改变语义色。 -->
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <template v-if="kind === 'song'">
        <ellipse cx="7.5" cy="18" rx="3.5" ry="2.7" />
        <path d="M11 18V3.5l9 3" />
      </template>
      <template v-else-if="kind === 'albums'">
        <path d="m12 3-9 5 9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" />
      </template>
      <template v-else-if="kind === 'cd'">
        <rect x="3" y="3" width="18" height="18" rx="3.5" />
        <circle cx="12" cy="12" r="5.5" />
        <circle cx="12" cy="12" r="1.5" />
      </template>
      <template v-else-if="kind === 'archive'">
        <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
        <path d="M2.5 7H5M2.5 12H5M2.5 17H5" />
        <path d="m13 12 1-4 5-5a1.4 1.4 0 0 1 2 2l-5 5-3 2Z" />
      </template>
      <template v-else-if="kind === 'playlist'">
        <path d="M3 5h18M3 10h12M3 15h8M3 20h8" />
        <path d="m16 14 5 3-5 3v-6Z" />
      </template>
      <template v-else-if="kind === 'recentPlayed'">
        <path d="M3.5 8.5a9 9 0 1 1 1.9 10M3.5 3.5v5h5" />
        <path d="M12 7v5l3.5 2" />
      </template>
      <template v-else-if="kind === 'mostListened'">
        <path d="M3 21h18M4 21v-9h4v9M10 21V4h4v17M16 21V9h4v12" />
      </template>
      <template v-else-if="kind === 'recentAdded'">
        <path d="M3 5h18M3 10h10M3 15h8M3 20h8M17 13v8M13 17h8" />
      </template>
      <template v-else-if="kind === 'custom'">
        <path d="M3 5h18M3 10h10M3 15h8M3 20h8" />
        <path d="m17 12 1.2 3.8L22 17l-3.8 1.2L17 22l-1.2-3.8L12 17l3.8-1.2L17 12Z" />
      </template>
      <template v-else-if="kind === 'filters'">
        <path d="M3 6h2M9 6h12M3 18h12M19 18h2" />
        <circle cx="7" cy="6" r="2" />
        <circle cx="17" cy="18" r="2" />
      </template>
      <template v-else-if="kind === 'refresh'">
        <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8.5M21 3v5.5h-5.5" />
        <path d="M21 12a9 9 0 0 1-15.4 6.4L3 15.5M3 21v-5.5h5.5" />
      </template>
      <template v-else-if="kind === 'sun'">
        <circle cx="12" cy="12" r="4.5" />
        <path
          d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"
        />
      </template>
      <template v-else-if="kind === 'moon'">
        <path d="M20.9 13.2A9 9 0 1 1 10.8 3.1a7 7 0 0 0 10.1 10.1Z" />
      </template>
      <template v-else-if="kind === 'settings'">
        <path
          d="M10 3h4l.4 2.8 2.1 1.2 2.6-1 2 3.4-2.2 1.6v2l2.2 1.6-2 3.4-2.6-1-2.1 1.2-.4 2.8h-4l-.4-2.8-2.1-1.2-2.6 1-2-3.4 2.2-1.6v-2L2.9 9.4l2-3.4 2.6 1 2.1-1.2L10 3Z"
        />
        <circle cx="12" cy="12" r="3" />
      </template>
    </svg>
  </span>
</template>

<style scoped>
.sidebar-symbol {
  display: inline-block;
  width: 1em;
  height: 1em;
  flex: 0 0 auto;
}

.sidebar-symbol > svg {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
