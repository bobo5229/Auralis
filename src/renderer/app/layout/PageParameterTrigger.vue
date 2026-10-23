<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePageParameters } from '@renderer/features/appearance/composables/usePageParameters'
import SidebarIcon from './SidebarIcon.vue'

const controller = usePageParameters()
const { t } = useI18n()
const available = computed(() => Boolean(controller?.supported.value && controller.context.value))
</script>

<template>
  <button
    v-tooltip.fast="t('pageParameters.open')"
    type="button"
    class="page-parameter-trigger"
    :class="{ 'page-parameter-trigger--active': controller?.open.value }"
    :disabled="!available"
    :aria-label="t('pageParameters.open')"
    aria-haspopup="dialog"
    :aria-expanded="controller?.open.value ?? false"
    aria-controls="page-parameter-panel"
    data-page-parameters-trigger
    @click="controller?.toggle($event.currentTarget as HTMLElement)"
  >
    <SidebarIcon kind="parameters" />
  </button>
</template>
