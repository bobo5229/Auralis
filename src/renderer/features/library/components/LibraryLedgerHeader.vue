<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div
    class="library-ledger-header select-none border-b border-[var(--manuscript-border-ledger)] py-2 text-xs text-[var(--manuscript-content-ledger-label)]"
  >
    <div
      class="ledger-header-cell ledger-header-index text-center tabular-nums font-[var(--manuscript-font-numeric)]"
    >
      {{ t('library.manuscript.ledger.index') }}
    </div>
    <div
      class="ledger-header-cell ledger-header-artwork text-center font-[var(--manuscript-font-ui)]"
    >
      {{ t('library.manuscript.ledger.artwork') }}
    </div>
    <div class="ledger-header-cell ledger-header-title pl-1.5 font-[var(--manuscript-font-body)]">
      {{ t('library.manuscript.ledger.title') }}
    </div>
    <div class="ledger-header-cell ledger-header-artist pl-2 font-[var(--manuscript-font-body)]">
      {{ t('library.manuscript.ledger.artist') }}
    </div>
    <div
      class="ledger-header-cell ledger-header-album text-right font-[var(--manuscript-font-body)]"
    >
      {{ t('library.manuscript.ledger.album') }}
    </div>
    <div
      class="ledger-header-cell ledger-header-duration text-right tabular-nums font-[var(--manuscript-font-numeric)]"
    >
      {{ t('library.manuscript.ledger.duration') }}
    </div>
  </div>
</template>

<style scoped>
.library-ledger-header {
  display: grid;
  grid-template-columns: var(
    --library-manuscript-flat-grid,
    40px 44px minmax(0, 1.3fr) minmax(110px, 0.75fr) minmax(120px, 0.9fr) 56px
  );
  align-items: center;
  gap: 0.625rem;
  padding-inline: 1rem;
  font-size: 11px;
  letter-spacing: 0.04em;
  pointer-events: none;
}
</style>
