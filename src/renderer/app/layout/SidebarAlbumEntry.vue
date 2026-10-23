<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { pointReference, startFloatingPosition } from '@renderer/shared/floating/floatingPosition'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'
import SidebarIcon from './SidebarIcon.vue'

const props = defineProps<{ rail: boolean; active: boolean; count: number; blocked: boolean }>()
const emit = defineEmits<{
  intent: []
  navigatePointer: [event: PointerEvent]
  navigateEnter: []
  menuOpenChange: [open: boolean]
}>()
const { t } = useI18n()
const route = useRoute()
const menuAnchor = ref<{ x: number; y: number } | null>(null)
const menuPanel = ref<HTMLElement | null>(null)
const positioned = ref(false)
let position: ReturnType<typeof startFloatingPosition> | undefined
let trigger: HTMLElement | null = null
let returnFocus = false

function closeMenu(restore = false): void {
  returnFocus = restore
  position?.dispose()
  position = undefined
  menuAnchor.value = null
  positioned.value = false
}

function openMenu(event: MouseEvent | KeyboardEvent): void {
  if (!props.rail || props.blocked) return
  event.preventDefault()
  event.stopPropagation()
  closeMenu()
  trigger = event.currentTarget as HTMLElement
  const rect = trigger.getBoundingClientRect()
  menuAnchor.value =
    event instanceof MouseEvent && (event.clientX !== 0 || event.clientY !== 0)
      ? { x: event.clientX, y: event.clientY }
      : { x: rect.right, y: rect.top + rect.height / 2 }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) openMenu(event)
  else if (event.key === 'Enter') emit('navigateEnter')
}

watch(menuAnchor, async (anchor) => {
  emit('menuOpenChange', anchor !== null)
  if (!anchor) return
  await nextTick()
  if (menuAnchor.value !== anchor || !menuPanel.value) return
  position = startFloatingPosition({
    reference: pointReference(anchor.x, anchor.y),
    floating: menuPanel.value,
    profile: 'point-menu',
    onPosition: () => {
      positioned.value = true
    },
    onError: () => closeMenu(true),
  })
})

useOverlayFocusTrap({
  isOpen: () => menuAnchor.value !== null && positioned.value,
  container: menuPanel,
  onEscape: () => closeMenu(true),
  restoreFocus: () => {
    if (returnFocus && trigger?.isConnected) trigger.focus({ preventScroll: true })
  },
})

watch([() => props.rail, () => props.blocked, () => route.fullPath], () => closeMenu(), {
  flush: 'sync',
})
onMounted(() => {
  window.addEventListener('resize', onDismiss)
  window.addEventListener('blur', onDismiss)
})
function onDismiss(): void {
  closeMenu()
}
onBeforeUnmount(() => {
  closeMenu()
  emit('menuOpenChange', false)
  window.removeEventListener('resize', onDismiss)
  window.removeEventListener('blur', onDismiss)
})
</script>

<template>
  <div class="sidebar-album-entry" :class="{ 'is-rail': rail, 'is-active': active }">
    <RouterLink
      v-tooltip.right="rail ? t('nav.albums') : ''"
      to="/albums"
      class="sidebar-link sidebar-link-with-count"
      :class="{ 'sidebar-link-active': active }"
      :draggable="false"
      :aria-label="t('nav.albums')"
      :aria-haspopup="rail ? 'menu' : undefined"
      :aria-expanded="rail ? menuAnchor !== null : undefined"
      :aria-controls="menuAnchor ? 'sidebar-album-menu' : undefined"
      @dragstart.prevent
      @pointerenter="emit('intent')"
      @focusin="emit('intent')"
      @pointerdown="emit('navigatePointer', $event)"
      @keydown="onKeyDown"
      @contextmenu="openMenu"
    >
      <span class="sidebar-link-icon"><SidebarIcon kind="albums" /></span>
      <span class="sidebar-link-label">{{ t('nav.albums') }}</span>
      <span class="sidebar-link-count">{{ count }}</span>
    </RouterLink>
    <RouterLink
      v-if="!rail"
      v-tooltip.right="t('sidebar.enterCdRoom')"
      to="/albums/cd"
      class="sidebar-cd-shortcut"
      :draggable="false"
      :aria-label="t('sidebar.enterCdRoom')"
      @dragstart.prevent
    >
      <SidebarIcon kind="cd" />
    </RouterLink>
    <Teleport to="body">
      <div
        v-if="menuAnchor"
        class="sidebar-overlay fixed inset-0 z-[88]"
        @pointerdown.self="closeMenu(true)"
        @contextmenu.self.prevent="closeMenu(true)"
      >
        <div
          id="sidebar-album-menu"
          ref="menuPanel"
          class="sidebar-album-context-menu library-context-menu frosted-context-menu fixed w-48"
          role="menu"
          :aria-label="t('nav.albums')"
          @keydown.up.prevent.stop
          @keydown.down.prevent.stop
          @keydown.home.prevent.stop
          @keydown.end.prevent.stop
        >
          <RouterLink
            to="/albums/cd"
            class="library-context-menu-item"
            role="menuitem"
            @click="closeMenu()"
          >
            <SidebarIcon kind="cd" />
            <span>{{ t('sidebar.enterCdRoom') }}</span>
          </RouterLink>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sidebar-album-entry {
  position: relative;
}

.sidebar-album-entry:not(.is-rail) > .sidebar-link {
  padding-right: 52px;
}

.sidebar-cd-shortcut {
  position: absolute;
  top: 50%;
  right: 18px;
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  transform: translateY(-50%);
  border-radius: 7px;
  color: var(--auralis-text-muted);
  text-decoration: none;
  -webkit-app-region: no-drag;
}

.sidebar-cd-shortcut :deep(.sidebar-symbol) {
  width: 18px;
  height: 18px;
}

.is-active > .sidebar-cd-shortcut {
  color: var(--auralis-control-primary-text);
}

.sidebar-cd-shortcut:hover {
  background: color-mix(in srgb, currentColor 12%, transparent);
  color: var(--auralis-text);
}

.is-active > .sidebar-cd-shortcut:hover {
  color: var(--auralis-control-primary-text);
}

.sidebar-cd-shortcut:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 1px;
}

.sidebar-album-context-menu .library-context-menu-item {
  text-decoration: none;
}
</style>
