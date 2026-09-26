import type { DirectiveBinding, ObjectDirective, Plugin } from 'vue'
import { animateTooltipOpacity } from '@renderer/shared/animation/motion'
import { isTooltipTextClipped, placeTooltip } from './tooltipGeometry'
import './tooltip.css'

type TooltipText = string | null | undefined
interface Entry {
  element: HTMLElement
  text: string
  overflow: boolean
  delay: number
}

let nextTooltipId = 0

/** One overlay per app; virtual rows only register lightweight directive metadata. */
export function createTooltipController() {
  const entries = new WeakMap<HTMLElement, Entry>()
  const id = `auralis-tooltip-${++nextTooltipId}`
  let overlay: HTMLDivElement | null = null
  let active: Entry | null = null
  let describedElement: HTMLElement | null = null
  let showTimer: ReturnType<typeof setTimeout> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let fadeTimer: ReturnType<typeof setTimeout> | undefined
  let cancelAnimation = (): void => {}
  let observer: MutationObserver | null = null

  function clearTimers(): void {
    clearTimeout(showTimer)
    showTimer = undefined
    clearTimeout(hideTimer)
    clearTimeout(fadeTimer)
  }

  function dismiss(immediate = false): void {
    clearTimers()
    observer?.disconnect()
    active = null
    if (describedElement) {
      const tokens = (describedElement.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter((token) => token && token !== id)
      if (tokens.length) describedElement.setAttribute('aria-describedby', tokens.join(' '))
      else describedElement.removeAttribute('aria-describedby')
      describedElement = null
    }
    cancelAnimation()
    if (!overlay || overlay.hidden) return
    overlay.style.pointerEvents = 'none'
    overlay.setAttribute('aria-hidden', 'true')
    if (immediate) overlay.hidden = true
    else {
      cancelAnimation = animateTooltipOpacity(overlay, false)
      fadeTimer = setTimeout(() => {
        if (overlay) overlay.hidden = true
        cancelAnimation()
      }, 100)
    }
  }

  function eligible(entry: Entry): boolean {
    return (
      entry.element.isConnected &&
      Boolean(entry.text) &&
      entry.element.getClientRects().length > 0 &&
      !entry.element.matches(':disabled, [aria-disabled="true"]') &&
      (!entry.overflow || isTooltipTextClipped(entry.element))
    )
  }

  function show(entry: Entry): void {
    if (active !== entry || !eligible(entry)) {
      dismiss(true)
      return
    }
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.id = id
      overlay.className = 'tooltip-overlay'
      overlay.setAttribute('role', 'tooltip')
      document.body.append(overlay)
    }
    overlay.textContent = entry.text
    overlay.hidden = false
    overlay.removeAttribute('aria-hidden')
    overlay.style.pointerEvents = 'auto'
    const position = placeTooltip(
      entry.element.getBoundingClientRect(),
      overlay.getBoundingClientRect(),
      {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
    )
    overlay.style.left = `${position.left}px`
    overlay.style.top = `${position.top}px`
    const focused = document.activeElement
    describedElement =
      focused instanceof HTMLElement && entry.element.contains(focused) ? focused : entry.element
    const tokens = new Set((describedElement.getAttribute('aria-describedby') ?? '').split(/\s+/))
    tokens.delete('')
    tokens.add(id)
    describedElement.setAttribute('aria-describedby', [...tokens].join(' '))
    cancelAnimation = animateTooltipOpacity(overlay, true)
  }

  function request(entry: Entry): void {
    clearTimeout(hideTimer)
    if (active === entry && (showTimer !== undefined || describedElement)) return
    dismiss(true)
    if (!eligible(entry)) return
    active = entry
    observer ??= new MutationObserver(() => {
      if (active && !active.element.isConnected) dismiss(true)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    showTimer = setTimeout(() => {
      showTimer = undefined
      show(entry)
    }, entry.delay)
  }

  function entryAt(target: EventTarget | null): Entry | undefined {
    if (!(target instanceof Element)) return
    const element = target.closest<HTMLElement>('[data-auralis-tooltip]')
    return element ? entries.get(element) : undefined
  }

  function insideOverlay(target: EventTarget | null): boolean {
    return target instanceof Node && Boolean(overlay?.contains(target))
  }

  function onPointerOver(event: PointerEvent): void {
    if (event.pointerType === 'touch') return
    if (insideOverlay(event.target)) {
      clearTimeout(hideTimer)
      return
    }
    const entry = entryAt(event.target)
    if (entry && entryAt(event.relatedTarget) !== entry) request(entry)
  }

  function onPointerOut(event: PointerEvent): void {
    if (!active) return
    if (entryAt(event.relatedTarget) === active || insideOverlay(event.relatedTarget)) return
    if (active.element.contains(document.activeElement)) return
    clearTimeout(showTimer)
    showTimer = undefined
    clearTimeout(hideTimer)
    // Leave enough time to cross the 8px gap and read the overlay itself.
    hideTimer = setTimeout(() => dismiss(), 150)
  }

  function onFocusIn(event: FocusEvent): void {
    if (!(event.target instanceof HTMLElement) || !event.target.matches(':focus-visible')) return
    const entry = entryAt(event.target)
    if (entry) request(entry)
  }

  function onFocusOut(event: FocusEvent): void {
    if (active && entryAt(event.relatedTarget) !== active) dismiss()
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !active) return
    dismiss(true)
    event.stopPropagation()
  }

  const dismissImmediately = (): void => dismiss(true)
  const onScroll = (event: Event): void => {
    if (!insideOverlay(event.target)) dismissImmediately()
  }
  document.addEventListener('pointerover', onPointerOver)
  document.addEventListener('pointerout', onPointerOut)
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('pointerdown', dismissImmediately, true)
  document.addEventListener('click', dismissImmediately, true)
  document.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', dismissImmediately)
  window.addEventListener('blur', dismissImmediately)

  function register(element: HTMLElement, binding: DirectiveBinding<TooltipText>): void {
    const entry: Entry = {
      element,
      text: binding.value?.trim() ?? '',
      overflow: Boolean(binding.modifiers.overflow),
      delay: binding.modifiers.data ? 150 : binding.modifiers.overflow ? 500 : 600,
    }
    const previous = entries.get(element)
    if (
      previous?.text === entry.text &&
      previous.overflow === entry.overflow &&
      previous.delay === entry.delay
    )
      return
    if (active?.element === element) dismiss(true)
    entries.set(element, entry)
    element.setAttribute('data-auralis-tooltip', '')
  }

  const directive: ObjectDirective<HTMLElement, TooltipText> = {
    mounted: register,
    updated: register,
    beforeUnmount(element) {
      if (active?.element === element) dismiss(true)
      entries.delete(element)
      element.removeAttribute('data-auralis-tooltip')
    },
  }

  return {
    directive,
    dispose(): void {
      dismiss(true)
      overlay?.remove()
      overlay = null
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', dismissImmediately, true)
      document.removeEventListener('click', dismissImmediately, true)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', dismissImmediately)
      window.removeEventListener('blur', dismissImmediately)
    },
  }
}

export const tooltipPlugin: Plugin = {
  install(app) {
    const controller = createTooltipController()
    app.directive('tooltip', controller.directive)
    app.onUnmount(controller.dispose)
  },
}
