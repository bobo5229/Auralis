<script setup lang="ts">
import '../styles/cdTypography.css'
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { useCdCanvasTheme } from '../composables/useCdCanvasTheme'
import {
  beginCdViewSwitchTransition,
  clearCdViewSwitchTransition,
  type CdViewSwitchTarget,
} from '../utils/cdViewSwitchTransition'

const props = defineProps<{ current: CdViewSwitchTarget; transitioning?: boolean }>()

const { t } = useI18n()
const router = useRouter()
const { cdCanvasTheme } = useCdCanvasTheme()
const groupRef = ref<HTMLElement | null>(null)
const visualCurrent = ref(props.current)
const indicatorStyle = ref<CSSProperties>({ visibility: 'hidden' })
const isMoving = ref(false)
const reducedMotion = createReducedMotionQuery()
let observer: ResizeObserver | undefined
let frame = 0
let disposed = false
let syncRevision = 0

function geometryKey(): string {
  const group = groupRef.value
  if (!group) return ''
  const buttons = Array.from(
    group.querySelectorAll<HTMLElement>('button'),
    (button) => `${button.offsetLeft}:${button.offsetWidth}`,
  )
  return [group.offsetWidth, ...buttons].join('|')
}

function syncToCurrent(animate: boolean): void {
  cancelAnimationFrame(frame)
  frame = 0
  const revision = ++syncRevision
  const draw = (): void => {
    if (disposed || revision !== syncRevision) return
    frame = 0
    const group = groupRef.value
    const button = group?.querySelector<HTMLElement>(`button[data-cd-view="${props.current}"]`)
    if (!group || !button || !group.getBoundingClientRect().width) return
    const groupRect = group.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    visualCurrent.value = props.current
    indicatorStyle.value = {
      transform: `translateX(${buttonRect.left - groupRect.left}px)`,
      width: `${buttonRect.width}px`,
    }
  }
  isMoving.value = animate && !reducedMotion.matches
  if (!isMoving.value) {
    // The entering browse page can restore v-show later in this render flush.
    // Measure only after it is visible, including when motion is reduced.
    void nextTick(draw)
    return
  }
  // Match Vue's CSS page-transition start: both targets are applied after two frames.
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(draw)
  })
}

watch(
  () => props.current,
  () => {
    if (!props.transitioning) syncToCurrent(false)
  },
  { flush: 'post' },
)

function onMotionPreferenceChange(): void {
  if (reducedMotion.matches) syncToCurrent(false)
}

onMounted(() => {
  syncToCurrent(false)
  let previousGeometry = geometryKey()
  observer = new ResizeObserver(() => {
    const geometry = geometryKey()
    if (geometry === previousGeometry) return
    previousGeometry = geometry
    syncToCurrent(false)
  })
  if (groupRef.value) observer.observe(groupRef.value)
  groupRef.value?.querySelectorAll('button').forEach((button) => observer?.observe(button))
  reducedMotion.addEventListener('change', onMotionPreferenceChange)
})

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(frame)
  observer?.disconnect()
  reducedMotion.removeEventListener('change', onMotionPreferenceChange)
})

defineExpose({ syncToCurrent })

function open(view: CdViewSwitchTarget): void {
  if (view === props.current) return
  const transition = beginCdViewSwitchTransition(props.current, view)
  const location =
    view === 'browse'
      ? { name: 'cd-albums', query: { entry: 'index' } }
      : { name: 'cd-album-index' }
  void router.push(location).then(
    async (failure) => {
      if (failure) {
        clearCdViewSwitchTransition(transition)
        return
      }
      await nextTick()
      clearCdViewSwitchTransition(transition)
    },
    () => {
      clearCdViewSwitchTransition(transition)
    },
  )
}
</script>

<template>
  <div
    ref="groupRef"
    class="cd-view-switch"
    :class="{ 'cd-view-switch--moving': isMoving }"
    :data-theme="cdCanvasTheme"
    role="group"
    :aria-label="t('albums.cd.view.label')"
  >
    <button
      type="button"
      data-cd-view="browse"
      :class="{ 'cd-view-switch-selected': visualCurrent === 'browse' }"
      :aria-pressed="current === 'browse'"
      @click="open('browse')"
    >
      {{ t('albums.cd.view.browse') }}
    </button>
    <button
      type="button"
      data-cd-view="index"
      :class="{ 'cd-view-switch-selected': visualCurrent === 'index' }"
      :aria-pressed="current === 'index'"
      @click="open('index')"
    >
      {{ t('albums.cd.view.index') }}
    </button>
    <span class="cd-view-switch-indicator" :style="indicatorStyle" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.cd-view-switch {
  --cd-text: #292929;
  --cd-text-muted: #62625b;
  --cd-focus-ring: #292929;
  position: absolute;
  z-index: 3;
  top: 16px;
  left: 50%;
  display: inline-flex;
  gap: 24px;
  background: transparent;
  transform: translateX(-50%);
  -webkit-app-region: no-drag;
}

.cd-view-switch[data-theme='dark'] {
  --cd-text: #e6e4de;
  --cd-text-muted: #a8a69f;
  --cd-focus-ring: #d8d6d0;
}

.cd-view-switch button {
  position: relative;
  padding: 6px 0;
  font-family: var(--cd-font-text);
  font-size: var(--cd-type-nav-size);
  font-weight: 400;
  line-height: var(--cd-type-nav-line-height);
  color: var(--cd-text-muted);
  background: transparent;
  border: 0;
  border-radius: 0;
  cursor: pointer;
}

.cd-view-switch button.cd-view-switch-selected {
  color: var(--cd-text);
}

.cd-view-switch button:hover:not(:disabled) {
  color: var(--cd-text);
  background: transparent;
}

.cd-view-switch button:focus-visible {
  outline: 2px solid var(--cd-focus-ring);
  outline-offset: 3px;
}

.cd-view-switch-indicator {
  position: absolute;
  left: 0;
  bottom: 5px;
  height: 1px;
  border-radius: 999px;
  background: var(--cd-text);
  pointer-events: none;
}

.cd-view-switch--moving .cd-view-switch-indicator {
  transition:
    transform var(--cd-view-switch-duration, 420ms)
      var(--cd-view-switch-easing, cubic-bezier(0.22, 1, 0.36, 1)),
    width var(--cd-view-switch-duration, 420ms)
      var(--cd-view-switch-easing, cubic-bezier(0.22, 1, 0.36, 1));
}

.cd-view-switch--moving button {
  transition: color var(--cd-view-switch-duration, 420ms)
    var(--cd-view-switch-easing, cubic-bezier(0.22, 1, 0.36, 1));
}

:where([data-reduced-motion='true']) .cd-view-switch .cd-view-switch-indicator,
:where([data-reduced-motion='true']) .cd-view-switch button {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .cd-view-switch .cd-view-switch-indicator,
  .cd-view-switch button {
    transition: none;
  }
}
</style>
