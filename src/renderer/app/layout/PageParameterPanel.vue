<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  PageParameterContext,
  PageParameters,
} from '@renderer/features/appearance/composables/usePageParameters'
import SongFontWeightSettings from '@renderer/features/settings/components/SongFontWeightSettings.vue'
import AlbumListParameterSettings from '@renderer/features/settings/components/AlbumListParameterSettings.vue'
import {
  createReducedMotionQuery,
  type MotionQuery,
} from '@renderer/shared/animation/motionPreference'
import { animateLyricsPanelSlide, getLyricsSlideDuration } from './lyricsPanelSlideMotion'
import '@renderer/features/settings/styles/settings.chrome.css'
import '@renderer/features/settings/styles/parameterSurface.css'

const props = defineProps<{ controller: PageParameters; targetWidthPx: number }>()
const { t } = useI18n()
const closeButton = ref<HTMLButtonElement | null>(null)
const content = ref<HTMLElement | null>(null)
const parameterSettings = ref<{ reset: () => void } | null>(null)
// Keep the outgoing form until the shell has finished leaving, including route-triggered closes.
const context = shallowRef<PageParameterContext | null>(null)
watch(
  [() => props.controller.open.value, () => props.controller.context.value],
  ([open, current]) => {
    if (open && current) context.value = current
  },
  { immediate: true, flush: 'sync' },
)
const contextKey = computed(() =>
  context.value?.kind === 'songs' ? `songs-${context.value.view}` : context.value?.kind,
)
const title = computed(() =>
  t(
    context.value?.kind === 'songs'
      ? `pageParameters.${context.value.view === 'cover' ? 'songsCover' : 'songsList'}`
      : 'pageParameters.albums',
  ),
)
let motion: ReturnType<typeof animateLyricsPanelSlide> | null = null
let animatedElement: HTMLElement | null = null
let finishMotion: (() => void) | null = null
let reducedMotion: MotionQuery | undefined

function cancelMotion() {
  if (motion && animatedElement) {
    const style = getComputedStyle(animatedElement)
    const transform = style.transform
    const opacity = style.opacity
    motion.cancel()
    animatedElement.style.transform = transform
    animatedElement.style.opacity = opacity
  }
  motion = null
  finishMotion = null
}

function slide(element: Element, to: number, done: () => void) {
  cancelMotion()
  const panel = element as HTMLElement
  panel.style.height = to === 0 ? `${panel.getBoundingClientRect().height}px` : ''
  panel.inert = to === 0
  panel.style.pointerEvents = to === 0 ? 'none' : ''
  animatedElement = panel
  const width = panel.getBoundingClientRect().width
  const style = getComputedStyle(panel)
  const offset = panel.style.transform
    ? new DOMMatrixReadOnly(style.transform).m41
    : to === 1
      ? width
      : 0
  const from = Math.max(0, Math.min(1, 1 - offset / width))
  const opacity = panel.style.opacity ? Number(style.opacity) : from
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    motion?.cancel()
    motion = null
    finishMotion = null
    panel.style.transform = ''
    panel.style.opacity = ''
    done()
  }
  finishMotion = finish
  if (reducedMotion?.matches) {
    finish()
    return
  }
  const current = animateLyricsPanelSlide(
    panel,
    from,
    to,
    opacity,
    width,
    getLyricsSlideDuration(from, to),
  )
  motion = current
  void current.movement.finished.then(
    () => {
      if (motion === current) finish()
    },
    () => {},
  )
}

function settleMotion() {
  finishMotion?.()
}
function afterLeave(element: Element) {
  if (props.controller.open.value) return
  context.value = null
  ;(element as HTMLElement).style.height = ''
}
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || !props.controller.open.value) return
  // Menus consume their own Escape before this window listener.
  if (document.querySelector('[role="menu"], [role="listbox"]')) return
  event.preventDefault()
  props.controller.close()
}

watch(
  () => props.controller.open.value,
  async (open) => {
    if (!open) return
    await nextTick()
    if (props.controller.open.value) closeButton.value?.focus({ preventScroll: true })
  },
  { flush: 'post' },
)
watch(contextKey, async () => {
  await nextTick()
  if (content.value) content.value.scrollTop = 0
})
onMounted(() => {
  reducedMotion = createReducedMotionQuery()
  reducedMotion.addEventListener('change', settleMotion)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', settleMotion)
})
onBeforeUnmount(() => {
  cancelMotion()
  reducedMotion?.removeEventListener('change', settleMotion)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', settleMotion)
})
</script>

<template>
  <Transition
    :css="false"
    @enter="(el, done) => slide(el, 1, done)"
    @leave="(el, done) => slide(el, 0, done)"
    @after-leave="afterLeave"
    @enter-cancelled="cancelMotion"
    @leave-cancelled="cancelMotion"
  >
    <section
      v-show="controller.open.value"
      id="page-parameter-panel"
      class="page-parameter-panel parameter-panel-surface parameter-panel-surface--frosted settings-controls"
      :style="{ '--page-parameter-width': `${targetWidthPx}px` }"
      role="dialog"
      aria-modal="false"
      aria-labelledby="page-parameter-title"
    >
      <header class="parameter-panel-header">
        <h2 id="page-parameter-title">{{ title }}</h2>
        <button type="button" class="song-font-weight-reset" @click="parameterSettings?.reset()">
          {{ t('pageParameters.reset') }}
        </button>
        <button
          ref="closeButton"
          type="button"
          class="parameter-panel-close"
          :aria-label="t('pageParameters.close')"
          @click="controller.close()"
        >
          <span class="i-lucide-x h-5 w-5" aria-hidden="true" />
        </button>
      </header>
      <div ref="content" class="parameter-panel-content">
        <SongFontWeightSettings
          v-if="context?.kind === 'songs'"
          ref="parameterSettings"
          :key="contextKey"
          :view="context.view"
          :inactive="!controller.open.value"
        />
        <AlbumListParameterSettings
          v-else-if="context?.kind === 'albums'"
          ref="parameterSettings"
          :key="contextKey"
          :inactive="!controller.open.value"
        />
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.page-parameter-panel {
  /* Match the compact parameter captions while keeping each control row intact. */
  --page-parameter-control-size: 11px;
  --page-parameter-field-width: 106px;
  --page-parameter-fields-width: calc(2 * var(--page-parameter-field-width) + 6px);
  z-index: 50;
  right: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  width: min(max(var(--page-parameter-width), 340px), 100vw);
  /* Auto margins center the content height without competing with the slide transform. */
  height: fit-content;
  max-height: calc(100vh - 2 * var(--background-panel-gap));
  margin-block: auto;
  -webkit-app-region: no-drag;
}
.page-parameter-panel .parameter-panel-header {
  padding: 10px;
  gap: 6px;
}
.page-parameter-panel .parameter-panel-content {
  flex: 0 1 auto;
  padding: 10px 8px;
}
.page-parameter-panel .parameter-panel-header h2 {
  flex: 1;
  min-width: 0;
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  white-space: nowrap;
}
.page-parameter-panel .parameter-panel-close {
  width: 28px;
  height: 32px;
}
.page-parameter-panel .song-font-weight-reset {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--auralis-danger);
  font-family: inherit;
  font-size: var(--page-parameter-control-size);
  line-height: var(--auralis-type-caption-line-height);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.page-parameter-panel .song-font-weight-reset:hover {
  color: var(--auralis-text);
}
.page-parameter-panel .song-font-weight-reset:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 2px;
}
.page-parameter-panel :deep(.settings-row) {
  min-height: 40px;
  padding: 6px;
  gap: 6px;
  flex-wrap: nowrap;
}
.page-parameter-panel :deep(.settings-row > div > strong) {
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  white-space: nowrap;
}
.page-parameter-panel :deep(.song-font-weight-row > div:first-child) {
  flex: 1 1 auto;
  min-width: 0;
}
.page-parameter-panel :deep(.song-font-column-labels),
.page-parameter-panel :deep(.settings-row.song-font-weight-row > .song-font-controls) {
  grid-template-columns: repeat(2, var(--page-parameter-field-width));
  gap: 6px;
}
.page-parameter-panel :deep(.settings-row.song-font-weight-row > .song-font-controls) {
  flex: 0 0 var(--page-parameter-fields-width);
  width: var(--page-parameter-fields-width);
}
.page-parameter-panel :deep(.song-font-column-labels) {
  padding: 0 6px 2px;
}
.page-parameter-panel :deep(.song-font-size-input) {
  width: 100%;
  padding-inline: 4px;
}
.page-parameter-panel :deep(.song-font-size-unit) {
  margin-inline: 2px;
  font-size: var(--page-parameter-control-size);
}
.page-parameter-panel :deep(.song-font-size-buttons) {
  width: 16px;
}
.page-parameter-panel :deep(.song-font-controls .settings-select) {
  width: 100%;
  padding-inline: 5px;
  gap: 3px;
  font-size: var(--page-parameter-control-size);
  white-space: nowrap;
}
.page-parameter-panel :deep(.song-cover-info-alignment) {
  flex: 0 0 var(--page-parameter-field-width);
  width: var(--page-parameter-field-width);
}
.page-parameter-panel :deep(.song-cover-info-alignment .settings-select) {
  width: 100%;
  min-width: 0;
  font-size: var(--page-parameter-control-size);
  white-space: nowrap;
}
.page-parameter-panel :deep(.song-cover-info-options .settings-row > div:first-child) {
  flex: 1 0 auto;
  min-width: max-content;
}
.page-parameter-panel :deep(.song-parameters-heading) {
  margin-top: 4px;
  padding: 8px 6px 4px;
}
.page-parameter-panel :deep(.song-font-weight-status) {
  padding: 2px 6px 6px;
}
.page-parameter-panel :deep(.song-font-weight-content > .song-parameters-heading:first-child),
.page-parameter-panel :deep(.song-cover-options:first-child > .song-parameters-heading) {
  margin-top: 0;
  padding-top: 2px;
  border-top: 0;
}
.page-parameter-panel :deep(.settings-row > .settings-range-control) {
  flex: 0 1 var(--page-parameter-fields-width);
  max-width: 100%;
}
.page-parameter-panel :deep(.settings-range-control input) {
  flex: 1;
  width: 0;
  min-width: 0;
}
</style>
