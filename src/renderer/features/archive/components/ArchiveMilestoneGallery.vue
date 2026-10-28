<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '@renderer/shared/dialog/AppDialog.vue'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { milestoneBadges, milestoneGroups, type MilestoneGroup } from '../constants/milestoneBadges'
import { badgeContours, badgeMaterialDescriptors, getBadgePreview } from '../utils/badgeMaterials'
import { useBadgeInspection } from '../composables/useBadgeInspection'
import { createPressureSurface } from '../runtime/badgePressureSurface'
import type { BadgeAchievements } from '@shared/types/badgeAchievements'
import { badgeAchievementStatus } from '../utils/badgeAchievementStatus'
import type { InspectBadge } from '../runtime/badgeInspectRenderer'
import aluminiumTexture from '../assets/milestones/case/brushed-aluminium.png?url'
import '../styles/badgeGallery.css'

const props = defineProps<{
  open: boolean
  returnFocusTo: HTMLElement | null
  achievements: BadgeAchievements | null
  achievementsError: boolean
}>()
const emit = defineEmits<{ close: [] }>()
const { t, te } = useI18n()
const titleId = useId()
const caseClose = ref<HTMLButtonElement | null>(null)
const canvasRevision = ref(0)
type MilestoneView = 'all' | MilestoneGroup
const views: readonly MilestoneView[] = ['all', ...milestoneGroups]
const group = ref<MilestoneView>('all')
const displayAchievements = ref(props.achievements)
const sections = computed(() =>
  (group.value === 'all' ? milestoneGroups : [group.value]).map((group) => ({
    group,
    badges: milestoneBadges.filter((badge) => badge.group === group),
  })),
)
const badges = computed(() => sections.value.flatMap((section) => section.badges))
const previewSources = computed<string[]>((previous) => {
  const sources = displayAchievements.value
    ? badges.value.map((badge) => getBadgePreview(badge.id, badgeState(badge)))
    : []
  return previous &&
    sources.length === previous.length &&
    sources.every((source, index) => source === previous[index])
    ? previous
    : sources
})
const previewsReady = ref(false),
  previewsFailed = ref(false)
const casePresented = ref(false),
  aluminiumReady = ref(false),
  pressureReady = ref(false),
  aluminiumFailed = ref(false)
watch(
  previewSources,
  async (sources, _previous, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    previewsReady.value = false
    previewsFailed.value = false
    if (!sources.length) return
    try {
      await Promise.all(
        sources.map(async (src) => {
          const image = new Image()
          image.src = src
          await image.decode()
        }),
      )
      if (!cancelled) previewsReady.value = true
    } catch {
      if (!cancelled) previewsFailed.value = true
    }
  },
  { immediate: true, flush: 'sync' },
)
const viewport = ref<HTMLElement | null>(null),
  sheet = ref<HTMLElement | null>(null),
  row = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null),
  canvas = ref<HTMLCanvasElement | null>(null),
  caption = ref<HTMLElement | null>(null)
const canPrevious = ref(false),
  canNext = ref(false),
  failed = ref(false),
  foamFailed = ref(false)
const caseError = computed(() =>
  props.achievementsError
    ? t('archive.milestones.achievementsError')
    : previewsFailed.value
      ? t('archive.milestones.previewError')
      : foamFailed.value || aluminiumFailed.value
        ? t('archive.milestones.caseError')
        : failed.value
          ? t('archive.milestones.inspectError')
          : '',
)
const lifetime = new AbortController()
const motion = createReducedMotionQuery()
watch([previewsReady, aluminiumReady, pressureReady, caseError], async () => {
  if (
    casePresented.value ||
    (!caseError.value && !(previewsReady.value && aluminiumReady.value && pressureReady.value))
  )
    return
  casePresented.value = true
  await nextTick()
  if (!lifetime.signal.aborted && !active.value) caseClose.value?.focus({ preventScroll: true })
})
let surface: Awaited<ReturnType<typeof createPressureSurface>> | undefined
let observer: ResizeObserver | undefined
const inspection = useBadgeInspection({
  stage,
  canvas,
  caption,
  onLift: (id) => surface?.setRemoved(id, true),
  onReturn: (id) => surface?.setRemoved(id, false),
  onError: () => {
    failed.value = true
    // A lost WebGL context remains attached to its canvas; retries need a fresh node.
    canvasRevision.value++
  },
  onSwitchError: () => {
    failed.value = true
  },
})
const { phase, badgeId, liftedId, active } = inspection
// Keep model appearance, previews and text on one snapshot throughout an inspection.
watch([() => props.achievements, active], () => {
  if (!active.value) displayAchievements.value = props.achievements
})
function badgeState(badge: (typeof milestoneBadges)[number]) {
  return displayAchievements.value &&
    badgeAchievementStatus(badge, displayAchievements.value).earned
    ? ('lit' as const)
    : ('unlit' as const)
}
const index = computed(() => badges.value.findIndex((badge) => badge.id === badgeId.value))
const currentBadge = computed(() => milestoneBadges.find((item) => item.id === badgeId.value))
const currentName = computed(() => (currentBadge.value ? badgeName(currentBadge.value) : ''))
const currentCondition = computed(() => {
  const badge = currentBadge.value
  if (!badge) return ''
  const key = badge.group === 'albums' ? badge.id : badge.group
  return t(`archive.milestones.conditions.${key}`, { count: badge.amount ?? 0 })
})
const currentProgress = computed(() => {
  if (!currentBadge.value || !displayAchievements.value) return ''
  const status = badgeAchievementStatus(currentBadge.value, displayAchievements.value)
  if (status.earned) return t('archive.milestones.earned')
  if (!status.target) return t('archive.milestones.noEligibleAlbum')
  return t(`archive.milestones.progress.${status.unit}`, {
    count: status.unit === 'hours' ? Math.floor(status.current * 10) / 10 : status.current,
    total: status.target,
  })
})
const captionVisible = computed(
  () => phase.value === 'inspecting' || phase.value === 'switch-loading',
)
function badgeName(badge: (typeof milestoneBadges)[number]) {
  const key = `archive.milestones.names.${badge.id}`
  return te(key) ? t(key) : badge.name
}
function descriptor(id: string): InspectBadge {
  return {
    id,
    contour: badgeContours[id],
    material: badgeMaterialDescriptors[id],
    state: badgeState(milestoneBadges.find((badge) => badge.id === id)!),
  }
}
function buttonFor(id: string) {
  return row.value?.querySelector<HTMLButtonElement>(`[data-badge="${id}"]`)
}
function inspect(id: string) {
  const button = buttonFor(id)
  if (!button) return
  failed.value = false
  void inspection.open(descriptor(id), button)
}
function switchBadge(delta: number) {
  const badge = badges.value[index.value + delta]
  const button = badge && buttonFor(badge.id)
  if (button) {
    failed.value = false
    void inspection.switchTo(descriptor(badge.id), button, delta < 0 ? -1 : 1)
  }
}
function inspectionKeydown(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    (event.key !== 'PageUp' && event.key !== 'PageDown')
  )
    return
  event.preventDefault()
  if (event.repeat || phase.value !== 'inspecting') return
  switchBadge(event.key === 'PageUp' ? -1 : 1)
}
function close() {
  if (active.value) inspection.close()
  else emit('close')
}
function updateArrows() {
  const element = viewport.value
  if (!element) return
  canPrevious.value = element.scrollLeft > 2
  canNext.value = element.scrollLeft < element.scrollWidth - element.clientWidth - 2
}
function scroll(delta: number) {
  viewport.value?.scrollBy({ left: delta * 222, behavior: motion.matches ? 'instant' : 'smooth' })
}
function wheel(event: WheelEvent) {
  if (
    group.value === 'all' ||
    event.ctrlKey ||
    Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
    !viewport.value
  )
    return
  const movement =
    event.deltaY *
    (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? viewport.value.clientWidth : 1)
  if (movement > 0 ? !canNext.value : !canPrevious.value) return
  event.preventDefault()
  viewport.value.scrollLeft += movement
}
function rebuild() {
  surface?.setBadges(
    badges.value.map((badge) => ({ id: badge.id, contour: badgeContours[badge.id] })),
  )
  updateArrows()
}
watch(group, async () => {
  await nextTick()
  if (lifetime.signal.aborted) return
  viewport.value?.scrollTo({ left: 0, top: 0, behavior: 'instant' })
  rebuild()
})
onMounted(async () => {
  observer = new ResizeObserver(updateArrows)
  observer.observe(viewport.value!)
  viewport.value!.addEventListener('wheel', wheel, { passive: false, signal: lifetime.signal })
  void (async () => {
    try {
      const image = new Image()
      image.src = aluminiumTexture
      await image.decode()
      if (!lifetime.signal.aborted) aluminiumReady.value = true
    } catch {
      if (!lifetime.signal.aborted) aluminiumFailed.value = true
    }
  })()
  try {
    surface = await createPressureSurface(sheet.value!, row.value!, lifetime.signal)
    rebuild()
    await surface.ready
    if (!lifetime.signal.aborted) pressureReady.value = true
  } catch {
    if (!lifetime.signal.aborted) foamFailed.value = true
  }
})
onBeforeUnmount(() => {
  lifetime.abort()
  observer?.disconnect()
})
defineExpose({
  snapshot: () => ({ inspection: inspection.snapshot(), foam: surface?.snapshot() ?? null }),
  forceContextLoss: inspection.forceContextLoss,
})
</script>

<template>
  <AppDialog
    :open="open"
    :title="t('archive.milestones.title')"
    :title-id="titleId"
    :padded="false"
    :initial-focus="() => (casePresented ? (caseClose ?? undefined) : undefined)"
    :busy="!casePresented"
    :return-focus-to="returnFocusTo"
    panel-class="archive-badge-dialog"
    @close="close"
  >
    <template #header>
      <h2 :id="titleId" class="sr-only">{{ t('archive.milestones.title') }}</h2>
    </template>
    <div
      class="archive-badge-gallery"
      :class="{ 'is-ready': casePresented, 'is-inspecting': active, 'is-all': group === 'all' }"
      :inert="active || !casePresented"
      :data-foam-failed="foamFailed || undefined"
    >
      <section class="collection-case" :aria-label="t('archive.milestones.collectionCase')">
        <div class="case-foot" aria-hidden="true"></div>
        <div class="aluminium-rim">
          <div class="rim-grain" aria-hidden="true"></div>
          <div class="case-toolbar">
            <nav class="categories" :aria-label="t('archive.milestones.categories')">
              <button
                v-for="item in views"
                :key="item"
                type="button"
                :data-series="item"
                :aria-pressed="group === item"
                @click="group = item"
              >
                {{ t(`archive.milestones.groups.${item}`) }}
              </button>
            </nav>
            <div class="case-actions">
              <span
                v-if="caseError"
                class="case-error-icon"
                role="img"
                :aria-label="caseError"
                :title="caseError"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v6m0 3h.01" />
                </svg>
              </span>
              <button
                ref="caseClose"
                class="case-close"
                type="button"
                :aria-label="t('dialog.close')"
                @click="close"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>
          </div>
          <div class="inner-channel">
            <div
              ref="viewport"
              class="foam-viewport"
              tabindex="0"
              :aria-label="
                t(group === 'all' ? 'archive.milestones.browseAll' : 'archive.milestones.browse')
              "
              @scroll="updateArrows"
            >
              <div ref="sheet" class="foam-sheet">
                <div
                  ref="row"
                  class="badge-layout"
                  :class="{ 'is-loading': !previewsReady }"
                  :inert="!previewsReady"
                  :aria-busy="!previewsReady && !previewsFailed"
                >
                  <section
                    v-for="section in sections"
                    :key="section.group"
                    class="badge-group"
                    :aria-labelledby="`${titleId}-${section.group}`"
                  >
                    <h3
                      :id="`${titleId}-${section.group}`"
                      class="badge-group__title"
                      :class="{ 'sr-only': group !== 'all' }"
                    >
                      {{ t(`archive.milestones.groups.${section.group}`) }}
                    </h3>
                    <ul class="badge-row">
                      <li v-for="badge in section.badges" :key="badge.id" class="badge-item">
                        <button
                          type="button"
                          class="badge-button"
                          :data-badge="badge.id"
                          :data-achievement-state="badgeState(badge)"
                          :data-badge-select="badge.id"
                          :data-inspected="liftedId === badge.id ? 'true' : undefined"
                          :aria-pressed="liftedId === badge.id"
                          :aria-label="
                            t('archive.milestones.inspectBadge', {
                              name: badgeName(badge),
                              status: t(
                                badgeState(badge) === 'lit'
                                  ? 'archive.milestones.earned'
                                  : 'archive.milestones.notEarned',
                              ),
                            })
                          "
                          aria-haspopup="dialog"
                          @click="inspect(badge.id)"
                        >
                          <img
                            class="badge-image"
                            :src="getBadgePreview(badge.id, badgeState(badge))"
                            alt=""
                            width="330"
                            height="370"
                            draggable="false"
                          />
                        </button>
                        <span class="badge-name">{{ badgeName(badge) }}</span>
                      </li>
                    </ul>
                  </section>
                </div>
              </div>
            </div>
          </div>
          <button
            v-if="group !== 'all'"
            class="scroll-arrow scroll-arrow--previous"
            type="button"
            :disabled="!canPrevious"
            :aria-label="t('archive.milestones.browsePrevious')"
            @click="scroll(-1)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 7-5 5 5 5" /></svg>
          </button>
          <button
            v-if="group !== 'all'"
            class="scroll-arrow scroll-arrow--next"
            type="button"
            :disabled="!canNext"
            :aria-label="t('archive.milestones.browseNext')"
            @click="scroll(1)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 7 5 5-5 5" /></svg>
          </button>
        </div>
      </section>
      <p v-if="caseError" class="sr-only" role="status">
        {{ caseError }}
      </p>
    </div>
    <template #overlay>
      <div
        v-show="active"
        class="badge-inspector"
        :class="{
          'is-active': active,
          'is-present': active && phase !== 'loading' && phase !== 'leaving',
        }"
        :data-inspection-phase="phase"
        :data-inspection-badge="badgeId"
        :data-leaving="phase === 'leaving' ? '' : undefined"
        :aria-busy="phase === 'loading'"
        @click.self="inspection.close"
        @keydown="inspectionKeydown"
      >
        <div
          ref="stage"
          class="inspect-object"
          tabindex="0"
          role="img"
          :aria-label="t('archive.milestones.previewFor', { name: currentName })"
          :aria-describedby="`${titleId}-instructions ${titleId}-condition ${titleId}-progress`"
          @pointermove="inspection.pointer"
          @pointerleave="inspection.reset"
          @pointercancel="inspection.reset"
          @keydown="inspection.keydown"
        >
          <canvas
            :key="canvasRevision"
            ref="canvas"
            class="inspect-canvas"
            aria-hidden="true"
          ></canvas>
          <p :id="`${titleId}-instructions`" class="sr-only">
            {{ t('archive.milestones.instructions') }}
          </p>
        </div>
        <div
          ref="caption"
          class="inspect-caption"
          :class="{ 'is-visible': captionVisible }"
          :aria-hidden="!captionVisible"
        >
          <h3 class="inspect-caption__name">{{ currentName }}</h3>
          <p :id="`${titleId}-condition`" class="inspect-caption__condition">
            {{ currentCondition }}
          </p>
          <p :id="`${titleId}-progress`" class="inspect-caption__progress">{{ currentProgress }}</p>
        </div>
        <button
          class="inspect-close"
          type="button"
          :aria-label="t('archive.milestones.returnBadge')"
          @click="inspection.close"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
        <button
          v-show="phase === 'inspecting'"
          class="inspect-switch inspect-switch--previous"
          type="button"
          :disabled="phase !== 'inspecting' || index <= 0"
          :aria-label="t('archive.milestones.previousBadge')"
          :title="`${t('archive.milestones.previousBadge')} (PageUp)`"
          aria-keyshortcuts="PageUp"
          @click="switchBadge(-1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 7-5 5 5 5" /></svg>
        </button>
        <button
          v-show="phase === 'inspecting'"
          class="inspect-switch inspect-switch--next"
          type="button"
          :disabled="phase !== 'inspecting' || index >= badges.length - 1"
          :aria-label="t('archive.milestones.nextBadge')"
          :title="`${t('archive.milestones.nextBadge')} (PageDown)`"
          aria-keyshortcuts="PageDown"
          @click="switchBadge(1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 7 5 5-5 5" /></svg>
        </button>
      </div>
    </template>
  </AppDialog>
</template>
