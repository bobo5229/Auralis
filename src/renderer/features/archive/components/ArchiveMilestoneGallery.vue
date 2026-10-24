<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '@renderer/shared/dialog/AppDialog.vue'
import { milestoneBadges, milestoneGroups } from '../constants/milestoneBadges'
import { getBadgePreview } from '../utils/badgeMaterials'
import type { BadgeState } from '../runtime/badgeMaterialRenderer'
import ArchiveMilestonePreview from './ArchiveMilestonePreview.vue'

defineProps<{ open: boolean; returnFocusTo: HTMLElement | null }>()
defineEmits<{ close: [] }>()
const { t, te } = useI18n()
const titleId = useId()
const noteId = useId()
const selectedId = ref('hours100')
const selectedState = ref<BadgeState>('lit')
const selected = computed(
  () => milestoneBadges.find((badge) => badge.id === selectedId.value) ?? milestoneBadges[0],
)
const previewStates: readonly BadgeState[] = ['lit', 'unlit']
function badgeName(badge: (typeof milestoneBadges)[number]) {
  const key = `archive.milestones.names.${badge.id}`
  return te(key) ? t(key) : badge.name
}
function albumLabel(badge: (typeof milestoneBadges)[number]) {
  const key = `archive.milestones.labels.${badge.id}`
  return te(key) ? t(key) : badgeName(badge)
}
</script>

<template>
  <AppDialog
    :open="open"
    :title="t('archive.milestones.catalogTitle')"
    :title-id="titleId"
    :described-by="noteId"
    :return-focus-to="returnFocusTo"
    @close="$emit('close')"
  >
    <template #subtitle>
      <p :id="noteId" class="archive-milestone-gallery__note auralis-type-caption">
        {{ t('archive.milestones.catalogNote') }}
      </p>
    </template>
    <div class="archive-milestone-gallery-container">
      <div class="archive-milestone-gallery">
        <div class="archive-milestone-gallery__inspection">
          <ArchiveMilestonePreview :badge-id="selected.id" :state="selectedState" />
          <div class="archive-milestone-gallery__detail">
            <h3 class="auralis-type-section">{{ badgeName(selected) }}</h3>
            <p class="auralis-type-caption">
              {{
                selected.group === 'albums'
                  ? albumLabel(selected)
                  : t(`archive.milestones.${selected.group}Label`, { count: selected.amount })
              }}
            </p>
            <div
              class="archive-milestone-gallery__states"
              role="group"
              :aria-label="t('archive.milestones.appearance')"
            >
              <button
                v-for="state in previewStates"
                :key="state"
                type="button"
                :aria-pressed="selectedState === state"
                @click="selectedState = state"
              >
                {{ t(`archive.milestones.${state}`) }}
              </button>
            </div>
            <p class="archive-milestone-gallery__instructions auralis-type-caption">
              {{ t('archive.milestones.instructions') }}
            </p>
          </div>
        </div>
        <div class="archive-milestone-gallery__groups">
          <section
            v-for="group in milestoneGroups"
            :key="group"
            :aria-labelledby="`${titleId}-${group}`"
            class="archive-milestone-gallery__group"
          >
            <h3 :id="`${titleId}-${group}`" class="auralis-type-control">
              {{ t(`archive.milestones.groups.${group}`) }}
            </h3>
            <ul class="archive-milestone-gallery__badges">
              <li
                v-for="badge in milestoneBadges.filter((item) => item.group === group)"
                :key="badge.id"
              >
                <button
                  type="button"
                  class="archive-milestone-gallery__badge-button"
                  :aria-pressed="selectedId === badge.id"
                  :data-badge-select="badge.id"
                  @click="selectedId = badge.id"
                >
                  <img
                    :src="getBadgePreview(badge.id, selectedState)"
                    alt=""
                    width="120"
                    height="135"
                    loading="lazy"
                    draggable="false"
                  />
                  <span class="archive-milestone-gallery__badge-name auralis-type-control">
                    {{ badgeName(badge) }}
                  </span>
                  <span class="archive-milestone-gallery__badge-label auralis-type-caption">
                    {{
                      badge.amount && badge.group !== 'albums'
                        ? t(`archive.milestones.${group}Label`, { count: badge.amount })
                        : albumLabel(badge)
                    }}
                  </span>
                </button>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.archive-milestone-gallery__note {
  max-width: 56ch;
  margin: 4px 0 0;
  color: var(--auralis-text-muted);
}
.archive-milestone-gallery {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.archive-milestone-gallery-container {
  container-type: inline-size;
}
.archive-milestone-gallery__groups {
  display: grid;
  gap: 24px;
  min-width: 0;
}
.archive-milestone-gallery__inspection {
  position: sticky;
  top: 0;
  min-width: 0;
}
.archive-milestone-gallery__detail {
  text-align: center;
}
.archive-milestone-gallery__detail h3 {
  margin: 12px 0 4px;
  color: var(--auralis-text);
  font-weight: 500;
}
.archive-milestone-gallery__detail p {
  margin: 4px 0;
  color: var(--auralis-text-muted);
}
.archive-milestone-gallery__states {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 16px;
}
.archive-milestone-gallery__states button {
  padding: 5px 10px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 5px;
  color: var(--auralis-text-muted);
  background: transparent;
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  cursor: pointer;
}
.archive-milestone-gallery__states button[aria-pressed='true'] {
  color: var(--auralis-text);
  background: var(--auralis-control-hover-bg);
}
.archive-milestone-gallery__detail .archive-milestone-gallery__instructions {
  margin-top: 14px;
}
.archive-milestone-gallery__badge-button {
  display: block;
  width: 100%;
  padding: 8px 4px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}
.archive-milestone-gallery__badge-button:hover {
  background: var(--auralis-control-hover-bg);
}
.archive-milestone-gallery__badge-button[aria-pressed='true'] {
  border-color: var(--auralis-border-strong);
  background: var(--auralis-surface-raised);
}
.archive-milestone-gallery__badge-button:focus-visible,
.archive-milestone-gallery__states button:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}
@container (max-width:640px) {
  .archive-milestone-gallery {
    grid-template-columns: minmax(0, 1fr);
  }
  .archive-milestone-gallery__inspection {
    position: static;
    display: grid;
    grid-template-columns: minmax(0, 180px) minmax(0, 1fr);
    align-items: center;
    gap: 16px;
  }
  .archive-milestone-gallery__detail {
    text-align: left;
  }
  .archive-milestone-gallery__states {
    justify-content: flex-start;
  }
}
.archive-milestone-gallery__group > h3 {
  margin: 0 0 12px;
  color: var(--auralis-text-muted);
  font-weight: 500;
}
.archive-milestone-gallery__badges {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 16px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.archive-milestone-gallery__badges li {
  min-width: 0;
  text-align: center;
}
.archive-milestone-gallery__badges img {
  display: block;
  width: min(120px, 100%);
  height: auto;
  aspect-ratio: 330 / 370;
  margin: 0 auto 8px;
  filter: drop-shadow(0 3px 3px rgb(0 0 0 / 16%));
}
.archive-milestone-gallery__badge-name {
  display: block;
  margin: 0;
  color: var(--auralis-text);
  font-weight: 500;
}
.archive-milestone-gallery__badge-label {
  display: block;
  margin: 4px 0 0;
  color: var(--auralis-text-muted);
}
</style>
