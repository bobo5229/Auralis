<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { COVER_SIZE, STRIDE, type RoamAlbum } from '../types'
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
const worldRef = ref<HTMLElement | null>(null)
const snapshotRef = ref<HTMLCanvasElement | null>(null)
const isMotionActive = ref(false)
const snapshotReady = ref(false)
const tileCameraX = shallowRef(0)
const tileCameraY = shallowRef(0)
/** Artwork keys that failed to load — shown as placeholder. */
const failedArtworkKeys = shallowRef(new Set<string>())

let tileCellX: number | null = null
let tileCellY: number | null = null
let motionActive = false
let pendingTileCameraX = 0
let pendingTileCameraY = 0
let snapshotBuildTimer = 0
let snapshotBuildToken = 0
let snapshotBuildEarliest = 0

const DRAG_SNAPSHOT_SCALE = 0.5

function updateTileWindow(x: number, y: number): void {
  const nextCellX = Math.floor(x / STRIDE)
  const nextCellY = Math.floor(y / STRIDE)
  if (nextCellX === tileCellX && nextCellY === tileCellY) return

  tileCellX = nextCellX
  tileCellY = nextCellY
  tileCameraX.value = nextCellX * STRIDE
  tileCameraY.value = nextCellY * STRIDE
}

function applyCameraPosition(x: number, y: number): void {
  if (worldRef.value) {
    worldRef.value.style.transform = `translate3d(${-x}px, ${-y}px, 0)`
  }

  pendingTileCameraX = x
  pendingTileCameraY = y
  if (!motionActive) {
    updateTileWindow(x, y)
  }
}

function handleMotionChange(moving: boolean): void {
  motionActive = moving
  isMotionActive.value = moving
  if (!moving) {
    snapshotReady.value = false
    updateTileWindow(pendingTileCameraX, pendingTileCameraY)
    snapshotBuildEarliest = performance.now() + 3000
    scheduleSnapshotBuild()
  }
}

const {
  centerOnOrigin,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  dispose: disposePan,
} = useRoamPan({
  onCameraChange: applyCameraPosition,
  onMotionChange: handleMotionChange,
})

let resizeObserver: ResizeObserver | null = null
let unsubscribeChanged: (() => void) | null = null
/** True after the first successful viewport measure + center. */
let hasCenteredOnce = false

const tiles = computed(() =>
  computeVisibleTiles({
    albums: albums.value,
    seed: seed.value,
    cameraX: tileCameraX.value,
    cameraY: tileCameraY.value,
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

async function buildDragSnapshot(): Promise<void> {
  if (motionActive) return

  const token = ++snapshotBuildToken
  await nextTick()

  const canvas = snapshotRef.value
  const world = worldRef.value
  const currentTiles = tiles.value
  if (!canvas || !world || currentTiles.length === 0) return

  const minX = Math.min(...currentTiles.map((tile) => tile.x))
  const minY = Math.min(...currentTiles.map((tile) => tile.y))
  const maxX = Math.max(...currentTiles.map((tile) => tile.x + COVER_SIZE))
  const maxY = Math.max(...currentTiles.map((tile) => tile.y + COVER_SIZE))
  const width = maxX - minX
  const height = maxY - minY

  canvas.width = Math.max(1, Math.ceil(width * DRAG_SNAPSHOT_SCALE))
  canvas.height = Math.max(1, Math.ceil(height * DRAG_SNAPSHOT_SCALE))
  canvas.style.left = `${minX}px`
  canvas.style.top = `${minY}px`
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const context = canvas.getContext('2d')
  if (!context) return

  const placeholder = getComputedStyle(world).getPropertyValue('--auralis-artwork-placeholder-bg')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = placeholder || '#202124'
  currentTiles.forEach((tile) => {
    context.fillRect(
      Math.round((tile.x - minX) * DRAG_SNAPSHOT_SCALE),
      Math.round((tile.y - minY) * DRAG_SNAPSHOT_SCALE),
      Math.ceil(COVER_SIZE * DRAG_SNAPSHOT_SCALE),
      Math.ceil(COVER_SIZE * DRAG_SNAPSHOT_SCALE),
    )
  })

  const images = new Map(
    Array.from(world.querySelectorAll<HTMLImageElement>('[data-roam-tile-id]'), (image) => [
      image.dataset.roamTileId ?? '',
      image,
    ]),
  )
  const snapshotSize = Math.max(1, Math.ceil(COVER_SIZE * DRAG_SNAPSHOT_SCALE))
  const batchSize = 8

  for (let start = 0; start < currentTiles.length; start += batchSize) {
    const batch = currentTiles.slice(start, start + batchSize)
    const bitmaps = await Promise.all(
      batch.map(async (tile) => {
        const image = images.get(tile.id)
        if (!image || !image.complete || image.naturalWidth === 0) return null
        try {
          return await createImageBitmap(image, {
            resizeWidth: snapshotSize,
            resizeHeight: snapshotSize,
            resizeQuality: 'high',
          })
        } catch {
          return null
        }
      }),
    )

    if (token !== snapshotBuildToken || motionActive) {
      bitmaps.forEach((bitmap) => bitmap?.close())
      return
    }

    bitmaps.forEach((bitmap, index) => {
      if (!bitmap) return
      const tile = batch[index]!
      context.drawImage(
        bitmap,
        Math.round((tile.x - minX) * DRAG_SNAPSHOT_SCALE),
        Math.round((tile.y - minY) * DRAG_SNAPSHOT_SCALE),
        snapshotSize,
        snapshotSize,
      )
      bitmap.close()
    })
  }

  if (token === snapshotBuildToken && !motionActive) {
    snapshotBuildEarliest = 0
    snapshotReady.value = true
  }
}

function scheduleSnapshotBuild(): void {
  if (snapshotBuildTimer !== 0 || motionActive) return
  const delay = Math.max(120, snapshotBuildEarliest - performance.now())
  snapshotBuildTimer = window.setTimeout(() => {
    snapshotBuildTimer = 0
    void buildDragSnapshot()
  }, delay)
}

function onArtworkLoad(): void {
  scheduleSnapshotBuild()
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
  snapshotBuildToken += 1
  if (snapshotBuildTimer !== 0) {
    window.clearTimeout(snapshotBuildTimer)
    snapshotBuildTimer = 0
  }
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
      <div
        ref="worldRef"
        class="roam-world absolute left-0 top-0 will-change-transform"
        :class="{ 'is-motion-active': isMotionActive && snapshotReady }"
      >
        <canvas ref="snapshotRef" class="roam-drag-snapshot absolute" aria-hidden="true" />
        <div class="roam-tile-layer">
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
              :data-roam-tile-id="tile.id"
              alt=""
              decoding="async"
              draggable="false"
              @load="onArtworkLoad"
              @error="onArtworkError(tile.album.artworkCacheKey)"
            />
            <div v-else class="roam-tile-placeholder h-full w-full" />
          </div>
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

.roam-drag-snapshot {
  display: none;
  pointer-events: none;
}

.roam-world.is-motion-active .roam-drag-snapshot {
  display: block;
}

.roam-world.is-motion-active .roam-tile-layer {
  visibility: hidden;
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
