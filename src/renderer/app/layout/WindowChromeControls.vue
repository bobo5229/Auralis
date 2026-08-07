<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { auralis } from '@renderer/shared/ipc/client'

const { t } = useI18n()

const isMaximized = ref(false)

onMounted(async () => {
  try {
    const { maximized } = await auralis.window.isMaximized()
    isMaximized.value = maximized
  } catch {
    // 忽略：无框窗口启动瞬间查询失败时保持默认态
  }
})

function minimize(): void {
  void auralis.window.minimize()
}

function toggleMaximize(): void {
  void auralis.window.toggleMaximize().then(({ ok }) => {
    if (ok) isMaximized.value = !isMaximized.value
  })
}

function close(): void {
  void auralis.window.close()
}
</script>

<template>
  <div class="window-chrome-controls" role="toolbar" :aria-label="t('windowChrome.toolbarAria')">
    <button
      class="window-chrome-button"
      type="button"
      :aria-label="t('windowChrome.minimize')"
      :title="t('windowChrome.minimize')"
      @click="minimize"
    >
      <span class="i-lucide-minus"></span>
    </button>
    <button
      class="window-chrome-button"
      type="button"
      :aria-label="isMaximized ? t('windowChrome.restore') : t('windowChrome.maximize')"
      :title="isMaximized ? t('windowChrome.restore') : t('windowChrome.maximize')"
      @click="toggleMaximize"
    >
      <span :class="isMaximized ? 'i-lucide-copy' : 'i-lucide-square'"></span>
    </button>
    <button
      class="window-chrome-button window-chrome-button-close"
      type="button"
      :aria-label="t('windowChrome.close')"
      :title="t('windowChrome.close')"
      @click="close"
    >
      <span class="i-lucide-x"></span>
    </button>
  </div>
</template>
