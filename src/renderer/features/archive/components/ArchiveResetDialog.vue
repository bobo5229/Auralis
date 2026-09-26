<script setup lang="ts">
import { auralis } from '@renderer/shared/ipc/client'
import { useArchiveReset } from '../composables/useArchiveReset'

const props = defineProps<{ afterReset: () => Promise<void> }>()
const {
  showResetConfirmation,
  isResetting,
  isHoldingReset,
  resetError,
  openResetConfirmation,
  closeResetConfirmation,
  startResetHold,
  cancelResetHold,
  handleResetKeyDown,
  handleResetKeyUp,
} = useArchiveReset(
  async () => {
    await auralis.archive.resetPlayStats()
  },
  () => props.afterReset(),
)
defineExpose({ open: openResetConfirmation })
</script>

<template>
  <div
    v-if="showResetConfirmation"
    class="archive-reset-backdrop"
    @click.self="closeResetConfirmation"
  >
    <section
      class="archive-reset-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="archive-reset-title"
      aria-describedby="archive-reset-description"
    >
      <h2 id="archive-reset-title">确认重置播放数据？</h2>
      <p id="archive-reset-description">
        此操作会永久删除所有累计播放次数、每日分钟数、音乐日历和 Top
        10，且无法恢复。音乐文件、标签、封面和歌词不会受到影响。
      </p>
      <p v-if="resetError" class="archive-reset-error">{{ resetError }}</p>
      <div class="archive-reset-buttons">
        <button type="button" :disabled="isResetting" @click="closeResetConfirmation">取消</button>
        <div class="archive-reset-confirm-wrap">
          <button
            v-tooltip="isResetting ? undefined : '按住 3 秒重置'"
            type="button"
            class="archive-reset-confirm"
            :class="{ 'is-holding': isHoldingReset }"
            :disabled="isResetting"
            @pointerdown.prevent="startResetHold"
            @pointerup="cancelResetHold"
            @pointerleave="cancelResetHold"
            @pointercancel="cancelResetHold"
            @keydown="handleResetKeyDown"
            @keyup="handleResetKeyUp"
            @blur="cancelResetHold"
            @click.prevent
            @contextmenu.prevent
          >
            <span>{{ isResetting ? '重置中…' : '重置' }}</span>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped src="../styles/archive.reset.css"></style>
