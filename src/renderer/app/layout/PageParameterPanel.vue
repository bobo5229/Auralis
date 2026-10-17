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
import { animatePageParameterPanel } from './pageParameterPanelMotion'
import '@renderer/features/settings/styles/settings.chrome.css'
import '@renderer/features/settings/styles/parameterSurface.css'

const props = defineProps<{ controller: PageParameters }>()
const { t } = useI18n()
const panelElement = ref<HTMLElement | null>(null)
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
let motion: ReturnType<typeof animatePageParameterPanel> | null = null
let animatedElement: HTMLElement | null = null
let finishMotion: (() => void) | null = null
let reducedMotion: MotionQuery | undefined
let boundsObserver: ResizeObserver | undefined
let interruptedVisual: { transform: string; opacity: string } | null = null

function cancelMotion() {
  if (motion && animatedElement) {
    const style = getComputedStyle(animatedElement)
    const visual = style.display === 'none' && interruptedVisual ? interruptedVisual : style
    const transform = visual.transform
    const opacity = visual.opacity
    motion.cancel()
    animatedElement.style.transform = transform
    animatedElement.style.opacity = opacity
  }
  motion = null
  finishMotion = null
  interruptedVisual = null
}

// v-show hides a cancelled leave before calling its cancellation hook. Capture
// its visible position first without stopping motion when toggles share a tick.
watch(
  () => props.controller.open.value,
  () => {
    if (!motion || !animatedElement) return
    const style = getComputedStyle(animatedElement)
    interruptedVisual = { transform: style.transform, opacity: style.opacity }
  },
  { flush: 'sync' },
)

function slide(element: Element, to: number, done: () => void) {
  cancelMotion()
  const panel = element as HTMLElement
  const height = panel.getBoundingClientRect().height
  panel.style.height = `${height}px`
  panel.inert = to === 0
  panel.style.pointerEvents = to === 0 ? 'none' : ''
  animatedElement = panel
  const style = getComputedStyle(panel)
  const offset = panel.style.transform
    ? new DOMMatrixReadOnly(style.transform).m42
    : to === 1
      ? -height
      : 0
  const opacity = panel.style.opacity ? Number(style.opacity) : to === 1 ? 0 : 1
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    motion?.cancel()
    motion = null
    finishMotion = null
    interruptedVisual = null
    panel.style.transform = ''
    panel.style.opacity = ''
    panel.style.height = ''
    done()
  }
  finishMotion = finish
  if (reducedMotion?.matches) {
    finish()
    return
  }
  const current = animatePageParameterPanel(
    panel,
    offset,
    to === 1 ? 0 : -height,
    opacity,
    to === 1,
    height,
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
  settleMotion()
  await nextTick()
  if (content.value) content.value.scrollTop = 0
})
onMounted(() => {
  reducedMotion = createReducedMotionQuery()
  reducedMotion.addEventListener('change', settleMotion)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', settleMotion)
  const parent = panelElement.value?.parentElement
  if (parent) {
    let { width, height } = parent.getBoundingClientRect()
    boundsObserver = new ResizeObserver(() => {
      const bounds = parent.getBoundingClientRect()
      if (bounds.width !== width || bounds.height !== height) settleMotion()
      width = bounds.width
      height = bounds.height
    })
    boundsObserver.observe(parent)
  }
})
onBeforeUnmount(() => {
  cancelMotion()
  boundsObserver?.disconnect()
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
      ref="panelElement"
      v-show="controller.open.value"
      id="page-parameter-panel"
      class="page-parameter-panel parameter-panel-surface parameter-panel-surface--frosted settings-controls"
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
          <span class="i-lucide-x" aria-hidden="true" />
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
  --page-parameter-surface-alpha: 0.76;
  --page-parameter-surface-filter: blur(18px) saturate(1.15);
  --page-parameter-inline-inset: clamp(8px, 1.5%, 16px);
  /* Stay above the page search layer (70) inside the main content stack. */
  z-index: 80;
  position: absolute;
  top: 0;
  left: var(--page-parameter-inline-inset);
  right: var(--page-parameter-inline-inset);
  bottom: auto;
  border-radius: 0 0 16px 16px;
  width: auto;
  height: auto;
  max-height: min(50vh, 100%);
  margin: 0;
  background: rgb(
    from var(--auralis-frosted-surface-bg) r g b / var(--page-parameter-surface-alpha)
  );
  -webkit-backdrop-filter: var(--page-parameter-surface-filter);
  backdrop-filter: var(--page-parameter-surface-filter);
  box-shadow: 0 12px 32px rgb(0 0 0 / 12%);
  -webkit-app-region: no-drag;
}
[data-theme='light'] .page-parameter-panel {
  --page-parameter-surface-alpha: 0.72;
}

@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .page-parameter-panel {
    background: var(--auralis-fullscreen-controls-bg);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .page-parameter-panel {
    background: var(--auralis-fullscreen-controls-bg);
  }
}

.page-parameter-panel .parameter-panel-header {
  padding: 10px;
  gap: 6px;
}
.page-parameter-panel .parameter-panel-content {
  flex: 0 1 auto;
  padding: 10px 8px;
}
.page-parameter-panel :deep(.settings-group) {
  margin-bottom: 0;
}
.page-parameter-panel .parameter-panel-header h2 {
  flex: 1;
  min-width: 0;
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.page-parameter-panel .parameter-panel-close {
  width: 28px;
  height: 32px;
}
.page-parameter-panel .parameter-panel-close:hover {
  background: transparent;
  box-shadow: none;
}
.page-parameter-panel .parameter-panel-close > span {
  width: calc(var(--page-parameter-control-size) + 1px);
  height: calc(var(--page-parameter-control-size) + 1px);
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
.page-parameter-panel :deep(.song-font-options .song-font-weight-row) {
  flex-wrap: wrap;
}
.page-parameter-panel :deep(.song-font-column-labels),
.page-parameter-panel :deep(.settings-row.song-font-weight-row > .song-font-controls) {
  grid-template-columns: repeat(2, minmax(0, var(--page-parameter-field-width)));
  gap: 6px;
}
.page-parameter-panel :deep(.settings-row.song-font-weight-row > .song-font-controls) {
  flex: 0 1 var(--page-parameter-fields-width);
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
  font-size: var(--page-parameter-control-size);
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
  justify-content: space-between;
  padding-inline: 10px;
  font-size: var(--page-parameter-control-size);
  white-space: nowrap;
}
.page-parameter-panel :deep(.song-parameters-heading) {
  font-size: var(--auralis-type-caption-size);
  margin-top: 0;
  padding: 8px 6px 4px;
  border-top: 0;
}
.page-parameter-panel :deep(.song-font-weight-status) {
  padding: 2px 6px 6px;
}
.page-parameter-panel :deep(.settings-range-control input) {
  width: 100%;
  min-width: 0;
}
</style>
