<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import WindowTrafficLights from '@renderer/app/layout/WindowTrafficLights.vue'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { auralis } from '@renderer/shared/ipc/client'
import type { StartupAlbumPresentation } from './useStartupAlbum'
import type { createCardScene } from './rendering/scene'
import { drawCardCanvas, type CardContent } from './rendering/cardArtwork'
import { createCardAppearance } from './rendering/cardAppearance'
import { cardArtistFamily, cardTitleFamily, loadCardFonts } from './rendering/cardTypography'
import { cardLayout } from './rendering/cardLayout'

const props = defineProps<{ presentation: StartupAlbumPresentation }>()
const emit = defineEmits<{ close: []; shown: [] }>()
const { t } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const playback = usePlayback()
const root = ref<HTMLElement | null>(null)
const backdrop = ref<HTMLElement | null>(null)
const backdropRevealed = ref(false)
const host = ref<HTMLElement | null>(null)
const playButton = ref<HTMLButtonElement | null>(null)
const interactive = ref(true)
const modalOpen = ref(true)
const fading = ref(false)
const fallback = ref(false)
const staticArtwork = ref<string | null>(null)
const staticArtworkReady = ref(false)
let scene: ReturnType<typeof createCardScene> | undefined
let unmounted = false
let shown = false
let windowVisible = false
let staticFrame = 0
let staticRevision = 0
let unsubscribeVisibility: (() => void) | undefined
let fadeTimer: ReturnType<typeof setTimeout> | undefined
const album = props.presentation.album
const title = computed(() => songText(album.album))
const artist = computed(() => songValues(album.albumArtist))
const staticCardStyle = {
  '--card-title-y': `${(cardLayout.title.centerY / cardLayout.height) * 100}%`,
  '--card-artist-y': `${(cardLayout.artist.centerY / cardLayout.height) * 100}%`,
  '--card-title-size': `${(cardLayout.title.fontSize / cardLayout.width) * 100}cqw`,
  '--card-artist-size': `${(cardLayout.artist.fontSize / cardLayout.width) * 100}cqw`,
  '--card-text-inset': `${((cardLayout.cover.x + cardLayout.title.inset) / cardLayout.width) * 100}%`,
  '--card-cover-x': `${(cardLayout.cover.x / cardLayout.width) * 100}%`,
  '--card-cover-y': `${(cardLayout.cover.y / cardLayout.height) * 100}%`,
  '--card-cover-size': `${(cardLayout.cover.size / cardLayout.width) * 100}%`,
}
// One appearance belongs to this presentation, including a failed WebGL setup.
const appearance = createCardAppearance(props.presentation.cover)

function cardContent(): CardContent {
  return {
    id: JSON.stringify([album.albumArtist, album.album]),
    title: title.value,
    artist: artist.value,
    cover: props.presentation.cover,
  }
}
function prepareStaticArtwork(): void {
  if (staticArtwork.value) return
  try {
    let canvas = scene?.getArtworkCanvas()
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.width = 1440
      canvas.height = 2064
      const content = cardContent()
      drawCardCanvas(canvas, content, appearance)
    }
    staticArtwork.value = canvas.toDataURL('image/png')
  } catch {
    // The HTML cover and text remain available when canvas readback is denied.
  }
}

function dispose(): void {
  const current = scene
  scene = undefined
  current?.dispose()
}
function close(): void {
  if (!modalOpen.value) return
  interactive.value = false
  modalOpen.value = false
  clearTimeout(fadeTimer)
  fadeTimer = undefined
  cancelStaticShown()
  dispose()
  emit('close')
}
function revealBackdrop(): void {
  if (interactive.value && modalOpen.value) backdropRevealed.value = true
}
function canRecordShown(): boolean {
  return (
    !shown &&
    !unmounted &&
    interactive.value &&
    modalOpen.value &&
    windowVisible &&
    !document.hidden
  )
}
function recordShown(): void {
  if (!canRecordShown()) return
  shown = true
  revealBackdrop()
  emit('shown')
}
function cancelStaticShown(): void {
  staticRevision++
  if (staticFrame) cancelAnimationFrame(staticFrame)
  staticFrame = 0
}
function queueStaticShown(): void {
  cancelStaticShown()
  if (!fallback.value || (staticArtwork.value && !staticArtworkReady.value) || !canRecordShown())
    return
  const revision = staticRevision
  void nextTick().then(() => {
    if (revision !== staticRevision || !canRecordShown()) return
    // DOM insertion and PNG decoding alone are not a displayed card. Allow a
    // paint before recording the static fallback, and cancel if it exits first.
    staticFrame = requestAnimationFrame(() => {
      staticFrame = requestAnimationFrame(() => {
        staticFrame = 0
        if (revision === staticRevision && fallback.value) recordShown()
      })
    })
  })
}
function documentVisibilityChanged(): void {
  queueStaticShown()
}
watch([fallback, staticArtwork, staticArtworkReady], queueStaticShown, { flush: 'post' })
function freezeBackdrop(): void {
  if (backdrop.value) backdrop.value.style.opacity = getComputedStyle(backdrop.value).opacity
}
function play(): void {
  if (!interactive.value) return
  freezeBackdrop()
  interactive.value = false
  root.value?.focus({ preventScroll: true })
  void playback
    .playTrackFromQueue(album.tracks, album.tracks[0].id, {
      replaceHistory: true,
    })
    .catch((cause: unknown) =>
      rendererDiagnostics.error({
        scope: 'startup.album.play',
        message: 'Could not play startup album',
        cause,
      }),
    )
  try {
    const target = document.querySelector<HTMLElement>('[data-playbar-drop-target]')
    if (!fallback.value && target && scene?.dropInto(target, close)) return
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'startup.album.play',
      message: 'Using fade for card drop',
      cause,
    })
  }
  fadeOut()
}
function fadeOut(): void {
  if (document.hidden) {
    close()
    return
  }
  fading.value = true
  fadeTimer = setTimeout(close, 180)
}
function skip(): void {
  if (!interactive.value) return
  freezeBackdrop()
  interactive.value = false
  // Keep focus and the background's inert state until the card has vanished.
  root.value?.focus({ preventScroll: true })
  try {
    if (!fallback.value && scene?.shatter(close)) return
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'startup.album.skip',
      message: 'Using fade for card exit',
      cause,
    })
  }
  fadeOut()
}
function keyboard(event: KeyboardEvent): void {
  if (!interactive.value) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  // Tab is handled in capture by the trap; keep page shortcuts out of this modal.
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
  event.stopPropagation()
}
useOverlayFocusTrap({
  isOpen: modalOpen,
  canDismiss: interactive,
  container: root,
  initialFocus: () => playButton.value ?? undefined,
  onEscape: close,
  restoreFocus(captured) {
    const target =
      captured?.isConnected && !captured.closest('[inert]')
        ? captured
        : document.querySelector<HTMLElement>('.app-main')
    target?.focus({ preventScroll: true })
  },
})
onMounted(async () => {
  let visibilityRevision = 0
  unsubscribeVisibility = auralis.window.onVisibilityChanged(({ isVisible }) => {
    visibilityRevision++
    windowVisible = isVisible
    if (!isVisible && !interactive.value) {
      close()
      return
    }
    scene?.setVisible(isVisible)
    queueStaticShown()
  })
  const revision = visibilityRevision
  const visibilityReady = auralis.window
    .getVisibility()
    .then(({ isVisible }) => {
      if (!unmounted && revision === visibilityRevision) windowVisible = isVisible
    })
    .catch(() => {
      if (!unmounted && revision === visibilityRevision) windowVisible = !document.hidden
    })
  document.addEventListener('visibilitychange', documentVisibilityChanged)
  await nextTick()
  // Establish the transparent starting style before the first card frame.
  if (backdrop.value) getComputedStyle(backdrop.value).getPropertyValue('opacity')
  await Promise.all([loadCardFonts(title.value, artist.value), visibilityReady])
  if (unmounted || !interactive.value) return
  try {
    if (!props.presentation.createScene || !host.value)
      throw new Error('WebGL card renderer unavailable')
    let renderedFrames = 0
    scene = props.presentation.createScene(
      host.value,
      (value) => {
        if (value.disposed) return
        // The initial scene frames can be empty while the card is below the
        // viewport. Begin after its first draw, with cold shaders prepared.
        const drewFrame = value.frames > renderedFrames
        renderedFrames = value.frames
        if (drewFrame && value.cardRendered && !value.contextLost) {
          // Context restoration can make the canvas visible on this Vue update.
          void nextTick().then(() => {
            if (!fallback.value) recordShown()
          })
        }
        if (value.dropping) {
          const fade = Math.min(1, value.dropProgress / (450 / 1200))
          root.value?.style.setProperty(
            '--startup-album-backdrop',
            `${94 * (1 - fade * fade * (3 - 2 * fade))}%`,
          )
        }
        if (value.shattering) {
          const fade = Math.max(0, Math.min(1, (value.shatterProgress - 0.65) / 0.35))
          root.value?.style.setProperty(
            '--startup-album-backdrop',
            `${94 * (1 - fade * fade * (3 - 2 * fade))}%`,
          )
        }
        fallback.value = value.contextLost
        if (value.contextLost) prepareStaticArtwork()
      },
      cardContent(),
      createReducedMotionQuery(),
      appearance,
    )
    scene.setVisible(windowVisible)
  } catch (cause) {
    prepareStaticArtwork()
    dispose()
    host.value?.replaceChildren()
    fallback.value = true
    rendererDiagnostics.warn({
      scope: 'startup.album.render',
      message: 'Using static startup album card',
      cause,
    })
  }
})
onBeforeUnmount(() => {
  unmounted = true
  clearTimeout(fadeTimer)
  cancelStaticShown()
  document.removeEventListener('visibilitychange', documentVisibilityChanged)
  unsubscribeVisibility?.()
  dispose()
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="startup-album-overlay"
      :class="{ 'is-exiting': !interactive, 'is-fading': fading }"
      :role="modalOpen ? 'dialog' : undefined"
      :aria-modal="modalOpen ? true : undefined"
      :aria-label="[title, artist].filter(Boolean).join(' · ')"
      @keydown="keyboard"
    >
      <div
        ref="backdrop"
        class="startup-album-backdrop"
        :class="{ 'is-revealed': backdropRevealed }"
        aria-hidden="true"
      />
      <template v-if="interactive">
        <div class="startup-album-drag" aria-hidden="true" />
        <WindowTrafficLights />
      </template>
      <div class="startup-album-stage">
        <div ref="host" class="startup-album-canvas" :class="{ 'is-fallback': fallback }" />
        <div v-if="fallback && staticArtwork" class="startup-album-static has-artwork">
          <img
            :src="staticArtwork"
            alt=""
            @load="staticArtworkReady = true"
            @error="staticArtwork = null"
          />
        </div>
        <div v-else-if="fallback" class="startup-album-static" :style="staticCardStyle">
          <h2 :style="{ fontFamily: cardTitleFamily }">{{ title }}</h2>
          <img v-if="presentation.cover" :src="presentation.cover.src" alt="" />
          <div v-else class="startup-album-placeholder" aria-hidden="true">
            <span class="i-lucide-disc-3" />
          </div>
          <p :style="{ fontFamily: cardArtistFamily }">{{ artist }}</p>
        </div>
      </div>
      <div v-if="interactive" class="startup-album-controls">
        <div class="startup-album-actions">
          <button
            ref="playButton"
            type="button"
            class="startup-album-play"
            data-startup-play
            @click="play"
          >
            <span class="i-lucide-play" aria-hidden="true" />{{ t('startupAlbum.play') }}
          </button>
          <button type="button" data-startup-skip @click="skip">
            {{ t('startupAlbum.skip') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.startup-album-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  color: var(--auralis-text);
  isolation: isolate;
  display: grid;
  grid-template-rows: minmax(0, 1fr) 80px;
}
.startup-album-backdrop {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: color-mix(in srgb, var(--auralis-bg) var(--startup-album-backdrop, 94%), transparent);
  opacity: 0;
  transition: opacity 200ms ease-in-out;
}
.startup-album-backdrop.is-revealed {
  opacity: 1;
}
.startup-album-overlay.is-exiting .startup-album-backdrop {
  transition: none;
}
.startup-album-overlay.is-exiting {
  outline: none;
}
.startup-album-overlay.is-fading .startup-album-backdrop {
  background: transparent;
  transition: background 180ms ease;
}
.startup-album-overlay.is-fading .startup-album-stage {
  opacity: 0;
  transition: opacity 180ms ease;
}
.startup-album-drag {
  position: absolute;
  inset: 0 0 auto;
  height: 60px;
  -webkit-app-region: drag;
}
.startup-album-stage {
  position: relative;
  min-height: 0;
  margin-top: 55px;
}
.startup-album-canvas {
  position: absolute;
  inset: 0;
}
.startup-album-canvas :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
.startup-album-canvas.is-fallback {
  visibility: hidden;
}
.startup-album-controls {
  text-align: center;
  padding: 12px 24px 28px;
  min-width: 0;
}
.startup-album-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}
.startup-album-controls button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 23px;
  border-radius: 8px;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  background: var(--auralis-surface-raised);
  color: var(--auralis-text);
  cursor: pointer;
}
.startup-album-controls button:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 4px;
}
.startup-album-controls .startup-album-play {
  background: var(--auralis-control-primary-bg);
  color: var(--auralis-control-primary-text);
}
.startup-album-static {
  position: absolute;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  width: min(260px, 45vh);
  max-height: 100%;
  overflow: auto;
  background: #b8bbc2;
  color: #343945;
  padding: 14px;
  border-radius: 9px;
}
.startup-album-static img,
.startup-album-placeholder {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  background: #92969f;
}
.startup-album-static.has-artwork {
  padding: 0;
  background: transparent;
  overflow: hidden;
  aspect-ratio: 720 / 1032;
}
.startup-album-static.has-artwork img {
  display: block;
  height: 100%;
  aspect-ratio: auto;
  background: transparent;
}
.startup-album-static:not(.has-artwork) {
  padding: 0;
  aspect-ratio: 720 / 1032;
  container-type: inline-size;
  overflow: hidden;
}
.startup-album-static:not(.has-artwork) img,
.startup-album-static:not(.has-artwork) .startup-album-placeholder {
  position: absolute;
  left: var(--card-cover-x);
  top: var(--card-cover-y);
  width: var(--card-cover-size);
}
.startup-album-placeholder {
  display: grid;
  place-items: center;
  font-size: 70px;
}
.startup-album-static h2 {
  font-size: var(--card-title-size);
  line-height: 1.1;
  top: var(--card-title-y);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  text-align: center;
  font-weight: 600;
}
.startup-album-static p {
  font-size: var(--card-artist-size);
  line-height: 1.1;
  top: var(--card-artist-y);
  text-align: center;
  -webkit-text-stroke: 0.015em currentColor;
  paint-order: stroke fill;
  overflow-wrap: anywhere;
}
.startup-album-static h2,
.startup-album-static p {
  position: absolute;
  left: var(--card-text-inset);
  right: var(--card-text-inset);
  transform: translateY(-50%);
  margin: 0;
}
</style>
