<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import {
  createReducedMotionQuery,
  type MotionQuery,
} from '@renderer/shared/animation/motionPreference'
import { ArchiveScene } from '../scene/scene'
import { fullMotion, reducedMotion } from '../scene/motion-preferences'
import { qualityPresets } from '../scene/render-quality'
import { createRhineLoop } from '../runtime/rhineLifecycle'
import '../styles/rhine.css'

const router = useRouter()
const playback = usePlayback()
const { displayMode } = usePlayerDisplayMode()
const host = ref<HTMLElement | null>(null)
const ready = ref(false)
const failed = ref(false)
const detailed = ref(false)
const leaving = ref(false)
const dark = ref(false)
const economical = ref(false)
const systemReduced = ref(false)
const localReduced = ref(false)
const reduced = computed(() => systemReduced.value || localReduced.value)
const controlError = ref('')
const artworkUnavailable = ref(false)
const track = computed(() => playback.state.currentTrack)
const album = computed(() => track.value?.album || track.value?.title || '等待一张专辑')
const artist = computed(() => track.value?.albumArtist || track.value?.artist || 'Auralis')
const progress = computed(() =>
  playback.state.duration > 0
    ? Math.max(0, Math.min(1, playback.state.currentTime / playback.state.duration))
    : 0,
)
const stateLabel = computed(() =>
  !track.value
    ? '尚未播放'
    : playback.isPlaybackPending.value
      ? '正在载入'
      : playback.state.isPlaying
        ? '正在播放'
        : '已暂停',
)
let scene: ArchiveScene | null = null
let observer: ResizeObserver | null = null
let media: MotionQuery | null = null
let disposed = false
let imageToken = 0
let albumImage: HTMLImageElement | null = null
let clock = 0
let opening = true
let exitStarted = 0
let selection = 16
let pendingImage: HTMLImageElement | null = null
let imageTimeout: ReturnType<typeof setTimeout> | undefined
const loop = createRhineLoop((seconds) => {
  clock = seconds
  const current = scene
  if (!current || !ready.value) return
  if (opening && seconds > (reduced.value ? 0 : 2.4)) {
    opening = false
    if (track.value) setDetail(true)
  }
  current.update(seconds)
  host.value?.style.setProperty('--reveal', String(current.detailVisibility))
  if (leaving.value && seconds - exitStarted > (reduced.value ? 0 : 1.25)) finishExit()
})

function formatTime(value: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
function syncAlbum(): void {
  scene?.setAlbum(track.value ? album.value : 'AURALIS', artist.value, albumImage)
}
function updateMotion(): void {
  const motion = reduced.value ? reducedMotion() : fullMotion()
  motion.idleWave = !reduced.value && playback.state.isPlaying
  scene?.setMotion(motion)
}
function syncVisibility(): void {
  loop.setActive(ready.value && !failed.value && !document.hidden && displayMode.value === 'normal')
}
function setDetail(value: boolean): void {
  if (!ready.value || leaving.value || (value && !track.value)) return
  opening = false
  detailed.value = value
  scene?.setMode(value ? 'detail' : 'archive')
}
function finishExit(): void {
  loop.setActive(false)
  const previous = router.options.history.state.back
  if (typeof previous === 'string' && previous.startsWith('/') && !previous.startsWith('/rhine')) {
    router.back()
  } else void router.replace({ name: 'library' })
}
function exit(): void {
  if (leaving.value) return
  if (!ready.value || failed.value || document.hidden) return finishExit()
  opening = false
  detailed.value = false
  leaving.value = true
  exitStarted = clock
  scene?.setMode('archive')
}
function onKey(event: KeyboardEvent): void {
  if (displayMode.value !== 'normal' || event.defaultPrevented) return
  if (event.key === 'Escape') {
    event.preventDefault()
    if (detailed.value) setDetail(false)
    else exit()
  }
}
async function control(action: 'togglePlayPause' | 'playPrevious' | 'playNext'): Promise<void> {
  controlError.value = ''
  try {
    await playback[action]()
  } catch (cause) {
    controlError.value = '播放未能完成，请重试或返回播放器。'
    rendererDiagnostics.warn({
      scope: 'rhine.playback',
      message: 'Rhine playback action failed',
      cause,
    })
  }
}
function seek(event: Event): void {
  playback.seekByRatio(Number((event.target as HTMLInputElement).value) / 1000)
}
function clearImageRequest(): void {
  clearTimeout(imageTimeout)
  if (pendingImage) {
    pendingImage.onload = null
    pendingImage.onerror = null
    pendingImage.src = ''
    pendingImage = null
  }
}
watch(
  () => track.value?.artworkCacheKey,
  (key) => {
    const token = ++imageToken
    clearImageRequest()
    albumImage = null
    artworkUnavailable.value = false
    syncAlbum()
    if (!key) return
    const image = new Image()
    pendingImage = image
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    const finish = (loaded: boolean) => {
      if (disposed || token !== imageToken) return
      clearTimeout(imageTimeout)
      image.onload = image.onerror = null
      pendingImage = null
      albumImage = loaded ? image : null
      artworkUnavailable.value = !loaded
      syncAlbum()
    }
    image.onload = () => finish(true)
    image.onerror = () => finish(false)
    imageTimeout = setTimeout(() => {
      image.src = ''
      finish(false)
    }, 15000)
    image.src = `auralis-artwork://${key}`
  },
  { immediate: true },
)
watch([album, artist], syncAlbum)
watch(
  () => track.value?.id,
  () => {
    controlError.value = ''
    if (!track.value) setDetail(false)
  },
)
watch([() => playback.state.isPlaying, progress], ([playing, ratio]) => {
  scene?.setPlayback(playing, ratio)
  updateMotion()
})
watch(dark, (value) => scene?.setTheme(value))
watch(economical, (value) =>
  scene?.setQuality(value ? qualityPresets.performance : qualityPresets.original),
)
watch(reduced, updateMotion)
watch(displayMode, syncVisibility)

function systemMotion(): void {
  systemReduced.value = media?.matches ?? false
}
function contextLost(event: Event): void {
  event.preventDefault()
  failed.value = true
  loop.setActive(false)
}
async function initialize(): Promise<void> {
  if (!host.value || disposed) return
  loop.setActive(false)
  scene?.dispose()
  scene = null
  ready.value = false
  failed.value = false
  try {
    const next = new ArchiveScene(host.value)
    scene = next
    next.renderer.domElement.addEventListener('webglcontextlost', contextLost)
    next.setQuality(economical.value ? qualityPresets.performance : qualityPresets.original)
    next.setTheme(dark.value, true)
    updateMotion()
    await next.load()
    if (disposed || scene !== next) {
      next.dispose()
      return
    }
    syncAlbum()
    next.setPlayback(playback.state.isPlaying, progress.value)
    next.select(selection)
    next.setMode('archive')
    next.onSelect = (index, cell) => {
      selection = index
      next.select(index, cell ? { cell } : undefined)
    }
    next.onOpen = () => setDetail(true)
    next.onNavigate = (_axis, direction) => {
      selection = 16 + ((selection - 16 + direction + 8) % 8)
      next.select(selection, { axis: 'row', direction })
    }
    ready.value = true
    opening = true
    detailed.value = false
    next.resize()
    syncVisibility()
  } catch (cause) {
    if (disposed) return
    failed.value = true
    scene?.dispose()
    scene = null
    rendererDiagnostics.warn({
      scope: 'rhine.scene',
      message: 'Rhine scene could not initialize',
      cause,
    })
  }
}
onMounted(() => {
  media = createReducedMotionQuery()
  systemMotion()
  media.addEventListener('change', systemMotion)
  document.addEventListener('visibilitychange', syncVisibility)
  window.addEventListener('keydown', onKey)
  observer = new ResizeObserver(() => {
    if (ready.value) scene?.resize()
  })
  if (host.value) observer.observe(host.value)
  void initialize()
})
onBeforeUnmount(() => {
  disposed = true
  imageToken++
  clearImageRequest()
  loop.dispose()
  observer?.disconnect()
  document.removeEventListener('visibilitychange', syncVisibility)
  window.removeEventListener('keydown', onKey)
  media?.removeEventListener('change', systemMotion)
  scene?.dispose()
  scene = null
  albumImage = null
})
</script>

<template>
  <section
    class="rhine-page"
    :class="{ 'rhine-dark': dark, 'rhine-detail': detailed, 'rhine-reduced': reduced }"
    aria-label="Rhine 沉浸空间"
    :aria-busy="!ready && !failed"
    data-rhine-page
  >
    <div ref="host" class="rhine-scene" data-layout="desktop" :data-ready="ready" />
    <div class="rhine-vignette" aria-hidden="true" />
    <header class="rhine-header">
      <button type="button" class="rhine-back" :disabled="leaving" @click="exit">
        <span class="i-ph-arrow-left" aria-hidden="true" /> 返回播放器
      </button>
      <div class="rhine-wordmark">Rhine<span>AURALIS</span></div>
      <div class="rhine-options">
        <button type="button" :aria-pressed="economical" @click="economical = !economical">
          {{ economical ? '轻量画质' : '完整画质' }}
        </button>
        <button
          type="button"
          :aria-pressed="reduced"
          :disabled="systemReduced"
          @click="localReduced = !localReduced"
        >
          {{ reduced ? '简化动效' : '完整动效' }}
        </button>
        <button
          type="button"
          :aria-label="dark ? '切换浅色' : '切换深色'"
          :aria-pressed="dark"
          @click="dark = !dark"
        >
          <span :class="dark ? 'i-ph-sun' : 'i-ph-moon'" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div v-if="failed" class="rhine-notice" role="alert">
      <h1>空间暂未就绪</h1>
      <p>三维画面未能载入，音乐播放不受影响。</p>
      <button type="button" @click="initialize">重新载入</button>
    </div>
    <div v-else-if="!ready" class="rhine-notice" role="status">
      <div class="rhine-loading" aria-hidden="true" />
      <p>正在布置你的聆听空间</p>
    </div>
    <div v-else-if="!track" class="rhine-empty">
      <h1>让一张专辑<br />占据此刻。</h1>
      <p>从曲库播放一首歌，再来这里慢慢听。</p>
      <button type="button" @click="router.push({ name: 'library' })">
        前往曲库 <span class="i-ph-arrow-up-right" aria-hidden="true" />
      </button>
    </div>
    <div v-else class="rhine-album" :class="{ 'is-revealed': detailed }">
      <div class="rhine-album-rule" aria-hidden="true" />
      <p class="rhine-album-artist" :title="artist">{{ artist }}</p>
      <h1 :title="album">{{ album }}</h1>
      <div class="rhine-track">
        <span
          class="rhine-play-signal"
          :class="{ 'is-playing': playback.state.isPlaying }"
          aria-hidden="true"
        />
        <span :title="track.title || ''">{{ track.title || '未命名曲目' }}</span>
      </div>
      <p class="rhine-album-note">
        {{ artworkUnavailable ? '封面暂不可用' : '此刻，只听这一张。' }}
      </p>
      <button
        type="button"
        class="rhine-extract"
        :disabled="!ready || leaving"
        @click="setDetail(!detailed)"
      >
        <span :class="detailed ? 'i-ph-arrows-in' : 'i-ph-arrows-out'" aria-hidden="true" />
        {{ detailed ? '收回专辑' : '抽取专辑' }}
      </button>
    </div>

    <footer class="rhine-footer">
      <div class="rhine-status">
        <span>{{ stateLabel }}</span
        ><span>{{ detailed ? '拖动模型，改变视角' : '拖动阵列 · 点击抽取' }}</span>
      </div>
      <div v-if="track" class="rhine-transport" aria-label="播放控制">
        <button
          type="button"
          aria-label="上一首"
          :disabled="playback.isPlaybackPending.value"
          @click="control('playPrevious')"
        >
          <span class="i-ph-skip-back-fill" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="rhine-play"
          :aria-label="playback.state.isPlaying ? '暂停' : '播放'"
          :disabled="playback.isPlaybackPending.value"
          @click="control('togglePlayPause')"
        >
          <span
            :class="playback.state.isPlaying ? 'i-ph-pause-fill' : 'i-ph-play-fill'"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          aria-label="下一首"
          :disabled="playback.isPlaybackPending.value"
          @click="control('playNext')"
        >
          <span class="i-ph-skip-forward-fill" aria-hidden="true" />
        </button>
        <div class="rhine-progress">
          <input
            type="range"
            min="0"
            max="1000"
            step="1"
            :value="Math.round(progress * 1000)"
            :disabled="!playback.state.duration || playback.isPlaybackPending.value"
            aria-label="播放进度"
            :aria-valuetext="formatTime(playback.state.currentTime)"
            @change="seek"
          />
          <div>
            <span>{{ formatTime(playback.state.currentTime) }}</span
            ><span>{{ formatTime(playback.state.duration) }}</span>
          </div>
        </div>
      </div>
      <span class="rhine-footer-name">LOCAL MUSIC ARCHIVE</span>
    </footer>
    <p v-if="controlError || playback.state.error" class="rhine-control-error" role="alert">
      {{ controlError || '播放出现问题，请返回播放器查看。' }}
    </p>
  </section>
</template>
