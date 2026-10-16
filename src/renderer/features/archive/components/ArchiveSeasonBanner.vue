<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSeasonMesh } from '../composables/useSeasonMesh'
import { seasonArtworks, seasonBannerStyle } from '../utils/seasonArtwork'

defineProps<{ year: number }>()
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const meshReady = useSeasonMesh(root, canvas)
</script>

<template>
  <div
    ref="root"
    class="archive-season-banner"
    :class="{ 'has-season-mesh': meshReady }"
    :style="seasonBannerStyle"
  >
    <canvas ref="canvas" class="season-mesh" aria-hidden="true"></canvas>
    <RouterLink
      class="season-banner-link"
      :to="{ name: 'archive-annual-summary', params: { year: String(year) } }"
      :aria-label="t('archive.annualSummaryPageTitle', { year })"
    />
    <div class="season-caption" aria-hidden="true">
      <span
        v-for="season in seasonArtworks"
        :key="season.id"
        class="season-character auralis-type-control"
        :style="{ color: season.ink }"
      >
        {{ season.character }}
      </span>
    </div>
    <span class="annual-summary auralis-type-control" aria-hidden="true">
      {{ t('archive.annualSummary') }}
    </span>
  </div>
</template>

<style scoped>
.archive-season-banner {
  --season-wash: rgb(18 18 18 / 12%);
  --season-content-inset: 20px;
  --season-text-half-leading: calc(
    (var(--auralis-type-control-line-height) - var(--auralis-type-control-size)) / 2
  );
  position: relative;
  isolation: isolate;
  container-type: inline-size;
  min-width: 0;
  overflow: hidden;
  border-radius: 10px;
  background: linear-gradient(var(--season-wash), var(--season-wash)), var(--season-banner-art);
}

.season-mesh {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  visibility: hidden;
  pointer-events: none;
}

.has-season-mesh .season-mesh {
  visibility: visible;
}

.has-season-mesh {
  background: transparent;
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

.season-caption {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  box-sizing: border-box;
  height: clamp(140px, 18cqw, 180px);
  /* Match the opposite caption's inset after accounting for line-box leading. */
  padding: calc(var(--season-content-inset) - var(--season-text-half-leading))
    var(--season-content-inset);
  pointer-events: none;
}

.season-character {
  position: relative;
  /* The season glyphs are artwork lettering, distinct from ordinary UI text. */
  font-family: 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-weight: 400;
}

.annual-summary {
  position: absolute;
  z-index: 2;
  right: var(--season-content-inset);
  bottom: calc(var(--season-content-inset) - var(--season-text-half-leading));
  color: var(--auralis-text-on-artwork);
  font-family: 'HarmonyOS Sans SC', var(--auralis-font-ui);
  font-weight: 500;
  pointer-events: none;
}

[data-theme='light'] .archive-season-banner {
  --season-wash: rgb(255 255 255 / 4%);
}
</style>
