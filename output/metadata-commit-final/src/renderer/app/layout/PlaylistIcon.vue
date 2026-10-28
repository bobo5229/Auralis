<script setup lang="ts">
import SidebarIcon from '@renderer/shared/components/SidebarIcon.vue'

defineProps<{ kind: 'playlist' | 'recentPlayed' | 'mostListened' | 'recentAdded' | 'custom' }>()
</script>

<template>
  <SidebarIcon :kind="kind" class="playlist-kind-icon" />
</template>
