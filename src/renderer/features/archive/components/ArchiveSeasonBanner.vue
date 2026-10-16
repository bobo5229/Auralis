<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSeasonMesh } from '../composables/useSeasonMesh'
import { seasonBannerStyle } from '../utils/seasonArtwork'

defineProps<{ year: number }>()
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const snapshotCanvas = ref<HTMLCanvasElement | null>(null)
const { ready: meshReady, hasSnapshot } = useSeasonMesh(root, canvas, snapshotCanvas)
</script>

<template>
  <div
    ref="root"
    class="archive-season-banner"
    :class="{ 'has-season-mesh': meshReady, 'has-season-snapshot': hasSnapshot }"
    :style="seasonBannerStyle"
  >
    <div class="season-placeholder" aria-hidden="true">
      <canvas ref="snapshotCanvas" class="season-snapshot"></canvas>
    </div>
    <canvas ref="canvas" class="season-mesh" aria-hidden="true"></canvas>
    <RouterLink
      class="season-banner-link"
      :to="{ name: 'archive-annual-summary', params: { year: String(year) } }"
      :aria-label="t('archive.annualSummaryPageTitle', { year })"
    />
    <span class="annual-summary auralis-type-body" aria-hidden="true">
      {{ t('archive.annualSummary') }}
    </span>
  </div>
</template>

<style scoped>
.archive-season-banner {
  --season-wash: rgb(18 18 18 / 12%);
  --season-reveal-duration: 180ms;
  --season-content-inset: 20px;
  position: relative;
  isolation: isolate;
  container-type: inline-size;
  min-width: 0;
  overflow: hidden;
  border-radius: 10px;
}

.season-snapshot,
.season-mesh {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.season-placeholder {
  position: relative;
  height: clamp(140px, 18cqw, 180px);
  background: linear-gradient(var(--season-wash), var(--season-wash)), var(--season-banner-art);
  pointer-events: none;
}

.season-snapshot {
  visibility: hidden;
}

.has-season-snapshot .season-snapshot {
  visibility: visible;
}

.season-mesh {
  opacity: 0;
  transition: opacity var(--season-reveal-duration) ease-out;
}

.has-season-mesh .season-mesh {
  opacity: 1;
}

.has-season-mesh .season-placeholder {
  opacity: 0;
  transition: opacity 0s linear var(--season-reveal-duration);
}

.season-banner-link {
  position: absolute;
  z-index: 1;
  inset: 0;
  border-radius: inherit;
}

.season-banner-link:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: -3px;
}

.annual-summary {
  --season-text-half-leading: calc(
    (var(--auralis-type-body-line-height) - var(--auralis-type-body-size)) / 2
  );
  position: absolute;
  z-index: 2;
  right: var(--season-content-inset);
  bottom: calc(var(--season-content-inset) - var(--season-text-half-leading));
  color: var(--auralis-archive-summary-text);
  font-family: 'HarmonyOS Sans SC', var(--auralis-font-ui);
  font-weight: 500;
  pointer-events: none;
}

[data-theme='light'] .archive-season-banner {
  --season-wash: rgb(255 255 255 / 4%);
}

:where([data-reduced-motion='true']) .archive-season-banner {
  --season-reveal-duration: 0ms;
}

@media (prefers-reduced-motion: reduce) {
  .archive-season-banner {
    --season-reveal-duration: 0ms;
  }
}
</style>
