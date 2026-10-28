<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'
import { acquireModalBackground } from '@renderer/shared/focus/modalBackground'
import { prepareDialogEnter } from './prepareDialogEnter'
import './dialogSurface.css'

defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    titleId: string
    closeLabel?: string
    size?: 'medium' | 'large'
    fill?: boolean
    padded?: boolean
    scroll?: boolean
    dismissible?: boolean
    closeOnBackdrop?: boolean
    busy?: boolean
    as?: 'section' | 'form'
    panelClass?: string
    backdropClass?: string
    closeClass?: string
    describedBy?: string
    initialFocus?: () => HTMLElement | undefined
    returnFocusTo?: HTMLElement | null
    restoreFocus?: (captured: HTMLElement | null) => void
    ready?: Promise<unknown>
  }>(),
  {
    closeLabel: undefined,
    describedBy: undefined,
    initialFocus: undefined,
    returnFocusTo: null,
    restoreFocus: undefined,
    ready: undefined,
    size: 'large',
    fill: false,
    padded: true,
    scroll: true,
    dismissible: true,
    closeOnBackdrop: true,
    busy: false,
    as: 'section',
    panelClass: '',
    backdropClass: '',
    closeClass: '',
  },
)
const emit = defineEmits<{
  close: [reason: 'button' | 'escape' | 'backdrop']
  submit: []
  enterStart: []
  entered: []
  enterCancelled: []
}>()
const { t } = useI18n()
const panel = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
defineExpose({ panel, closeButton })
function close(reason: 'button' | 'escape' | 'backdrop'): void {
  if (props.dismissible && (reason !== 'backdrop' || props.closeOnBackdrop)) emit('close', reason)
}
function onSubmit(event: Event): void {
  if (props.as !== 'form') return
  event.preventDefault()
  emit('submit')
}
let releaseBackground: (() => void) | undefined
useOverlayFocusTrap({
  isOpen: () => props.open,
  container: panel,
  initialFocus: () => props.initialFocus?.() ?? closeButton.value ?? undefined,
  canDismiss: () => props.dismissible,
  onEscape: () => close('escape'),
  onActivate: () => {
    releaseBackground = acquireModalBackground()
  },
  onDeactivate: () => {
    releaseBackground?.()
    releaseBackground = undefined
  },
  restoreFocus: (captured) => {
    if (props.restoreFocus) {
      props.restoreFocus(captured)
      return
    }
    const target = [props.returnFocusTo, captured].find(
      (element) =>
        element?.isConnected &&
        element !== document.body &&
        !element.hasAttribute('disabled') &&
        !element.closest('[inert], [aria-hidden="true"]'),
    )
    target?.focus({ preventScroll: true })
  },
})

let cancelEnter: (() => void) | undefined
const reducedMotion = () => document.documentElement.dataset.reducedMotion === 'true'
function cancelEntry(): void {
  cancelEnter?.()
  cancelEnter = undefined
  emit('enterCancelled')
}
function beforeEnter(element: Element): void {
  cancelEntry()
  const target = element.querySelector<HTMLElement>('.auralis-dialog-panel')!
  target.style.removeProperty('opacity')
  if (!reducedMotion()) target.style.opacity = '0.01'
}
function enter(element: Element, done: () => void): void {
  if (reducedMotion()) {
    done()
    emit('entered')
    return
  }
  const target = element.querySelector<HTMLElement>('.auralis-dialog-panel')!
  let timeout: ReturnType<typeof setTimeout> | undefined
  const stopPreparation = prepareDialogEnter(props.ready ?? Promise.resolve(), () => {
    if (!props.open) return
    emit('enterStart')
    target.addEventListener('transitionend', onEnd)
    timeout = setTimeout(finish, 180)
    target.style.removeProperty('opacity')
    if (reducedMotion()) finish()
  })
  function onEnd(event: TransitionEvent): void {
    if (event.target === target && event.propertyName === 'opacity') finish()
  }
  function cleanup(): void {
    stopPreparation()
    clearTimeout(timeout)
    target.removeEventListener('transitionend', onEnd)
  }
  function finish(): void {
    cleanup()
    cancelEnter = undefined
    done()
    emit('entered')
  }
  cancelEnter = cleanup
}
watch(
  () => props.open,
  (open) => {
    if (!open) cancelEntry()
  },
)
onBeforeUnmount(cancelEntry)
</script>

<template>
  <Teleport to="body">
    <Transition
      name="auralis-dialog"
      @before-enter="beforeEnter"
      @enter="enter"
      @enter-cancelled="cancelEntry"
    >
      <div
        v-if="open"
        class="sidebar-overlay auralis-dialog-backdrop"
        :class="backdropClass"
        @click.self="close('backdrop')"
      >
        <component
          :is="as"
          ref="panel"
          v-bind="$attrs"
          class="auralis-dialog-panel"
          :class="[
            panelClass,
            `auralis-dialog-panel--${size}`,
            { 'auralis-dialog-panel--fill': fill },
          ]"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="describedBy"
          :aria-busy="busy"
          tabindex="-1"
          @submit="onSubmit"
        >
          <slot name="header">
            <header class="auralis-dialog-header">
              <slot name="header-leading" />
              <div class="auralis-dialog-title">
                <h2 :id="titleId">{{ title }}</h2>
                <slot name="subtitle" />
              </div>
              <div class="auralis-dialog-header-actions">
                <slot name="header-actions" /><button
                  ref="closeButton"
                  type="button"
                  class="auralis-dialog-close"
                  :class="closeClass"
                  :disabled="!dismissible"
                  :aria-label="closeLabel ?? t('dialog.close')"
                  @click="close('button')"
                >
                  <span class="i-lucide-x" aria-hidden="true" />
                </button>
              </div>
            </header>
          </slot>
          <div
            class="auralis-dialog-body"
            :class="{
              'auralis-dialog-body--padded': padded,
              'auralis-dialog-body--fixed': !scroll,
            }"
          >
            <slot />
          </div>
          <footer v-if="$slots.footer" class="auralis-dialog-footer"><slot name="footer" /></footer>
          <slot name="overlay" />
        </component>
      </div>
    </Transition>
  </Teleport>
</template>
