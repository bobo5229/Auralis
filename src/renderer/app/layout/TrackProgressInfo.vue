<script setup lang="ts">
interface TrackDisplayInfo {
  title: string
  subtitle: string
  coverUrl: string | null
  progress: number
}

const track = null as TrackDisplayInfo | null

function handleCoverClick(): void {
  // Reserved for future full-screen player navigation
}
</script>

<template>
  <div class="track-info-card">
    <!-- Empty state -->
    <div v-if="!track" class="flex flex-col items-center gap-1.5">
      <span class="text-sm font-semibold tracking-wide text-ink/35">Auralis</span>
      <div class="track-progress opacity-30">
        <div class="track-progress-fill" style="width: 0%"></div>
      </div>
    </div>

    <!-- Track state -->
    <div v-else>
      <div class="track-info-row">
        <div
          class="track-cover cursor-pointer"
          role="button"
          tabindex="0"
          @click="handleCoverClick"
        >
          <div
            v-if="track.coverUrl"
            class="h-full w-full rounded-[inherit] bg-cover bg-center"
            :style="{ backgroundImage: `url(${track.coverUrl})` }"
          ></div>
          <div v-else class="flex h-full w-full items-center justify-center text-ink/20">♪</div>
        </div>
        <div class="track-text">
          <div class="track-title">{{ track.title }}</div>
          <div class="track-subtitle">{{ track.subtitle }}</div>
        </div>
      </div>
      <div class="track-progress">
        <div class="track-progress-fill" :style="{ width: `${track.progress}%` }"></div>
      </div>
    </div>
  </div>
</template>
