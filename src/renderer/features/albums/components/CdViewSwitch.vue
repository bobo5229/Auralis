<script setup lang="ts">
import '../styles/cdTypography.css'
import { nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  beginCdViewSwitchTransition,
  clearCdViewSwitchTransition,
  type CdViewSwitchTarget,
} from '../utils/cdViewSwitchTransition'

const props = defineProps<{ current: CdViewSwitchTarget }>()

const { t } = useI18n()
const router = useRouter()

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
  <div class="cd-view-switch" role="group" :aria-label="t('albums.cd.view.label')">
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

.cd-view-switch button[aria-pressed='true']::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 5px;
  height: 1px;
  border-radius: 999px;
  background: var(--cd-text);
  pointer-events: none;
}
</style>
