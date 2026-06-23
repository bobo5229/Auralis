<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { LibraryStats } from '@shared/types/app'
import { auralis } from '@renderer/shared/ipc/client'
import { fadeIn } from '@renderer/shared/animation/motion'

const stats = ref<LibraryStats | null>(null)
const page = ref<HTMLElement | null>(null)

onMounted(async () => {
  stats.value = await auralis.library.getStats()

  if (page.value) {
    fadeIn(page.value)
  }
})
</script>

<template>
  <section ref="page" class="content-frame opacity-0">
    <div class="mb-8">
      <h1 class="text-3xl font-semibold tracking-0">Library</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-ink/64">
        A calm foundation for a local collection. The database is ready, but no music has been
        scanned.
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <article class="quiet-panel rounded p-5">
        <div class="text-sm text-ink/58">Tracks</div>
        <div class="mt-3 text-4xl font-semibold">{{ stats?.trackCount ?? 0 }}</div>
      </article>

      <article class="quiet-panel rounded p-5">
        <div class="text-sm text-ink/58">Albums</div>
        <div class="mt-3 text-4xl font-semibold">{{ stats?.albumCount ?? 0 }}</div>
      </article>
    </div>
  </section>
</template>
