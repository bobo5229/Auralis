<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { TrackListItem } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import SongRow from '../components/SongRow.vue'

const tracks = ref<TrackListItem[]>([])
const selectedId = ref<number | null>(null)
const scrollRef = ref<HTMLElement | null>(null)

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: tracks.value.length,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => 44,
    overscan: 12,
  })),
)

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

function onSelect(trackId: number) {
  selectedId.value = trackId
}

function onPlay(trackId: number) {
  // TODO: trigger playback when implemented
  selectedId.value = trackId
}

onMounted(async () => {
  tracks.value = await auralis.library.getTracks()
  rowVirtualizer.value.scrollToIndex(0)
})
</script>

<template>
  <section class="flex h-full flex-col">
    <div
      v-if="tracks.length > 0"
      ref="scrollRef"
      class="flex-1 overflow-auto pb-[var(--auralis-playbar-safe-area)]"
    >
      <div :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
        <SongRow
          v-for="virtualRow in virtualRows"
          :key="virtualRow.key"
          :track="tracks[virtualRow.index]"
          :index="virtualRow.index"
          :selected="selectedId === tracks[virtualRow.index].id"
          :style="{
            height: `${virtualRow.size}px`,
            transform: `translateY(${virtualRow.start}px)`,
          }"
          class="absolute left-0 top-0 w-full"
          @select="onSelect"
          @play="onPlay"
        />
      </div>
    </div>

    <div v-else class="flex flex-1 items-center justify-center">
      <p class="text-sm text-ink/42">No tracks found. Add music folders in Settings.</p>
    </div>
  </section>
</template>
