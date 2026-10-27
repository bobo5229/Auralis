<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '@renderer/shared/dialog/AppDialog.vue'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { milestoneBadges, milestoneGroups, type MilestoneGroup } from '../constants/milestoneBadges'
import { badgeContours, badgeMaterialDescriptors, getBadgePreview } from '../utils/badgeMaterials'
import { useBadgeInspection } from '../composables/useBadgeInspection'
import { createPressureSurface } from '../runtime/badgePressureSurface'
import type { BadgeState } from '../runtime/badgeMaterialRenderer'
import type { InspectBadge } from '../runtime/badgeInspectRenderer'
import '../styles/badgeGallery.css'

defineProps<{ open: boolean; returnFocusTo: HTMLElement | null }>()
const emit = defineEmits<{ close: [] }>()
const { t, te } = useI18n()
const titleId = useId()
const caseClose = ref<HTMLButtonElement | null>(null)
const canvasRevision = ref(0)
const group = ref<MilestoneGroup>('hours'),
  appearance = ref<BadgeState>('lit')
const badges = computed(() => milestoneBadges.filter((badge) => badge.group === group.value))
const previewSources = computed(() =>
  badges.value.map((badge) => getBadgePreview(badge.id, appearance.value)),
)
const previewsReady = ref(false),
  previewsFailed = ref(false)
watch(
  previewSources,
  async (sources, _previous, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    previewsReady.value = false
    previewsFailed.value = false
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
  canvas = ref<HTMLCanvasElement | null>(null)
const canPrevious = ref(false),
  canNext = ref(false),
  failed = ref(false),
  foamFailed = ref(false)
const caseError = computed(() =>
  previewsFailed.value
    ? t('archive.milestones.previewError')
    : failed.value
      ? t('archive.milestones.inspectError')
      : '',
)
const lifetime = new AbortController()
const motion = createReducedMotionQuery()
let surface: Awaited<ReturnType<typeof createPressureSurface>> | undefined
let observer: ResizeObserver | undefined
const inspection = useBadgeInspection({
  stage,
  canvas,
  onLift: (id) => surface?.setRemoved(id, true),
  onReturn: (id) => surface?.setRemoved(id, false),
  onError: () => {
    failed.value = true
    // A lost WebGL context remains attached to its canvas; retries need a fresh node.
    canvasRevision.value++
  },
})
const { phase, badgeId, liftedId, active } = inspection
const index = computed(() => badges.value.findIndex((badge) => badge.id === badgeId.value))
const currentName = computed(() => {
  const badge = milestoneBadges.find((item) => item.id === badgeId.value)
  return badge ? badgeName(badge) : ''
})
function badgeName(badge: (typeof milestoneBadges)[number]) {
  const key = `archive.milestones.names.${badge.id}`
  return te(key) ? t(key) : badge.name
}
function descriptor(id: string): InspectBadge {
  return {
    id,
    contour: badgeContours[id],
    material: badgeMaterialDescriptors[id],
    state: appearance.value,
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
  if (button) inspection.switchTo(descriptor(badge.id), button)
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
  if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || !viewport.value) return
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
  viewport.value?.scrollTo({ left: 0, behavior: 'instant' })
  rebuild()
})
onMounted(async () => {
  observer = new ResizeObserver(updateArrows)
  observer.observe(viewport.value!)
  viewport.value!.addEventListener('wheel', wheel, { passive: false, signal: lifetime.signal })
  try {
    surface = await createPressureSurface(sheet.value!, row.value!, lifetime.signal)
    rebuild()
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
    :initial-focus="() => caseClose ?? undefined"
    :return-focus-to="returnFocusTo"
    panel-class="archive-badge-dialog"
    @close="close"
  >
    <template #header>
      <h2 :id="titleId" class="sr-only">{{ t('archive.milestones.title') }}</h2>
    </template>
    <div class="archive-badge-gallery" :inert="active" :data-foam-failed="foamFailed || undefined">
      <section class="collection-case" :aria-label="t('archive.milestones.collectionCase')">
        <div class="case-foot" aria-hidden="true"></div>
        <div class="aluminium-rim">
          <div class="rim-grain" aria-hidden="true"></div>
          <div class="case-toolbar">
            <nav class="categories" :aria-label="t('archive.milestones.categories')">
              <button
                v-for="item in milestoneGroups"
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
              <div
                class="case-appearance auralis-type-caption"
                role="group"
                :aria-label="t('archive.milestones.appearance')"
              >
                <button
                  v-for="state in ['lit', 'unlit'] as const"
                  :key="state"
                  type="button"
                  :data-badge-state="state"
                  :aria-pressed="appearance === state"
                  @click="appearance = state"
                >
                  {{ t(`archive.milestones.${state}`) }}
                </button>
              </div>
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
              :aria-label="t('archive.milestones.browse')"
              @scroll="updateArrows"
            >
              <div ref="sheet" class="foam-sheet">
                <ul
                  ref="row"
                  class="badge-row"
                  :class="{ 'is-loading': !previewsReady }"
                  :inert="!previewsReady"
                  :aria-busy="!previewsReady && !previewsFailed"
                  :aria-label="t(`archive.milestones.groups.${group}`)"
                >
                  <li v-for="badge in badges" :key="badge.id" class="badge-item">
                    <button
                      type="button"
                      class="badge-button"
                      :data-badge="badge.id"
                      :data-badge-select="badge.id"
                      :data-inspected="liftedId === badge.id ? 'true' : undefined"
                      :aria-pressed="liftedId === badge.id"
                      :aria-label="t('archive.milestones.inspectBadge', { name: badgeName(badge) })"
                      aria-haspopup="dialog"
                      @click="inspect(badge.id)"
                    >
                      <img
                        class="badge-image"
                        :src="getBadgePreview(badge.id, appearance)"
                        alt=""
                        width="330"
                        height="370"
                        draggable="false"
                      />
                    </button>
                    <span class="badge-name">{{ badgeName(badge) }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <button
            class="scroll-arrow scroll-arrow--previous"
            type="button"
            :disabled="!canPrevious"
            :aria-label="t('archive.milestones.browsePrevious')"
            @click="scroll(-1)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 7-5 5 5 5" /></svg>
          </button>
          <button
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
          'is-present': phase === 'entering' || phase === 'inspecting',
        }"
        :data-inspection-phase="phase"
        :data-inspection-badge="badgeId"
        :data-leaving="phase === 'leaving' ? '' : undefined"
        :aria-busy="phase === 'loading'"
        @click.self="inspection.close"
      >
        <div
          ref="stage"
          class="inspect-object"
          tabindex="0"
          role="img"
          :aria-label="t('archive.milestones.previewFor', { name: currentName })"
          :aria-describedby="`${titleId}-instructions`"
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
        <button
          class="inspect-close"
          type="button"
          :aria-label="t('archive.milestones.returnBadge')"
          @click="inspection.close"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
        <button
          class="inspect-switch inspect-switch--previous"
          type="button"
          :disabled="phase !== 'inspecting' || index <= 0"
          :aria-label="t('archive.milestones.previousBadge')"
          @click="switchBadge(-1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 7-5 5 5 5" /></svg>
        </button>
        <button
          class="inspect-switch inspect-switch--next"
          type="button"
          :disabled="phase !== 'inspecting' || index >= badges.length - 1"
          :aria-label="t('archive.milestones.nextBadge')"
          @click="switchBadge(1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 7 5 5-5 5" /></svg>
        </button>
      </div>
    </template>
  </AppDialog>
</template>
