<script setup lang="ts">
import { ref } from 'vue'
import { planAlbumGridTransition } from '../utils/albumGridTransitionPlan'

export interface AlbumTransitionRect {
  left: number
  top: number
  width: number
  height: number
}

export interface AlbumTransitionVisual {
  key: string
  node: HTMLElement
  rect: AlbumTransitionRect
  opacity: number
}

export interface AlbumTransitionTarget {
  key: string
  node: HTMLElement
  rect: AlbumTransitionRect
}

interface TransitionLayerItem {
  key: string
  side: 'from' | 'to'
  element: HTMLElement
  rect: AlbumTransitionRect
  opacity: number
  destination: AlbumTransitionRect | null
}

const rootRef = ref<HTMLElement | null>(null)
let items: TransitionLayerItem[] = []
let viewportOrigin = { left: 0, top: 0 }
let viewportFrom: AlbumTransitionRect = { left: 0, top: 0, width: 0, height: 0 }
let viewportTo: AlbumTransitionRect = viewportFrom
let currentViewport: AlbumTransitionRect = viewportFrom
let viewportUnion = { left: 0, top: 0, right: 0, bottom: 0 }

function sanitizeSnapshot(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement
  clone.removeAttribute('id')
  clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'))
  clone.querySelectorAll<HTMLElement>('[tabindex]').forEach((element) => {
    element.tabIndex = -1
  })
  clone.style.width = '100%'
  clone.style.height = '100%'
  return clone
}

function clear(): void {
  items = []
  viewportFrom = { left: 0, top: 0, width: 0, height: 0 }
  viewportTo = viewportFrom
  currentViewport = viewportFrom
  viewportUnion = { left: 0, top: 0, right: 0, bottom: 0 }
  if (!rootRef.value) return
  rootRef.value.replaceChildren()
  rootRef.value.style.display = 'none'
}

function mount(
  fromViewport: AlbumTransitionRect,
  toViewport: AlbumTransitionRect,
  from: readonly AlbumTransitionVisual[],
  to: readonly AlbumTransitionTarget[],
): void {
  const root = rootRef.value
  if (!root) return
  const unionLeft = Math.min(fromViewport.left, toViewport.left)
  const unionTop = Math.min(fromViewport.top, toViewport.top)
  const unionRight = Math.max(
    fromViewport.left + fromViewport.width,
    toViewport.left + toViewport.width,
  )
  const unionBottom = Math.max(
    fromViewport.top + fromViewport.height,
    toViewport.top + toViewport.height,
  )
  viewportUnion = { left: unionLeft, top: unionTop, right: unionRight, bottom: unionBottom }
  root.replaceChildren()
  root.style.left = `${unionLeft}px`
  root.style.top = `${unionTop}px`
  root.style.width = `${unionRight - unionLeft}px`
  root.style.height = `${unionBottom - unionTop}px`
  root.style.display = 'block'
  viewportOrigin = { left: unionLeft, top: unionTop }
  viewportFrom = fromViewport
  viewportTo = toViewport

  const add = (
    side: 'from' | 'to',
    key: string,
    node: HTMLElement,
    rect: AlbumTransitionRect,
    opacity: number,
    destination: AlbumTransitionRect | null,
  ): void => {
    const wrapper = document.createElement('div')
    wrapper.className = 'album-grid-transition-item'
    wrapper.dataset.albumKey = key
    wrapper.dataset.side = side
    wrapper.setAttribute('aria-hidden', 'true')
    wrapper.inert = true
    Object.assign(wrapper.style, {
      left: `${rect.left - viewportOrigin.left}px`,
      top: `${rect.top - viewportOrigin.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      opacity: String(opacity),
      transform: 'translate3d(0, 0, 0)',
    })
    wrapper.append(sanitizeSnapshot(node))
    root.append(wrapper)
    items.push({ key, side, element: wrapper, rect, opacity, destination })
  }

  const plan = planAlbumGridTransition(from, to)
  for (const visual of plan.from) {
    add(
      'from',
      visual.key,
      visual.node,
      visual.rect,
      Math.max(0, Math.min(1, visual.opacity)),
      visual.destination,
    )
  }
  for (const target of plan.to) {
    add('to', target.key, target.node, target.rect, 0, null)
  }
  renderProgress(0)
}

/** Per-frame writes touch only transform and opacity. */
function renderProgress(progress: number): void {
  const value = Math.max(0, Math.min(1, progress))
  currentViewport = {
    left: viewportFrom.left + (viewportTo.left - viewportFrom.left) * value,
    top: viewportFrom.top + (viewportTo.top - viewportFrom.top) * value,
    width: viewportFrom.width + (viewportTo.width - viewportFrom.width) * value,
    height: viewportFrom.height + (viewportTo.height - viewportFrom.height) * value,
  }
  const root = rootRef.value
  if (root) {
    root.style.clipPath = `inset(${currentViewport.top - viewportUnion.top}px ${viewportUnion.right - currentViewport.left - currentViewport.width}px ${viewportUnion.bottom - currentViewport.top - currentViewport.height}px ${currentViewport.left - viewportUnion.left}px)`
  }
  for (const item of items) {
    if (item.side === 'from') {
      const destination = item.destination
      const dx = destination ? destination.left - item.rect.left : 0
      const dy = destination ? destination.top - item.rect.top : 0
      const targetScale =
        destination && item.rect.width > 0 ? destination.width / item.rect.width : 1
      const scale = 1 + (targetScale - 1) * value
      item.element.style.transform = `translate3d(${dx * value}px, ${dy * value}px, 0) scale(${scale})`
      item.element.style.opacity = String(destination ? item.opacity : item.opacity * (1 - value))
    } else {
      item.element.style.opacity = String(value)
    }
  }
}

function captureViewport(): AlbumTransitionRect {
  return { ...currentViewport }
}

/** Capture the current composited copies when a user reverses the transition. */
function captureVisuals(): AlbumTransitionVisual[] {
  return items.flatMap((item) => {
    const rect = item.element.getBoundingClientRect()
    const opacity = Number.parseFloat(getComputedStyle(item.element).opacity)
    if (rect.width <= 0 || rect.height <= 0 || opacity <= 0.001) return []
    const snapshot = item.element.firstElementChild
    if (!(snapshot instanceof HTMLElement)) return []
    return [
      {
        key: item.key,
        node: snapshot.cloneNode(true) as HTMLElement,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        opacity,
      },
    ]
  })
}

defineExpose({ mount, renderProgress, captureVisuals, captureViewport, clear })
</script>

<template>
  <div
    ref="rootRef"
    class="album-grid-transition-layer"
    aria-hidden="true"
    inert
    style="display: none"
  />
</template>

<style>
.album-grid-transition-layer {
  position: fixed;
  z-index: 45;
  overflow: hidden;
  pointer-events: none;
  contain: layout paint;
}

.album-grid-transition-item {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  transform-origin: top left;
  will-change: transform, opacity;
}

.album-grid-transition-item > .album-card {
  width: 100%;
  height: 100%;
}
</style>
