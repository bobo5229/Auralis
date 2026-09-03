<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlayerSurfacePresentation } from '@renderer/app/utils/playerSurfacePresentation'

const props = defineProps<{
  isLocked: boolean
  presentation: PlayerSurfacePresentation
}>()

const emit = defineEmits<{
  change: [locked: boolean]
  close: []
}>()

const { t } = useI18n()
const element = ref<HTMLElement | null>(null)
const lockBtnRef = ref<HTMLButtonElement | null>(null)
const unlockBtnRef = ref<HTMLButtonElement | null>(null)

defineExpose({ element })

function selectLocked(locked: boolean): void {
  emit('change', locked)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    selectLocked(true)
    lockBtnRef.value?.focus()
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    selectLocked(false)
    unlockBtnRef.value?.focus()
  }
}

watch(
  () => props.isLocked,
  (locked) => {
    nextTick(() => {
      if (locked) {
        lockBtnRef.value?.focus()
      } else {
        unlockBtnRef.value?.focus()
      }
    })
  },
)

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  nextTick(() => {
    if (props.isLocked) {
      lockBtnRef.value?.focus()
    } else {
      unlockBtnRef.value?.focus()
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    ref="element"
    class="player-overlay desktop-lyrics-lock-popover"
    :data-player-presentation="props.presentation"
    role="dialog"
    tabindex="-1"
    :aria-label="t('player.desktopLyrics.lockPopoverTitle')"
  >
    <div
      class="desktop-lyrics-lock-switch"
      role="radiogroup"
      :aria-label="t('player.desktopLyrics.lockPopoverTitle')"
    >
      <div
        class="desktop-lyrics-lock-pill"
        aria-hidden="true"
        :style="{ transform: props.isLocked ? 'translateX(0%)' : 'translateX(100%)' }"
      />

      <button
        ref="lockBtnRef"
        type="button"
        role="radio"
        class="desktop-lyrics-lock-option"
        :class="{ 'desktop-lyrics-lock-option--active': props.isLocked }"
        :aria-checked="props.isLocked"
        :aria-label="t('player.desktopLyrics.lockedLabel')"
        :title="t('player.desktopLyrics.lockedLabel')"
        @click="selectLocked(true)"
      >
        <span class="h-4 w-4 i-lucide-lock" />
      </button>

      <button
        ref="unlockBtnRef"
        type="button"
        role="radio"
        class="desktop-lyrics-lock-option"
        :class="{ 'desktop-lyrics-lock-option--active': !props.isLocked }"
        :aria-checked="!props.isLocked"
        :aria-label="t('player.desktopLyrics.unlockedLabel')"
        :title="t('player.desktopLyrics.unlockedLabel')"
        @click="selectLocked(false)"
      >
        <span class="h-4 w-4 i-lucide-lock-open" />
      </button>
    </div>
  </div>
</template>
