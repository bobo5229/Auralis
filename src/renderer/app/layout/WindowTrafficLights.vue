<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { IpcRequest } from '@shared/ipc/contracts'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

defineProps<{ cdCanvas?: boolean }>()

const { t } = useI18n()
const isMaximized = ref(false)
let unsubscribe: (() => void) | null = null
let mounted = false
let stateEventReceived = false

onMounted(() => {
  mounted = true
  unsubscribe = auralis.window.onMaximizedChanged((state) => {
    stateEventReceived = true
    isMaximized.value = state.isMaximized
  })
  void auralis.window.getMaximized().then(
    (state) => {
      if (mounted && !stateEventReceived) isMaximized.value = state.isMaximized
    },
    () => {
      rendererDiagnostics.error({
        scope: 'window.controls',
        message: 'Failed to read main window state',
      })
    },
  )
})

onBeforeUnmount(() => {
  mounted = false
  unsubscribe?.()
  unsubscribe = null
})

async function control(action: IpcRequest<'window:control'>['action']): Promise<void> {
  try {
    const state = await auralis.window.control(action)
    if (mounted) isMaximized.value = state.isMaximized
  } catch {
    rendererDiagnostics.error({
      scope: 'window.controls',
      message: `Failed to ${action} main window`,
    })
  }
}
</script>

<template>
  <div class="window-traffic-lights" :class="{ 'window-traffic-lights--cd': cdCanvas }">
    <button
      class="window-traffic-light window-traffic-light--close"
      type="button"
      :aria-label="t('windowControls.close')"
      @click="control('close')"
    >
      <span class="i-lucide-x" aria-hidden="true"></span>
    </button>
    <button
      class="window-traffic-light window-traffic-light--minimize"
      type="button"
      :aria-label="t('windowControls.minimize')"
      @click="control('minimize')"
    >
      <span class="i-lucide-minus" aria-hidden="true"></span>
    </button>
    <button
      class="window-traffic-light window-traffic-light--maximize"
      type="button"
      :aria-label="t(isMaximized ? 'windowControls.restore' : 'windowControls.maximize')"
      @click="control('toggle-maximize')"
    >
      <span
        :class="isMaximized ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
        aria-hidden="true"
      ></span>
    </button>
  </div>
</template>

<style scoped>
.window-traffic-lights {
  position: absolute;
  z-index: 30;
  top: 20px;
  left: 24px;
  display: flex;
  align-items: center;
  gap: 1px;
  -webkit-app-region: no-drag;
}

.window-traffic-lights--cd {
  top: 12px;
  right: 17px;
  left: auto;
}

.window-traffic-light {
  position: relative;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.window-traffic-light::before {
  position: absolute;
  width: 13px;
  height: 13px;
  border: 1px solid rgb(0 0 0 / 0.16);
  border-radius: 50%;
  box-shadow: inset 0 1px 1px rgb(255 255 255 / 0.24);
  content: '';
}

.window-traffic-light--close::before {
  background: #ff6059;
}

.window-traffic-light--minimize::before {
  background: #ffbd2e;
}

.window-traffic-light--maximize::before {
  background: #28c840;
}

.window-traffic-lights--cd .window-traffic-light--close::before {
  background: #b97976;
}

.window-traffic-lights--cd .window-traffic-light--minimize::before {
  background: #b6a073;
}

.window-traffic-lights--cd .window-traffic-light--maximize::before {
  background: #77a08a;
}

.window-traffic-light > span {
  z-index: 1;
  width: 9px;
  height: 9px;
  color: rgb(21 23 26 / 0.72);
  opacity: 0;
}

.window-traffic-lights:hover .window-traffic-light > span,
.window-traffic-light:focus-visible > span {
  opacity: 1;
}

.window-traffic-light:hover::before {
  filter: brightness(1.12);
}

.window-traffic-light:active::before {
  filter: brightness(0.83);
}

.window-traffic-light:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: -1px;
}
</style>
