<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { pointReference, startFloatingPosition } from '@renderer/shared/floating/floatingPosition'

const props = defineProps<{
  open: boolean
  clientX: number
  clientY: number
  openReason: 'pointer' | 'keyboard'
  returnFocusElement: HTMLElement | null
}>()

const emit = defineEmits<{
  close: []
  restoreDefaults: []
}>()

const { t } = useI18n()
const menuRef = ref<HTMLElement | null>(null)
const resetButtonRef = ref<HTMLButtonElement | null>(null)
let positionSession: ReturnType<typeof startFloatingPosition> | undefined

watch(
  [menuRef, () => props.open, () => props.clientX, () => props.clientY],
  (_values, _previous, onCleanup) => {
    if (!props.open || !menuRef.value) return
    const session = startFloatingPosition({
      reference: pointReference(props.clientX, props.clientY),
      floating: menuRef.value,
      profile: 'point-menu',
      onError: () => emit('close'),
      onPosition: (_result, first) => {
        if (first) resetButtonRef.value?.focus()
      },
    })
    positionSession = session
    onCleanup(() => {
      session.dispose()
      if (positionSession === session) positionSession = undefined
    })
  },
  { flush: 'post' },
)

function close(): void {
  const openReason = props.openReason
  const returnFocusElement = props.returnFocusElement
  emit('close')
  if (openReason === 'keyboard') {
    void nextTick(() => {
      if (returnFocusElement?.isConnected) returnFocusElement.focus()
    })
  }
}

function onBackdropClick(): void {
  close()
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    close()
  } else if (event.key === 'Enter' || event.key === ' ') {
    if (document.activeElement === resetButtonRef.value) {
      event.preventDefault()
      emit('restoreDefaults')
      close()
    }
  }
}

function restoreDefaults(): void {
  emit('restoreDefaults')
  close()
}

onBeforeUnmount(() => positionSession?.dispose())
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="library-overlay" data-library-overlay="flat-column-menu">
      <div class="fixed inset-0 z-[60]" @click="onBackdropClick" @keydown="onKeyDown">
        <div
          ref="menuRef"
          class="library-context-menu-root library-context-menu-main-panel library-context-menu-panel frosted-context-menu fixed z-[61] w-58 p-1 select-none"
          style="visibility: hidden; overflow: auto"
          role="menu"
          :aria-label="t('library.columns.menuLabel')"
          @click.stop
        >
          <button
            ref="resetButtonRef"
            type="button"
            class="library-context-menu-item"
            role="menuitem"
            data-flat-column-reset
            tabindex="0"
            @click="restoreDefaults"
          >
            <span class="i-lucide-rotate-ccw"></span>
            <span class="library-context-menu-text truncate">
              {{ t('library.columns.restoreDefaults') }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
