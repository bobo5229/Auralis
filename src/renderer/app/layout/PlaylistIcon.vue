<script setup lang="ts">
import SidebarIcon from './SidebarIcon.vue'

defineProps<{ kind: 'playlist' | 'recentPlayed' | 'mostListened' | 'recentAdded' | 'custom' }>()
</script>

<template>
  <SidebarIcon :kind="kind" class="playlist-kind-icon" />
</template>
