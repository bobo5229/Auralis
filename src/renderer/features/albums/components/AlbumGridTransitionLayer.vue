<script setup lang="ts">
import { ref } from 'vue'
import {
  createAlbumGridTransitionController,
  type AlbumGridTransitionLayerHost,
  type AlbumTransitionRect,
} from '../utils/albumGridTransitionController'

const rootRef = ref<HTMLElement | null>(null)

function requireRoot(): HTMLElement {
  const root = rootRef.value
  if (!root?.isConnected) throw new Error('Album grid transition layer is unavailable')
  return root
}

function sanitizeSnapshot(snapshot: HTMLElement): HTMLElement {
  // Snapshots are inert, so the hidden grid play control cannot be used in a transition.
  snapshot.querySelector('.album-card-play-clip')?.remove()
  const elements = [snapshot, ...snapshot.querySelectorAll<HTMLElement>('*')]
  for (const element of elements) {
    element.removeAttribute('id')
    if (element.hasAttribute('tabindex')) element.tabIndex = -1
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/iu.test(attribute.name)) element.removeAttribute(attribute.name)
    }
    element.removeAttribute('autofocus')
    element.removeAttribute('contenteditable')
  }
  snapshot.style.width = '100%'
  snapshot.style.height = '100%'
  return snapshot
}

const host: AlbumGridTransitionLayerHost = {
  reset(): void {
    const root = rootRef.value
    if (!root) return
    root.replaceChildren()
    root.style.display = 'none'
  },
  setBounds(bounds: AlbumTransitionRect): void {
    const root = requireRoot()
    Object.assign(root.style, {
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      display: 'block',
    })
  },
  createItem(options, origin): HTMLElement {
    const root = requireRoot()
    const wrapper = root.ownerDocument.createElement('div')
    wrapper.className = 'album-grid-transition-item'
    wrapper.dataset.albumKey = options.key
    wrapper.dataset.side = options.side
    wrapper.setAttribute('aria-hidden', 'true')
    wrapper.inert = true
    const snapshot = options.snapshotOwned
      ? options.node
      : sanitizeSnapshot(options.node.cloneNode(true) as HTMLElement)
    snapshot.style.width = '100%'
    snapshot.style.height = '100%'
    wrapper.append(snapshot)
    Object.assign(wrapper.style, {
      left: `${options.rect.left - origin.left}px`,
      top: `${options.rect.top - origin.top}px`,
      width: `${options.rect.width}px`,
      height: `${options.rect.height}px`,
      opacity: String(options.opacity),
      transform: 'translate3d(0, 0, 0)',
    })
    return wrapper
  },
  appendItem(item): void {
    requireRoot().append(item)
  },
  setItemPosition(item, left, top): void {
    Object.assign(item.style, { left: `${left}px`, top: `${top}px` })
  },
  renderViewport(viewport, union): void {
    requireRoot().style.clipPath = `inset(${viewport.top - union.top}px ${union.left + union.width - viewport.left - viewport.width}px ${union.top + union.height - viewport.top - viewport.height}px ${viewport.left - union.left}px)`
  },
  renderItem(item, transform, opacity): void {
    item.style.transform = transform
    item.style.opacity = String(opacity)
  },
  captureItem(item) {
    if (!item.isConnected) return null
    const rect = item.getBoundingClientRect()
    const snapshot = item.firstElementChild
    if (!(snapshot instanceof HTMLElement)) return null
    const opacity = Number.parseFloat(getComputedStyle(item).opacity)
    return {
      key: item.dataset.albumKey ?? '',
      node: snapshot,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      opacity,
      snapshotOwned: true,
    }
  },
  isConnected(item): boolean {
    return item.isConnected
  },
}

const controller = createAlbumGridTransitionController(host)

defineExpose({
  prepareSources: controller.prepareSources,
  commitTargets: controller.commitTargets,
  renderProgress: controller.renderProgress,
  captureVisuals: controller.captureVisuals,
  captureViewport: controller.captureViewport,
  getItemStats: controller.getItemStats,
  clear: controller.clear,
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="rootRef"
      class="album-grid-transition-layer"
      aria-hidden="true"
      inert
      style="display: none"
    />
  </Teleport>
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
