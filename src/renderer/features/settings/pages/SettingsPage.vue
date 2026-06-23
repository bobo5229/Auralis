<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { AppInfo } from '@shared/types/app'
import { auralis } from '@renderer/shared/ipc/client'
import MusicLibrarySettings from '../components/MusicLibrarySettings.vue'

const appInfo = ref<AppInfo | null>(null)

onMounted(async () => {
  appInfo.value = await auralis.app.getInfo()
})
</script>

<template>
  <section class="content-frame">
    <h1 class="text-3xl font-semibold tracking-0">Settings</h1>

    <dl class="mt-6 grid gap-3 rounded border border-black/10 bg-white/56 p-5 text-sm">
      <div class="grid gap-1 sm:grid-cols-[150px_1fr]">
        <dt class="text-ink/55">Version</dt>
        <dd>{{ appInfo?.version ?? '0.1.0' }}</dd>
      </div>
      <div class="grid gap-1 sm:grid-cols-[150px_1fr]">
        <dt class="text-ink/55">Database</dt>
        <dd class="break-all">{{ appInfo?.databasePath ?? '' }}</dd>
      </div>
    </dl>

    <MusicLibrarySettings />
  </section>
</template>
