<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { COVER_SIZE, type RoamAlbum } from '../types'
import { groupRoamAlbums } from '../utils/groupRoamAlbums'
import { libraryFingerprint } from '../utils/libraryFingerprint'
import { computeVisibleTiles } from '../composables/useVisibleCells'
import { useRoamPan } from '../composables/useRoamPan'

const isLoading = ref(true)
const isScanning = ref(false)
const isDragging = ref(false)
const albums = shallowRef<RoamAlbum[]>([])
const seed = shallowRef(0)
const viewportW = shallowRef(0)
const viewportH = shallowRef(0)
const viewportRef = ref<HTMLElement | null>(null)
/** Artwork keys that failed to load — shown as placeholder. */
const failedArtworkKeys = shallowRef(new Set<string>())

const {
  cameraX,
  cameraY,
  centerOnOrigin,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  dispose: disposePan,
} = useRoamPan()

let resizeObserver: ResizeObserver | null = null
let unsubscribeChanged: (() => void) | null = null
/** True after the first successful viewport measure + center. */
let hasCenteredOnce = false

const tiles = computed(() =>
  computeVisibleTiles({
    albums: albums.value,
    seed: seed.value,
    cameraX: cameraX.value,
    cameraY: cameraY.value,
    viewportW: viewportW.value,
    viewportH: viewportH.value,
  }),
)

const showCanvas = computed(() => !isLoading.value && albums.value.length > 0)
const showEmptyLibrary = computed(
  () => !isLoading.value && albums.value.length === 0 && !isScanning.value,
)
const showScanningEmpty = computed(
  () => !isLoading.value && albums.value.length === 0 && isScanning.value,
)

const worldStyle = computed(() => ({
  transform: `translate3d(${-cameraX.value}px, ${-cameraY.value}px, 0)`,
}))

function measureViewport(): void {
  const el = viewportRef.value
  if (!el) return
  viewportW.value = el.clientWidth
  viewportH.value = el.clientHeight
}

function centerIfReady(force: boolean): void {
  measureViewport()
  if (viewportW.value <= 0 || viewportH.value <= 0) return
  if (force || !hasCenteredOnce) {
    centerOnOrigin(viewportW.value, viewportH.value)
    hasCenteredOnce = true
  }
}

async function loadLibrary(options?: { reCenter?: boolean }): Promise<void> {
  const [tracks, scanStatus] = await Promise.all([
    auralis.library.getTracks(),
    auralis.library.getScanStatus(),
  ])

  isScanning.value = scanStatus?.status === 'scanning'
  const nextAlbums = groupRoamAlbums(tracks)
  albums.value = nextAlbums
  seed.value = libraryFingerprint(nextAlbums.map((a) => a.key))
  failedArtworkKeys.value = new Set()

  if (nextAlbums.length > 0) {
    await nextTick()
    centerIfReady(options?.reCenter === true)
  }
}

function artworkUrlFor(key: string | null): string | null {
  if (!key || failedArtworkKeys.value.has(key)) return null
  return getArtworkUrl(key)
}

function onArtworkError(key: string | null): void {
  if (!key || failedArtworkKeys.value.has(key)) return
  const next = new Set(failedArtworkKeys.value)
  next.add(key)
  failedArtworkKeys.value = next
}

function handlePointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  isDragging.value = true
  onPointerDown(event)
}

function handlePointerMove(event: PointerEvent): void {
  onPointerMove(event)
}

function handlePointerUp(event: PointerEvent): void {
  isDragging.value = false
  onPointerUp(event)
}

function handlePointerCancel(event: PointerEvent): void {
  isDragging.value = false
  onPointerCancel(event)
}

function handleLostPointerCapture(): void {
  isDragging.value = false
}

onMounted(async () => {
  try {
    await loadLibrary({ reCenter: true })
  } finally {
    isLoading.value = false
  }

  await nextTick()
  if (albums.value.length > 0) {
    centerIfReady(true)
  }

  if (viewportRef.value) {
    resizeObserver = new ResizeObserver(() => {
      // Keep camera top-left stable on resize; only refresh viewport size / tiles.
      measureViewport()
    })
    resizeObserver.observe(viewportRef.value)
  }

  unsubscribeChanged = auralis.library.onChanged((event) => {
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') return
    void loadLibrary({ reCenter: true })
  })
})

onBeforeUnmount(() => {
  disposePan()
  resizeObserver?.disconnect()
  resizeObserver = null
  unsubscribeChanged?.()
  unsubscribeChanged = null
})
</script>

<template>
  <section class="roam-page relative h-full min-h-0 w-full overflow-hidden">
    <div v-if="isLoading" class="flex h-full min-h-0 items-center justify-center">
      <p class="text-sm text-[var(--auralis-text-faint)]">加载中…</p>
    </div>

    <div v-else-if="showEmptyLibrary" class="flex h-full min-h-0 items-center justify-center px-8">
      <p class="max-w-md text-center text-sm text-[var(--auralis-text-faint)]">
        还没有专辑。先在设置里添加音乐文件夹并完成扫描。
      </p>
    </div>

    <div v-else-if="showScanningEmpty" class="flex h-full min-h-0 items-center justify-center px-8">
      <p class="max-w-md text-center text-sm text-[var(--auralis-text-faint)]">
        正在扫描曲库，完成后可在此漫游封面。
      </p>
    </div>

    <div
      v-show="showCanvas"
      ref="viewportRef"
      class="roam-viewport absolute inset-0 overflow-hidden select-none"
      :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
      role="application"
      aria-label="专辑漫游"
      style="touch-action: none"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerCancel"
      @lostpointercapture="handleLostPointerCapture"
      @wheel.prevent
    >
      <div class="roam-world absolute left-0 top-0 will-change-transform" :style="worldStyle">
        <div
          v-for="tile in tiles"
          :key="tile.id"
          class="roam-tile absolute overflow-hidden"
          :style="{
            left: `${tile.x}px`,
            top: `${tile.y}px`,
            width: `${COVER_SIZE}px`,
            height: `${COVER_SIZE}px`,
          }"
        >
          <img
            v-if="artworkUrlFor(tile.album.artworkCacheKey)"
            class="roam-tile-img h-full w-full object-cover"
            :src="artworkUrlFor(tile.album.artworkCacheKey) ?? undefined"
            alt=""
            draggable="false"
            @error="onArtworkError(tile.album.artworkCacheKey)"
          />
          <div v-else class="roam-tile-placeholder h-full w-full" />
        </div>
      </div>

      <div class="roam-vignette pointer-events-none absolute inset-0" aria-hidden="true" />
    </div>
  </section>
</template>

<style scoped>
.roam-viewport {
  user-select: none;
  -webkit-user-select: none;
}

.roam-tile,
.roam-tile-img,
.roam-tile-placeholder {
  pointer-events: none;
}

.roam-tile {
  background: var(--auralis-artwork-placeholder-bg);
  border-radius: 2px;
}

.roam-tile-placeholder {
  background: var(--auralis-artwork-placeholder-bg);
}

/* Light radial darkening — center stays clear, edges soft black. */
.roam-vignette {
  background: radial-gradient(
    ellipse at center,
    transparent 0%,
    transparent 45%,
    rgba(0, 0, 0, 0.22) 100%
  );
}
</style>
