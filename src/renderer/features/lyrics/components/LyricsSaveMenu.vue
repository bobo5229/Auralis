<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { SaveLrcEditor } from '@shared/types/lyricsEditor'
import { startFloatingPosition } from '@renderer/shared/floating/floatingPosition'
import { resolveMenuNavigationIndex } from '@renderer/shared/menu/menuKeyboardNavigation'

export interface LyricsSaveAction {
  target: SaveLrcEditor['target']
  label: string
  disabled: boolean
  icon: string
}
const props = defineProps<{
  open: boolean
  anchor: HTMLElement | null
  label: string
  actions: readonly LyricsSaveAction[]
}>()
const emit = defineEmits<{
  select: [target: SaveLrcEditor['target']]
  close: [reason: 'escape' | 'tab' | 'outside' | 'unavailable']
  surfaceChange: [visible: boolean]
}>()
const menu = ref<HTMLElement | null>(null)
const activeIndex = ref(0)
const enabled = computed(() =>
  props.actions.flatMap((item, index) => (item.disabled ? [] : [index])),
)
let positioning: ReturnType<typeof startFloatingPosition> | undefined
let generation = 0
let positioned = false
let pendingEnter: (() => void) | undefined
let animations: Animation[] = []
let buttonWidth = 0
let buttonHeight = 0
let buttonBackground = ''

function focusItem(index: number): void {
  activeIndex.value = index
  menu.value
    ?.querySelector<HTMLButtonElement>(`[data-index="${index}"]`)
    ?.focus({ preventScroll: true })
}
function select(index: number): void {
  const item = props.actions[index]
  if (item && !item.disabled) emit('select', item.target)
}
function keydown(event: KeyboardEvent): void {
  const next = resolveMenuNavigationIndex(event.key, activeIndex.value, enabled.value)
  if (next !== null) {
    event.preventDefault()
    event.stopPropagation()
    focusItem(next)
  } else if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    emit('close', event.key === 'Escape' ? 'escape' : 'tab')
  } else if (
    (event.key === 'Enter' || event.key === ' ') &&
    event.target instanceof HTMLElement &&
    event.target.closest('[data-index]')
  ) {
    event.preventDefault()
    event.stopPropagation()
    select(activeIndex.value)
  }
}
function outside(event: PointerEvent): void {
  if (
    event.target instanceof Node &&
    !menu.value?.contains(event.target) &&
    !props.anchor?.contains(event.target)
  )
    emit('close', 'outside')
}
function focusout(event: FocusEvent): void {
  if (
    event.relatedTarget instanceof Node &&
    !menu.value?.contains(event.relatedTarget) &&
    !props.anchor?.contains(event.relatedTarget)
  )
    emit('close', 'outside')
}
function windowBlur(): void {
  emit('close', 'outside')
}
function beforeEnter(element: Element): void {
  const target = element as HTMLElement
  const anchor = props.anchor
  if (anchor) {
    const rect = anchor.getBoundingClientRect()
    const style = getComputedStyle(anchor)
    buttonWidth = rect.width
    buttonHeight = rect.height
    buttonBackground = style.backgroundColor
  }
  target.inert = false
  target.removeAttribute('aria-hidden')
}
function beforeLeave(element: Element): void {
  cancelMotion()
  const target = element as HTMLElement
  target.inert = true
  target.setAttribute('aria-hidden', 'true')
}
function cancelMotion(): void {
  pendingEnter = undefined
  for (const animation of animations) animation.cancel()
  animations = []
}
function transition(element: HTMLElement, opening: boolean, done: () => void): void {
  cancelMotion()
  const finish = (): void => {
    cancelMotion()
    done()
    if (opening && props.open && enabled.value.length) focusItem(enabled.value[0])
  }
  if (
    document.documentElement.dataset.reducedMotion === 'true' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    finish()
    return
  }
  const style = getComputedStyle(element)
  const bounds = element.getBoundingClientRect()
  const anchor = props.anchor?.getBoundingClientRect()
  // Viewport collision handling can move the menu above the button's top edge.
  // Keep the collapsed surface at the button's actual position inside the menu.
  const left = Math.max(
    0,
    Math.min(element.offsetWidth - buttonWidth, anchor ? anchor.left - bounds.left : 0),
  )
  const top = Math.max(
    0,
    Math.min(element.offsetHeight - buttonHeight, anchor ? anchor.top - bounds.top : 0),
  )
  const closed = {
    clipPath: `inset(${top}px ${Math.max(0, element.offsetWidth - left - buttonWidth)}px ${Math.max(0, element.offsetHeight - top - buttonHeight)}px ${left}px round 6px)`,
    backgroundColor: buttonBackground,
    borderRadius: '6px',
  }
  const expanded = {
    clipPath: `inset(0px 0px 0px 0px round ${style.borderTopRightRadius})`,
    backgroundColor: style.backgroundColor,
    borderRadius: style.borderRadius,
  }
  const options: KeyframeAnimationOptions = {
    duration: opening ? 180 : 140,
    easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    fill: 'both',
  }
  const surface = element.animate(opening ? [closed, expanded] : [expanded, closed], options)
  animations.push(surface)
  const actions = element.querySelector<HTMLElement>('.lyrics-save-actions')
  if (actions) {
    const frames = opening
      ? [{ opacity: 0 }, { opacity: 0, offset: 0.25 }, { opacity: 1 }]
      : [{ opacity: 1 }, { opacity: 0, offset: 0.65 }, { opacity: 0 }]
    animations.push(actions.animate(frames, options))
  }
  void surface.finished.then(finish, () => {})
}
function enter(element: Element, done: () => void): void {
  pendingEnter = () => {
    pendingEnter = undefined
    emit('surfaceChange', true)
    transition(element as HTMLElement, true, done)
  }
  if (positioned) pendingEnter()
}
function leave(element: Element, done: () => void): void {
  transition(element as HTMLElement, false, done)
}
function afterLeave(): void {
  emit('surfaceChange', false)
}
function cleanup(): void {
  generation++
  positioning?.dispose()
  positioning = undefined
  positioned = false
  document.removeEventListener('pointerdown', outside, true)
  window.removeEventListener('blur', windowBlur)
}
watch(
  () => [props.open, props.anchor] as const,
  async ([open, anchor]) => {
    cleanup()
    if (!open || !anchor) return
    const token = generation
    await nextTick()
    if (token !== generation || !menu.value) return
    if (!enabled.value.length) {
      emit('close', 'unavailable')
      return
    }
    activeIndex.value = enabled.value[0]
    positioning = startFloatingPosition({
      reference: {
        contextElement: anchor,
        getBoundingClientRect: () => {
          const rect = anchor.getBoundingClientRect()
          // A zero-height reference puts the surface's top at the button's top.
          return new DOMRect(rect.x, rect.y, rect.width, 0)
        },
      },
      floating: menu.value,
      profile: 'popover',
      placement: 'bottom-end',
      fallbackPlacements: [],
      shiftCrossAxis: true,
      gap: 0,
      onPosition: (_result, first) => {
        if (first && props.open && token === generation) {
          positioned = true
          pendingEnter?.()
        }
      },
      onError: () => emit('close', 'unavailable'),
    })
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('blur', windowBlur)
  },
  { immediate: true, flush: 'post' },
)
watch(enabled, (indices) => {
  if (!props.open) return
  if (!indices.length) emit('close', 'unavailable')
  else if (!indices.includes(activeIndex.value)) focusItem(indices[0])
})
onBeforeUnmount(() => {
  cleanup()
  cancelMotion()
  emit('surfaceChange', false)
})
</script>

<template>
  <Transition
    :css="false"
    @before-enter="beforeEnter"
    @enter="enter"
    @enter-cancelled="cancelMotion"
    @before-leave="beforeLeave"
    @leave="leave"
    @leave-cancelled="cancelMotion"
    @after-leave="afterLeave"
  >
    <div
      v-if="open"
      ref="menu"
      class="lyrics-save-menu library-context-menu frosted-context-menu"
      @keydown="keydown"
      @focusout="focusout"
    >
      <div id="lyrics-save-menu" class="lyrics-save-actions" role="menu" :aria-label="label">
        <template v-for="(action, index) in actions" :key="action.target">
          <div v-if="index > 0" class="lyrics-save-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            class="library-context-menu-item"
            :data-index="index"
            :disabled="action.disabled"
            :aria-disabled="action.disabled || undefined"
            :tabindex="activeIndex === index ? 0 : -1"
            @focus="activeIndex = index"
            @click="select(index)"
          >
            <span :class="action.icon" aria-hidden="true" />
            <span class="library-context-menu-text">{{ action.label }}</span>
          </button>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.lyrics-save-menu.library-context-menu.frosted-context-menu {
  /* Positioning owns the inline visibility; focus updates must not write it back to hidden. */
  visibility: hidden;
  position: fixed;
  z-index: 140;
  display: flex;
  flex-direction: column;
  padding: 0;
  width: max-content;
  min-width: 220px;
  max-width: calc(100vw - 16px);
  overflow: hidden;
  box-sizing: border-box;
  user-select: none;
  -webkit-app-region: no-drag;
}
.lyrics-save-actions {
  display: grid;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 4px;
}
.library-context-menu-item:disabled {
  opacity: 0.4;
}
.lyrics-save-separator {
  width: calc(100% + 8px);
  height: 1px;
  margin: 4px -4px;
  background: var(--auralis-border-subtle);
  pointer-events: none;
}
</style>
