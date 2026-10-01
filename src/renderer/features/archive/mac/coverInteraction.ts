import type { MacViewActions, MacViewModel } from './macViewTypes'
import type { ArchiveStageController } from './macStage'
import type { MacDeviceController } from './macDevice'
import { mountLoadTray } from './loadTray'

export function mountCoverInteraction(
  root: ShadowRoot,
  stage: ArchiveStageController,
  device: MacDeviceController,
  feedback: (text: string) => void,
  requestInsert: MacViewActions['onRequestInsert'],
) {
  const canvas = root.getElementById('album-stage') as HTMLCanvasElement
  const ghost = root.getElementById('ghost') as HTMLCanvasElement
  const slot = root.querySelector('.floppy') as HTMLElement
  const button = root.getElementById('load-album') as HTMLButtonElement
  const scene = root.getElementById('scene') as HTMLElement
  const tray = mountLoadTray(slot, matchMedia('(prefers-reduced-motion: reduce)'))
  const listeners = new AbortController()
  const options = { signal: listeners.signal }
  let model: MacViewModel | null = null
  let disposed = false
  let operation: AbortController | null = null
  let gesture: {
    id: number
    key: string
    texture: HTMLCanvasElement
    x: number
    y: number
    startX: number
    startY: number
    timer: number
    active: boolean
  } | null = null

  slot.removeAttribute('aria-hidden')
  slot.setAttribute('role', 'button')
  slot.setAttribute('aria-label', '装入选中专辑，从第一首可用曲目播放')
  slot.tabIndex = 0
  button.style.removeProperty('display')
  button.textContent = '装入'

  function available() {
    const item = model?.items.find((item) => item.key === model?.selectedAlbumKey)
    const texture = item && model?.covers?.get(item.key)
    return model?.canInsert &&
      !model.dayLoading &&
      !model.dayError &&
      item?.canPlay &&
      item.albumKey &&
      texture
      ? { item, texture }
      : null
  }

  function sync() {
    const busy = Boolean(gesture || operation)
    device.setBusy(busy)
    scene.dataset.inserting = String(Boolean(operation))
    scene.dataset.coverDragging = String(Boolean(gesture?.active))
    button.disabled = !available() || busy
    slot.setAttribute('aria-disabled', String(button.disabled))
    canvas.classList.toggle('is-carrying', Boolean(gesture?.active))
  }

  function position(x: number, y: number) {
    ghost.style.left = `${x}px`
    ghost.style.top = `${y}px`
    tray.approach(x, y)
  }

  function release() {
    const state = gesture
    gesture = null
    if (!state) return
    clearTimeout(state.timer)
    if (canvas.hasPointerCapture(state.id)) canvas.releasePointerCapture(state.id)
  }

  function cancel(message = true): boolean {
    const active = Boolean(gesture || operation)
    release()
    operation?.abort()
    operation = null
    tray.cancel()
    ghost.hidden = true
    sync()
    if (active && message) feedback('已取消装入，封面已返回舞台')
    return active
  }

  async function insert(key: string, texture: HTMLCanvasElement, x: number, y: number) {
    const selected = available()
    if (disposed || operation || selected?.item.key !== key) return
    const current = new AbortController()
    operation = current
    ghost.getContext('2d')?.drawImage(texture, 0, 0, 96, 96)
    ghost.hidden = false
    position(x, y)
    sync()
    feedback(`正在装入 ${selected.item.title}…`)
    try {
      const loaded = await tray.load(texture, ghost, { x, y, signal: current.signal })
      if (!loaded || disposed || operation !== current) return
      await requestInsert(
        { ...selected.item, albumKey: selected.item.albumKey && { ...selected.item.albumKey } },
        current.signal,
        () => {
          if (operation !== current) return
          operation = null
          sync()
        },
      )
    } catch {
      if (!current.signal.aborted && !disposed) feedback('装入未完成，请重试')
    } finally {
      if (operation === current) {
        operation = null
        ghost.hidden = true
        sync()
        if (!disposed && !current.signal.aborted && model?.playbackMessage)
          feedback(model.playbackMessage)
      }
    }
  }

  function loadSelected() {
    const selected = available()
    if (!selected || gesture || operation || device.getMode() !== 'machine') return
    const rect = canvas.getBoundingClientRect()
    void insert(
      selected.item.key,
      selected.texture,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    )
  }

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      const selected = available()
      if (event.button !== 0 || !selected || gesture || operation || device.getMode() !== 'machine')
        return
      const face = stage.inspect()
      if (!face?.settled || face.points.length < 3) return
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left,
        y = event.clientY - rect.top
      let inside = false
      for (let i = 0, j = face.points.length - 1; i < face.points.length; j = i++) {
        const a = face.points[i],
          b = face.points[j]
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
          inside = !inside
      }
      if (!inside) return
      event.preventDefault()
      event.stopImmediatePropagation()
      canvas.focus({ preventScroll: true })
      canvas.setPointerCapture(event.pointerId)
      const state = (gesture = {
        id: event.pointerId,
        key: selected.item.key,
        texture: selected.texture,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        active: false as boolean,
        timer: 0,
      })
      state.timer = window.setTimeout(() => {
        if (gesture !== state) return
        state.active = true
        ghost.getContext('2d')?.drawImage(state.texture, 0, 0, 96, 96)
        ghost.hidden = false
        position(state.x, state.y)
        sync()
        feedback('拖到 Mac 软盘槽，松手装入；Esc 取消')
      }, 320)
      sync()
    },
    { ...options, capture: true },
  )

  root.addEventListener(
    'pointermove',
    (event) => {
      const e = event as PointerEvent
      if (!gesture || e.pointerId !== gesture.id) return
      gesture.x = e.clientX
      gesture.y = e.clientY
      if (!gesture.active) {
        if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 10) cancel(false)
      } else position(e.clientX, e.clientY)
    },
    options,
  )
  root.addEventListener(
    'pointerup',
    (event) => {
      const e = event as PointerEvent,
        state = gesture
      if (!state || state.id !== e.pointerId) return
      const accepted = state.active && tray.hit(e.clientX, e.clientY)
      release()
      ghost.hidden = true
      if (accepted) void insert(state.key, state.texture, e.clientX, e.clientY)
      else {
        tray.reset()
        sync()
        if (state.active) feedback('未装入，封面已返回舞台')
      }
    },
    options,
  )
  canvas.addEventListener('pointercancel', () => cancel(), options)
  canvas.addEventListener(
    'lostpointercapture',
    () => {
      if (gesture) cancel()
    },
    options,
  )
  button.addEventListener('click', loadSelected, options)
  slot.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      loadSelected()
    },
    options,
  )
  slot.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        loadSelected()
      }
    },
    options,
  )
  window.addEventListener('blur', () => cancel(), options)
  window.addEventListener('resize', () => cancel(), options)
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) cancel()
    },
    options,
  )

  return {
    cancel,
    update(next: MacViewModel) {
      const before = available()
      const invalidated =
        model &&
        (model.selectedDate !== next.selectedDate ||
          model.selectedAlbumKey !== next.selectedAlbumKey)
      model = next
      const after = available()
      if (invalidated || !after || (before && before.texture !== after.texture)) cancel()
      else sync()
    },
    dispose() {
      disposed = true
      cancel(false)
      listeners.abort()
      tray.dispose()
    },
  }
}
