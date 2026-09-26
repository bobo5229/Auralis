<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  moveSurfaceIndicator,
  resetSurfaceIndicator,
  type CdSurfaceIndicatorMotionState,
} from '../utils/cdSurfaceIndicator'
import {
  beginCdViewSwitchTransition,
  clearCdViewSwitchTransition,
  consumeCdViewSwitchTransition,
  type CdViewSwitchTarget,
} from '../utils/cdViewSwitchTransition'

const props = defineProps<{ current: CdViewSwitchTarget }>()

const { t } = useI18n()
const router = useRouter()
const switchRef = ref<HTMLElement | null>(null)
const underlineRef = ref<HTMLElement | null>(null)
let reducedMotion: MediaQueryList | null = null
let resizeObserver: ResizeObserver | null = null
const indicatorMotion: CdSurfaceIndicatorMotionState = {
  edges: null,
  cancelAnimation: null,
}

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

function getViewButton(group: HTMLElement, view: CdViewSwitchTarget): HTMLElement | null {
  return group.querySelector<HTMLElement>('button[data-cd-view="' + view + '"]')
}

function positionUnderline(animate: boolean, startView?: CdViewSwitchTarget): void {
  const group = switchRef.value
  const underline = underlineRef.value
  const targetButton = group?.querySelector<HTMLElement>('button[aria-pressed="true"]') ?? null
  const startButton = group && startView ? getViewButton(group, startView) : null
  moveSurfaceIndicator(indicatorMotion, {
    group,
    line: underline,
    targetButton,
    startButton,
    animate,
    reducedMotion: reducedMotion?.matches ?? true,
  })
}

function readGeometry(group: HTMLElement): number[] {
  return [
    group.clientWidth,
    ...Array.from(group.querySelectorAll<HTMLElement>('button[data-cd-view]')).flatMap((button) => [
      button.offsetLeft,
      button.offsetWidth,
    ]),
  ]
}

function onMotionPreferenceChange(): void {
  positionUnderline(false)
}

onMounted(() => {
  const transition = consumeCdViewSwitchTransition(props.current)

  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.addEventListener('change', onMotionPreferenceChange)
  positionUnderline(transition !== null, transition?.from)

  const group = switchRef.value
  if (!group) return
  let previousGeometry = readGeometry(group)
  resizeObserver = new ResizeObserver(() => {
    const nextGeometry = readGeometry(group)
    if (nextGeometry.every((value, index) => value === previousGeometry[index])) return
    previousGeometry = nextGeometry
    positionUnderline(false)
  })
  resizeObserver.observe(group)
  group
    .querySelectorAll('button[data-cd-view]')
    .forEach((button) => resizeObserver?.observe(button))
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  reducedMotion?.removeEventListener('change', onMotionPreferenceChange)
  reducedMotion = null
  resetSurfaceIndicator(indicatorMotion)
})
</script>

<template>
  <div ref="switchRef" class="cd-view-switch" role="group" :aria-label="t('albums.cd.view.label')">
    <button
      type="button"
      data-cd-view="browse"
      :aria-pressed="current === 'browse'"
      @click="open('browse')"
    >
      {{ t('albums.cd.view.browse') }}
    </button>
    <button
      type="button"
      data-cd-view="index"
      :aria-pressed="current === 'index'"
      @click="open('index')"
    >
      {{ t('albums.cd.view.index') }}
    </button>
    <span ref="underlineRef" class="cd-view-switch-indicator" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.cd-view-switch {
  position: absolute;
  top: 16px;
  left: 50%;
  display: inline-flex;
  gap: 24px;
  transform: translateX(-50%);
  -webkit-app-region: no-drag;
}

.cd-view-switch button {
  padding: 6px 0;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 20px;
  color: var(--cd-text-muted);
  background: transparent;
  border: 0;
  border-radius: 0;
  cursor: pointer;
}

.cd-view-switch button[aria-pressed='true'] {
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
  width: 0;
  height: 1px;
  border-radius: 999px;
  background: var(--cd-text);
  pointer-events: none;
}
</style>
