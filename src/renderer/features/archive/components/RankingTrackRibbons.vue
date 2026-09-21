<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ListeningRankingItem } from '@shared/types/archive'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import RankingTrackRibbon from './RankingTrackRibbon.vue'

const props = defineProps<{ items: ListeningRankingItem[] }>()
const items = computed(() => props.items.slice(0, 10))
const playback = usePlayback()
const root = ref<HTMLElement | null>(null)
const active = ref(-1)
const busy = ref(false)
const error = ref('')
let request = 0
let pointerX = -1
let pointerY = -1

function move(event: PointerEvent): void {
  if (event.pointerType !== 'mouse' || (event.clientX === pointerX && event.clientY === pointerY))
    return
  pointerX = event.clientX
  pointerY = event.clientY
  const row = (event.target as HTMLElement).closest<HTMLElement>('[data-index]')
  active.value = row ? Number(row.dataset.index) : -1
}
function leave(): void {
  pointerX = pointerY = -1
  active.value = -1
}
function focus(event: FocusEvent): void {
  const target = event.target as HTMLElement
  if (target.matches(':focus-visible'))
    active.value = Number(target.closest<HTMLElement>('[data-index]')?.dataset.index ?? -1)
}
function blur(event: FocusEvent): void {
  if (!root.value?.contains(event.relatedTarget as Node | null)) active.value = -1
}
function keydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement
  if (event.key === 'Escape') {
    target.blur()
    leave()
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  event.preventDefault()
  const index = Number(target.closest<HTMLElement>('[data-index]')?.dataset.index ?? 0)
  const next = Math.max(
    0,
    Math.min(items.value.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
  )
  active.value = next
  root.value?.querySelectorAll<HTMLButtonElement>('.inspect')[next]?.focus({ preventScroll: true })
}
async function play(item: ListeningRankingItem): Promise<void> {
  if (busy.value || playback.isPlaybackPending.value) return
  const token = ++request
  const id = Number(item.key)
  error.value = ''
  busy.value = true
  try {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid ranking track ID')
    if (playback.state.currentTrackId === id) {
      await playback.togglePlayPause()
    } else {
      const metadata = await auralis.metadata.getTrackMetadata(id)
      if (token !== request) return
      if (!metadata) throw new Error('Ranking track is no longer available')
      await playback.playTrackFromQueue(
        [
          {
            id,
            title: metadata.title,
            artist: metadata.artistDisplay,
            album: metadata.albumTitle,
            albumArtist: metadata.albumArtistDisplay,
            durationSeconds: null,
            artworkCacheKey: item.artworkCacheKey,
          },
        ],
        id,
      )
    }
    if (token === request && playback.state.error) error.value = playback.state.error
  } catch (cause) {
    if (token !== request) return
    error.value = '暂时无法播放这首歌曲，请重试。'
    rendererDiagnostics.warn({
      scope: 'archive.ranking-playback',
      message: 'Failed to play ranked track',
      cause,
    })
  } finally {
    if (token === request) busy.value = false
  }
}
watch(
  () => props.items,
  () => {
    request++
    busy.value = false
    error.value = ''
    leave()
  },
)
onBeforeUnmount(() => {
  request++
})
</script>

<template>
  <div class="track-ribbons">
    <ol
      ref="root"
      :class="{ 'has-open': active >= 0 }"
      aria-label="单曲收听排行"
      @pointermove="move"
      @pointerleave="leave"
      @focusin="focus"
      @focusout="blur"
      @keydown="keydown"
    >
      <RankingTrackRibbon
        v-for="(item, index) in items"
        :key="item.key"
        :item="item"
        :index="index"
        :expanded="active === index"
        :playing="playback.state.currentTrackId === Number(item.key) && playback.state.isPlaying"
        :busy="busy || playback.isPlaybackPending.value"
        @inspect="active = active === index ? -1 : index"
        @play="play(item)"
      />
    </ol>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.track-ribbons {
  margin-top: 20px;
}
ol {
  list-style: none;
  margin: 0;
  padding: 0 0 132px;
  border-top: 1px solid var(--auralis-border-subtle);
}
.has-open :deep(.ribbon:not(.open) .art) {
  opacity: 0.65;
}
.has-open :deep(.ribbon:not(.open) .name) {
  color: var(--auralis-text-muted);
}
.error {
  color: var(--auralis-text-muted);
  font-size: 13px;
}
</style>
