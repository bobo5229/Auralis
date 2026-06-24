<script setup lang="ts">
import { computed, ref } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'

const parentRef = ref<HTMLElement | null>(null)
const rows = Array.from({ length: 30000 }, (_, index) => ({
  id: index + 1,
  title: `Local Track ${String(index + 1).padStart(5, '0')}`,
  album: `Archive Volume ${Math.floor(index / 12) + 1}`,
}))

const rowVirtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.value,
  estimateSize: () => 48,
  overscan: 8,
})

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())
</script>

<template>
  <section class="content-frame">
    <div class="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-semibold tracking-0">Virtual List</h1>
        <p class="mt-2 text-sm text-[var(--auralis-text-muted)]">
          30,000 rows rendered through TanStack Virtual.
        </p>
      </div>
      <div
        class="rounded bg-[var(--auralis-control-primary-bg)] px-3 py-2 text-sm text-[var(--auralis-control-primary-text)]"
      >
        {{ rows.length }} rows
      </div>
    </div>

    <div
      ref="parentRef"
      class="h-126 overflow-auto rounded border border-[var(--auralis-border-subtle)] bg-[var(--auralis-sidebar-bg)]/70"
    >
      <div :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
        <div
          v-for="virtualRow in virtualRows"
          :key="virtualRow.key"
          class="absolute left-0 top-0 grid w-full grid-cols-[96px_1fr_1fr] items-center border-b border-[var(--auralis-border-subtle)] px-4 text-sm"
          :style="{
            height: `${virtualRow.size}px`,
            transform: `translateY(${virtualRow.start}px)`,
          }"
        >
          <span class="text-[var(--auralis-text-subtle)]">#{{ rows[virtualRow.index].id }}</span>
          <span class="font-medium">{{ rows[virtualRow.index].title }}</span>
          <span class="truncate text-[var(--auralis-text-muted)]">
            {{ rows[virtualRow.index].album }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
