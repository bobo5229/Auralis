<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChineseScript } from '@renderer/features/appearance/utils/chineseText'
import { pointReference, startFloatingPosition } from '@renderer/shared/floating/floatingPosition'

type CloseReason = 'escape' | 'tab' | 'outside' | 'focusout' | 'scroll' | 'position-error'
type MenuItemKey = 'script' | 'edit'

const props = withDefaults(
  defineProps<{
    open: boolean
    anchor: { clientX: number; clientY: number }
    currentScript: ChineseScript
    id?: string
    showEditLyrics?: boolean
  }>(),
  { id: 'fullscreen-lyrics-context-menu', showEditLyrics: false },
)

const emit = defineEmits<{
  select: [script: ChineseScript]
  editLyrics: []
  close: [reason: CloseReason]
}>()

const { t } = useI18n()
const menuRef = ref<HTMLElement | null>(null)
const toggleRef = ref<HTMLButtonElement | null>(null)
const editRef = ref<HTMLButtonElement | null>(null)
const activeIndex = ref(0)

const items = computed<MenuItemKey[]>(() =>
  props.showEditLyrics ? ['script', 'edit'] : ['script'],
)

const targetScript = computed<ChineseScript>(() =>
  props.currentScript === 'simplified' ? 'traditional' : 'simplified',
)
let positionSession: ReturnType<typeof startFloatingPosition> | undefined
let tabCloseTimer: ReturnType<typeof setTimeout> | null = null
let closeRequested = false

function getItemElement(index: number): HTMLButtonElement | null {
  const key = items.value[index]
  if (key === 'script') return toggleRef.value
  if (key === 'edit') return editRef.value
  return null
}

function focusItem(index: number): void {
  if (items.value.length === 0) return
  const clamped = (index + items.value.length) % items.value.length
  activeIndex.value = clamped
  void nextTick(() => getItemElement(clamped)?.focus({ preventScroll: true }))
}

function focusCurrentItem(): void {
  focusItem(activeIndex.value)
}

function requestClose(reason: CloseReason): void {
  if (closeRequested) return
  closeRequested = true
  emit('close', reason)
}

function select(script: ChineseScript): void {
  emit('select', script)
}

function triggerEditLyrics(): void {
  emit('editLyrics')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    event.stopPropagation()
    focusItem(activeIndex.value + 1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopPropagation()
    focusItem(activeIndex.value - 1)
    return
  }
  if (event.key === 'Home') {
    event.preventDefault()
    event.stopPropagation()
    focusItem(0)
    return
  }
  if (event.key === 'End') {
    event.preventDefault()
    event.stopPropagation()
    focusItem(items.value.length - 1)
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    event.stopPropagation()
    const activeKey = items.value[activeIndex.value]
    if (activeKey === 'script') {
      select(targetScript.value)
    } else if (activeKey === 'edit') {
      triggerEditLyrics()
    }
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
    activeIndex.value = 0
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
      @mouseenter="activeIndex = 0"
    >
      <span class="i-lucide-languages" aria-hidden="true" />
      <span class="library-context-menu-text">{{
        t(`fullscreen.lyricsContextMenu.${targetScript}`)
      }}</span>
    </button>
    <template v-if="showEditLyrics">
      <div class="library-context-menu-separator" role="separator" />
      <button
        ref="editRef"
        type="button"
        class="library-context-menu-item"
        role="menuitem"
        tabindex="0"
        @click="triggerEditLyrics"
        @mouseenter="activeIndex = 1"
      >
        <span class="i-lucide-pencil" aria-hidden="true" />
        <span class="library-context-menu-text">{{
          t('fullscreen.lyricsContextMenu.editLyrics')
        }}</span>
      </button>
    </template>
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
