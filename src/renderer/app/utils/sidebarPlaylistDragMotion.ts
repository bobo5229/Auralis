import { nextTick, type Ref } from 'vue'
import type { MotionQuery } from '@renderer/shared/animation/motionPreference'

export interface SidebarPlaylistDropTarget {
  key: string
  position: 'before' | 'after'
}

const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const EDGE_SIZE = 36
const MAX_SCROLL_SPEED = 600

interface RowGeometry {
  key: string
  element: HTMLElement
  top: number
  left: number
  width: number
  height: number
}

interface ShiftedRow {
  element: HTMLElement
  transform: string
  transition: string
  offset: number
}

/** One measured layout per gesture. Following and scrolling share one frame loop. */
export function createSidebarPlaylistDragMotion(options: {
  scrollContainer: Ref<HTMLElement | null>
  playlistContainer: Ref<HTMLElement | null>
  preference: MotionQuery
  onTarget: (target: SidebarPlaylistDropTarget | null) => void
}) {
  let rows: RowGeometry[] = []
  let sourceIndex = -1
  let destinationIndex = -1
  let scrollContainer: HTMLElement | null = null
  let viewport: DOMRect | null = null
  let initialScrollTop = 0
  let maxScrollTop = 0
  let pointerX = 0
  let pointerY = 0
  let grabOffset = 0
  let previewY = 0
  let layer: HTMLElement | null = null
  let preview: HTMLElement | null = null
  let marker: HTMLElement | null = null
  let frame: number | null = null
  let previousFrameTime: number | null = null
  let following = false
  let revision = 0
  const shifted = new Map<number, ShiftedRow>()
  const animations = new Set<Animation>()

  function stopFrames(): void {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    previousFrameTime = null
  }

  function restoreRows(): void {
    if (!shifted.size) return
    for (const row of shifted.values()) {
      row.element.style.transition = 'none'
      row.element.style.transform = row.transform
    }
    // Restore in one batch before re-enabling normal hover transitions.
    options.playlistContainer.value?.getBoundingClientRect()
    for (const row of shifted.values()) row.element.style.transition = row.transition
    shifted.clear()
  }

  function clear(): void {
    revision += 1
    following = false
    stopFrames()
    for (const animation of animations) animation.cancel()
    animations.clear()
    restoreRows()
    layer?.remove()
    layer = preview = marker = null
    rows = []
    sourceIndex = destinationIndex = -1
    viewport = null
    scrollContainer = null
    options.onTarget(null)
  }

  function animate(element: HTMLElement, frames: Keyframe[], duration: number): Promise<void> {
    if (options.preference.matches) return Promise.resolve()
    const animation = element.animate(frames, { duration, easing: EASING })
    animations.add(animation)
    return animation.finished
      .catch(() => undefined)
      .then(() => {
        animations.delete(animation)
        animation.cancel()
      })
  }

  function scrollDelta(): number {
    return (scrollContainer?.scrollTop ?? initialScrollTop) - initialScrollTop
  }

  function setShift(index: number, offset: number): void {
    const element = rows[index].element
    let saved = shifted.get(index)
    if (!saved && offset === 0) return
    if (!saved) {
      saved = {
        element,
        transform: element.style.transform,
        transition: element.style.transition,
        offset: 0,
      }
      shifted.set(index, saved)
    }
    if (saved.offset === offset) return
    saved.offset = offset
    element.style.transition = options.preference.matches ? 'none' : `transform 160ms ${EASING}`
    element.style.transform = `translate3d(0, ${offset}px, 0)`
  }

  function moveGap(index: number): void {
    if (index === destinationIndex) return
    destinationIndex = index
    const source = rows[sourceIndex]
    const stride = rows[sourceIndex + 1]
      ? rows[sourceIndex + 1].top - source.top
      : sourceIndex > 0
        ? source.top - rows[sourceIndex - 1].top
        : source.height
    const nextShifted = new Set<number>()
    for (let i = Math.min(index, sourceIndex); i <= Math.max(index, sourceIndex); i += 1) {
      if (i === sourceIndex) continue
      nextShifted.add(i)
      setShift(i, index < sourceIndex ? stride : -stride)
    }
    for (const i of shifted.keys()) if (!nextShifted.has(i)) setShift(i, 0)
  }

  function targetAtPointer(offset: number): SidebarPlaylistDropTarget | null {
    if (!viewport || !rows.length || !scrollContainer) return null
    const source = rows[sourceIndex]
    const worldY = pointerY + offset
    if (
      pointerX < source.left ||
      pointerX > source.left + source.width ||
      pointerY < viewport.top ||
      pointerY > viewport.bottom ||
      worldY < rows[0].top - 3 ||
      worldY > rows[rows.length - 1].top + rows[rows.length - 1].height + 3
    )
      return null
    // Search original midpoints; animated rectangles must not change the chosen slot.
    let low = 0
    let high = rows.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (worldY < rows[mid].top + rows[mid].height / 2) high = mid
      else low = mid + 1
    }
    const index = low > sourceIndex ? low - 1 : low
    moveGap(index)
    if (index === sourceIndex) return null
    return { key: rows[index].key, position: index < sourceIndex ? 'before' : 'after' }
  }

  function render(): SidebarPlaylistDropTarget | null {
    if (!preview || !marker || !viewport || !following) return null
    // Read the scroll position before writing any transforms or marker styles.
    const offset = scrollDelta()
    const source = rows[sourceIndex]
    previewY = Math.max(
      0,
      Math.min(viewport.height - source.height, pointerY - grabOffset - viewport.top),
    )
    preview.style.transform = `translate3d(0, ${previewY}px, 0)`
    const target = targetAtPointer(offset)
    if (!target) {
      moveGap(sourceIndex)
      marker.hidden = true
    } else {
      marker.hidden = false
      const top = rows[destinationIndex].top - viewport.top - offset
      marker.style.transform = `translate3d(0, ${top - 2}px, 0)`
    }
    options.onTarget(target)
    return target
  }

  function scrollSpeed(): number {
    if (!viewport || !scrollContainer || !following) return 0
    if (
      pointerX < viewport.left ||
      pointerX > viewport.right ||
      pointerY < viewport.top ||
      pointerY > viewport.bottom
    )
      return 0
    if (pointerY < viewport.top + EDGE_SIZE && scrollContainer.scrollTop > 0)
      return -MAX_SCROLL_SPEED * (1 - (pointerY - viewport.top) / EDGE_SIZE)
    if (pointerY > viewport.bottom - EDGE_SIZE && scrollContainer.scrollTop < maxScrollTop)
      return MAX_SCROLL_SPEED * (1 - (viewport.bottom - pointerY) / EDGE_SIZE)
    return 0
  }

  function tick(time: number): void {
    frame = null
    if (!following) return
    const elapsed = previousFrameTime === null ? 0 : Math.min(32, time - previousFrameTime)
    previousFrameTime = time
    const speed = scrollSpeed()
    if (speed && scrollContainer)
      scrollContainer.scrollTop = Math.max(
        0,
        Math.min(maxScrollTop, scrollContainer.scrollTop + (speed * elapsed) / 1000),
      )
    render()
    if (scrollSpeed()) schedule()
    else previousFrameTime = null
  }

  function schedule(): void {
    if (frame === null && following) frame = requestAnimationFrame(tick)
  }

  function begin(key: string, event: PointerEvent): boolean {
    clear()
    scrollContainer = options.scrollContainer.value
    const list = options.playlistContainer.value
    if (!scrollContainer || !list) return false
    viewport = scrollContainer.getBoundingClientRect()
    initialScrollTop = scrollContainer.scrollTop
    maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    rows = Array.from(
      list.querySelectorAll<HTMLElement>('[data-sidebar-playlist-key]'),
      (element) => {
        const rect = element.getBoundingClientRect()
        return {
          key: element.dataset.sidebarPlaylistKey!,
          element,
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }
      },
    )
    sourceIndex = rows.findIndex((row) => row.key === key)
    if (sourceIndex < 0 || !viewport.height) {
      clear()
      return false
    }
    destinationIndex = sourceIndex
    const source = rows[sourceIndex]
    const computed = getComputedStyle(source.element)
    layer = document.createElement('div')
    layer.className = 'sidebar-playlist-drag-layer'
    layer.setAttribute('aria-hidden', 'true')
    layer.inert = true
    Object.assign(layer.style, {
      left: `${viewport.left}px`,
      top: `${viewport.top}px`,
      width: `${viewport.width}px`,
      height: `${viewport.height}px`,
    })
    for (const property of Array.from(computed))
      if (property.startsWith('--'))
        layer.style.setProperty(property, computed.getPropertyValue(property))
    preview = source.element.cloneNode(true) as HTMLElement
    preview.classList.remove(
      'smart-playlist-link-pressed',
      'smart-playlist-link-dragging',
      'sidebar-playlist-drag-origin',
    )
    preview.classList.add('sidebar-playlist-drag-preview')
    if (source.element.closest('.app-sidebar--collapsed'))
      preview.classList.add('sidebar-playlist-drag-preview--rail')
    for (const element of [preview, ...preview.querySelectorAll<HTMLElement>('*')]) {
      element.removeAttribute('id')
      element.removeAttribute('data-sidebar-playlist-key')
      element.removeAttribute('href')
      element.removeAttribute('autofocus')
      element.removeAttribute('aria-current')
      element.tabIndex = -1
    }
    Object.assign(preview.style, {
      left: `${source.left - viewport.left}px`,
      top: '0',
      width: `${source.width}px`,
      height: `${source.height}px`,
      padding: computed.padding,
      font: computed.font,
      color: computed.color,
    })
    marker = document.createElement('div')
    marker.className = 'sidebar-playlist-drop-marker'
    marker.hidden = true
    Object.assign(marker.style, {
      left: `${source.left - viewport.left}px`,
      width: `${source.width}px`,
    })
    layer.append(marker, preview)
    document.body.append(layer)
    pointerX = event.clientX
    pointerY = event.clientY
    grabOffset = event.clientY - source.top
    following = true
    render()
    return true
  }

  function update(event: PointerEvent): void {
    pointerX = event.clientX
    pointerY = event.clientY
    schedule()
  }

  function flush(event: PointerEvent): SidebarPlaylistDropTarget | null {
    pointerX = event.clientX
    pointerY = event.clientY
    stopFrames()
    return render()
  }

  async function finish(committed: boolean): Promise<void> {
    const token = revision
    following = false
    stopFrames()
    if (marker) marker.hidden = true
    const source = rows[sourceIndex]
    if (!source || !preview || !viewport) {
      clear()
      return
    }
    let targetY = source.top - viewport.top - scrollDelta()
    if (committed) {
      await nextTick()
      if (token !== revision) return
      restoreRows()
      targetY = source.element.getBoundingClientRect().top - viewport.top
    } else moveGap(sourceIndex)
    if (targetY + source.height > 0 && targetY < viewport.height) {
      const sprite = preview
      sprite.style.transform = `translate3d(0, ${targetY}px, 0)`
      await animate(
        sprite,
        [
          { transform: `translate3d(0, ${previewY}px, 0)` },
          { transform: `translate3d(0, ${targetY}px, 0)` },
        ],
        180,
      )
    }
    if (token === revision) clear()
  }

  async function reorderWithKeyboard(keys: string[], mutate: () => void): Promise<void> {
    clear()
    const token = revision
    const list = options.playlistContainer.value
    const elements = Array.from(
      list?.querySelectorAll<HTMLElement>('[data-sidebar-playlist-key]') ?? [],
    ).filter((element) => keys.includes(element.dataset.sidebarPlaylistKey!))
    const before = elements.map((element) => element.getBoundingClientRect().top)
    mutate()
    await nextTick()
    if (token !== revision) return
    const after = elements.map((element) => element.getBoundingClientRect().top)
    await Promise.all(
      elements.map((element, index) =>
        animate(
          element,
          [
            { transform: `translateY(${before[index] - after[index]}px)` },
            { transform: 'translateY(0)' },
          ],
          160,
        ),
      ),
    )
    if (token === revision) clear()
  }

  function reduceMotion(): void {
    if (!options.preference.matches) return
    for (const row of shifted.values()) row.element.style.transition = 'none'
    for (const animation of animations) animation.cancel()
  }

  options.preference.addEventListener('change', reduceMotion)
  return {
    begin,
    update,
    flush,
    finish,
    clear,
    reorderWithKeyboard,
    onScroll: schedule,
    dispose() {
      clear()
      options.preference.removeEventListener('change', reduceMotion)
    },
  }
}
