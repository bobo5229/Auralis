<script setup lang="ts">
import { ref } from 'vue'
import {
  createAlbumGridTransitionController,
  type AlbumGridTransitionLayerHost,
  type AlbumTransitionRect,
} from '../utils/albumGridTransitionController'

const rootRef = ref<HTMLElement | null>(null)
const groups = new Map<string, HTMLElement>()
const viewports = new WeakMap<HTMLElement, AlbumTransitionRect>()
const itemClips = new WeakMap<HTMLElement, AlbumTransitionRect>()
let animations: Animation[] = []

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
    animations.forEach((animation) => animation.cancel())
    animations = []
    groups.clear()
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
      transform: 'none',
    })
    if (options.clip) {
      itemClips.set(wrapper, options.clip)
      wrapper.style.clipPath = `inset(${Math.max(0, options.clip.top - options.rect.top)}px ${Math.max(0, options.rect.left + options.rect.width - options.clip.left - options.clip.width)}px ${Math.max(0, options.rect.top + options.rect.height - options.clip.top - options.clip.height)}px ${Math.max(0, options.clip.left - options.rect.left)}px)`
    }
    return wrapper
  },
  appendItem(item): void {
    const side = item.dataset.side ?? 'from'
    let group = groups.get(side)
    if (!group) {
      group = document.createElement('div')
      group.className = 'album-grid-transition-group'
      group.dataset.side = side
      groups.set(side, group)
      requireRoot().append(group)
    }
    group.append(item)
  },
  setItemPosition(item, left, top): void {
    Object.assign(item.style, { left: `${left}px`, top: `${top}px` })
  },
  renderViewport(viewport, union): void {
    requireRoot().style.clipPath = `inset(${viewport.top - union.top}px ${union.left + union.width - viewport.left - viewport.width}px ${union.top + union.height - viewport.top - viewport.height}px ${viewport.left - union.left}px)`
  },
  renderItem(item, transform, opacity): void {
    item.style.transform = transform === 'translate3d(0, 0, 0)' ? 'none' : transform
    item.style.opacity = String(opacity)
  },
  setGroupViewports(from, to, union): void {
    for (const [side, group] of groups) {
      const viewport = side === 'from' ? from : to
      viewports.set(group, viewport)
      group.style.clipPath = `inset(${viewport.top - union.top}px ${union.left + union.width - viewport.left - viewport.width}px ${union.top + union.height - viewport.top - viewport.height}px ${viewport.left - union.left}px)`
      if (side === 'to') {
        // Prepare the incoming surface for rasterization before starting its fade.
        group.style.opacity = '0.001'
        for (const item of group.children) (item as HTMLElement).style.opacity = '1'
      }
    }
  },
  async animateGroups(duration): Promise<void> {
    for (const [side, group] of groups) {
      // Only two composited surfaces animate. Card dimensions remain fixed.
      const outgoing = side === 'from'
      const animation = group.animate(
        outgoing
          ? [{ opacity: 1 }, { opacity: 0, offset: 0.45 }, { opacity: 0 }]
          : [{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }],
        { duration, fill: 'forwards' },
      )
      animations.push(animation)
    }
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)))
  },
  captureItem(item) {
    if (!item.isConnected) return null
    const rect = item.getBoundingClientRect()
    const snapshot = item.firstElementChild
    if (!(snapshot instanceof HTMLElement)) return null
    const group = item.parentElement
    const opacity =
      Number.parseFloat(getComputedStyle(item).opacity) *
      (group ? Number.parseFloat(getComputedStyle(group).opacity) : 1)
    const viewport = group ? viewports.get(group) : undefined
    const clip = itemClips.get(item)
    const left = Math.max(rect.left, viewport?.left ?? rect.left, clip?.left ?? rect.left)
    const top = Math.max(rect.top, viewport?.top ?? rect.top, clip?.top ?? rect.top)
    const right = Math.min(
      rect.right,
      viewport ? viewport.left + viewport.width : rect.right,
      clip ? clip.left + clip.width : rect.right,
    )
    const bottom = Math.min(
      rect.bottom,
      viewport ? viewport.top + viewport.height : rect.bottom,
      clip ? clip.top + clip.height : rect.bottom,
    )
    if (right <= left || bottom <= top) return null
    return {
      key: item.dataset.albumKey ?? '',
      node: snapshot,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      opacity,
      snapshotOwned: true,
      clip: { left, top, width: right - left, height: bottom - top },
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
  animate: controller.animate,
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
}

.album-grid-transition-group {
  position: absolute;
  inset: 0;
  pointer-events: none;
  will-change: opacity;
}

.album-grid-transition-item > .album-card {
  width: 100%;
  height: 100%;
}
</style>
