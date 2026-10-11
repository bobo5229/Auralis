<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChineseScript } from '@renderer/features/appearance/utils/chineseText'
import { pointReference, startFloatingPosition } from '@renderer/shared/floating/floatingPosition'

type CloseReason = 'escape' | 'tab' | 'outside' | 'focusout' | 'scroll' | 'position-error'

const props = withDefaults(
  defineProps<{
    open: boolean
    anchor: { clientX: number; clientY: number }
    currentScript: ChineseScript
    id?: string
  }>(),
  { id: 'fullscreen-lyrics-context-menu' },
)

const emit = defineEmits<{
  select: [script: ChineseScript]
  close: [reason: CloseReason]
}>()

const { t } = useI18n()
const menuRef = ref<HTMLElement | null>(null)
const toggleRef = ref<HTMLButtonElement | null>(null)
const targetScript = computed<ChineseScript>(() =>
  props.currentScript === 'simplified' ? 'traditional' : 'simplified',
)
let positionSession: ReturnType<typeof startFloatingPosition> | undefined
let tabCloseTimer: ReturnType<typeof setTimeout> | null = null
let closeRequested = false

function focusCurrentItem(): void {
  void nextTick(() => toggleRef.value?.focus({ preventScroll: true }))
}

function requestClose(reason: CloseReason): void {
  if (closeRequested) return
  closeRequested = true
  emit('close', reason)
}

function select(script: ChineseScript): void {
  emit('select', script)
}

function onKeydown(event: KeyboardEvent): void {
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    event.stopPropagation()
    focusCurrentItem()
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    event.stopPropagation()
    select(targetScript.value)
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    requestClose('escape')
    return
  }
  if (event.key === 'Tab') {
    if (tabCloseTimer) clearTimeout(tabCloseTimer)
    tabCloseTimer = setTimeout(() => {
      tabCloseTimer = null
      const menu = menuRef.value
      if (
        menu &&
        document.activeElement instanceof Node &&
        !menu.contains(document.activeElement)
      ) {
        requestClose('tab')
      }
    }, 0)
  }
}

function onFocusout(event: FocusEvent): void {
  const menu = menuRef.value
  if (event.relatedTarget instanceof Node && menu?.contains(event.relatedTarget)) return
  requestClose('focusout')
}

watch(
  () => [props.open, props.anchor.clientX, props.anchor.clientY],
  ([open], _previous, onCleanup) => {
    if (!open || !menuRef.value) return
    const session = startFloatingPosition({
      reference: pointReference(props.anchor.clientX, props.anchor.clientY),
      floating: menuRef.value,
      profile: 'point-menu',
      onPosition: (_result, first) => {
        if (first) focusCurrentItem()
      },
      onError: () => requestClose('position-error'),
    })
    positionSession = session
    onCleanup(() => {
      session.dispose()
      if (positionSession === session) positionSession = undefined
    })
  },
  { flush: 'post' },
)

watch(
  () => props.open,
  (open, _previous, onCleanup) => {
    closeRequested = false
    if (!open) {
      if (tabCloseTimer) clearTimeout(tabCloseTimer)
      tabCloseTimer = null
      return
    }
    const dismissOutside = (event: Event): void => {
      const menu = menuRef.value
      if (event.target instanceof Node && menu?.contains(event.target)) return
      requestClose('outside')
    }
    const dismissForScroll = (event: Event): void => {
      const menu = menuRef.value
      if (event.target instanceof Node && menu?.contains(event.target)) return
      requestClose('scroll')
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    document.addEventListener('wheel', dismissForScroll, true)
    document.addEventListener('touchmove', dismissForScroll, true)
    onCleanup(() => {
      document.removeEventListener('pointerdown', dismissOutside, true)
      document.removeEventListener('wheel', dismissForScroll, true)
      document.removeEventListener('touchmove', dismissForScroll, true)
    })
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  positionSession?.dispose()
  if (tabCloseTimer) clearTimeout(tabCloseTimer)
})
</script>

<template>
  <div
    v-if="open"
    :id="id"
    ref="menuRef"
    class="fullscreen-lyrics-context-menu library-context-menu frosted-context-menu"
    role="menu"
    :aria-label="t('fullscreen.lyricsContextMenu.label')"
    style="visibility: hidden"
    @keydown="onKeydown"
    @focusout="onFocusout"
  >
    <button
      ref="toggleRef"
      type="button"
      class="library-context-menu-item"
      role="menuitem"
      tabindex="0"
      @click="select(targetScript)"
    >
      <span class="i-lucide-languages" aria-hidden="true" />
      <span class="library-context-menu-text">{{
        t(`fullscreen.lyricsContextMenu.${targetScript}`)
      }}</span>
    </button>
  </div>
</template>

<style scoped>
.fullscreen-lyrics-context-menu {
  --auralis-text: var(--auralis-fullscreen-controls-text);
  --auralis-text-muted: var(--auralis-fullscreen-controls-muted);

  position: fixed;
  z-index: 140;
  box-sizing: border-box;
  display: grid;
  width: max-content;
  min-width: 184px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  overflow: auto;
  -webkit-app-region: no-drag;
  user-select: none;
}
</style>
