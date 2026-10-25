<script setup lang="ts">
import { defineAsyncComponent, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { featuredMilestoneBadges } from '../constants/milestoneBadges'
import { getBadgePreview } from '../utils/badgeMaterials'
import '../styles/milestoneCase.css'

const ArchiveMilestoneGallery = defineAsyncComponent(() => import('./ArchiveMilestoneGallery.vue'))
const { t, te } = useI18n()
const titleId = useId()
const noteId = useId()
const galleryOpen = ref(false)
const galleryTrigger = ref<HTMLButtonElement | null>(null)
function openGallery() {
  galleryOpen.value = true
}
</script>

<template>
  <section class="archive-milestone-case" :aria-labelledby="titleId" :aria-describedby="noteId">
    <div class="archive-milestone-case__lining">
      <header class="archive-milestone-case__header">
        <h2 :id="titleId">{{ t('archive.milestones.title') }}</h2>
        <button
          ref="galleryTrigger"
          type="button"
          class="archive-milestone-case__more"
          aria-haspopup="dialog"
          :aria-expanded="galleryOpen"
          data-milestone-gallery-trigger
          @click="openGallery"
        >
          {{ t('archive.milestones.viewAll') }}
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 12 12 4M5 4h7v7" />
          </svg>
        </button>
      </header>
      <p :id="noteId" class="sr-only">{{ t('archive.milestones.catalogNote') }}</p>
      <ul class="archive-milestone-case__display" :aria-label="t('archive.milestones.preview')">
        <li
          v-for="badge in featuredMilestoneBadges"
          :key="badge.id"
          class="archive-milestone-case__slot"
        >
          <img
            :src="getBadgePreview(badge.id)"
            :alt="
              te(`archive.milestones.names.${badge.id}`)
                ? t(`archive.milestones.names.${badge.id}`)
                : badge.name
            "
            width="70"
            height="79"
            draggable="false"
          />
        </li>
      </ul>
    </div>
  </section>
  <ArchiveMilestoneGallery
    v-if="galleryOpen"
    :open="galleryOpen"
    :return-focus-to="galleryTrigger"
    @close="galleryOpen = false"
  />
</template>
