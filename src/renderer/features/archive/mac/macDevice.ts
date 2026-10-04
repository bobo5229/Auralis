import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import musicIcon from './icons/music.svg?raw'
import albumIcon from './icons/album.svg?raw'
import chartIcon from './icons/chart.svg?raw'
export interface MacDeviceOptions {
  onModeChange?: (mode: 'machine' | 'screen') => void
  onViewTransition?: (active: boolean) => void
  onGeometryChange?: () => void
  onEntrySelected?: (entryId: 'track' | 'album' | 'year') => void
  onDatePopupEsc?: () => boolean
  onCancelGesture?: () => boolean
}

export interface MacDeviceController {
  setMode(mode: 'machine' | 'screen'): void
  getMode(): 'machine' | 'screen'
  setBusy(busy: boolean): void
  setDesktopPage(page: 'desktop' | 'album'): void
  powerOn(): void
  powerOnMachine(): void
  inspect(): Record<string, unknown>
  drawCrt(): void
  dispose(): void
}

const ENTRY_ICONS: Record<string, string> = {
  music: musicIcon,
  album: albumIcon,
  chart: chartIcon,
}

export function mountMacDevice(
  root: ShadowRoot,
  options: MacDeviceOptions = {},
): MacDeviceController {
  const crt = root.getElementById('crt') as HTMLCanvasElement
  const crtLogicPlane = root.getElementById('crt-logic-plane') as HTMLElement
  const shell = root.getElementById('archive-mac-shell') as HTMLElement
  const studio = root.getElementById('studio') as HTMLElement
  const rig = root.getElementById('rig') as HTMLElement
  const glass = root.querySelector('.crt-glass') as HTMLElement
  const well = root.querySelector('.crt-well') as HTMLElement
  const crtBlank = root.getElementById('crt-blank') as HTMLElement
  const bezelReturn = root.getElementById('bezel-return') as HTMLButtonElement
  const bezelPower = root.getElementById('bezel-power') as HTMLButtonElement
  const bodyPower = root.getElementById('body-power') as HTMLButtonElement
  const entryButtons = root.querySelectorAll<HTMLButtonElement>('.crt-desktop-icon-btn')
  const crtClock = root.getElementById('crt-clock') as HTMLElement
  const crtFx = root.getElementById('crt-fx') as HTMLElement
  const noise = root.getElementById('crt-noise') as HTMLCanvasElement
  const listeners = new AbortController()
  const listenOptions = { signal: listeners.signal }

  const motion = createReducedMotionQuery()

  const VIEW_IN_MS = 1100
  const VIEW_OUT_MS = 700
  let mode: 'machine' | 'screen' = 'machine'
  let desktopPage: 'desktop' | 'album' = 'desktop'
  let crtPowered = true // Boot powered on for preview
  let selectedEntry: 'track' | 'album' | 'year' | null = null
  let entriesReady = false
  let operationBusy = false
  let pitch = -8
  let yaw = -23
  let drag: {
    id: number
    x: number
    y: number
    yaw: number
    pitch: number
    moved: boolean
  } | null = null

  let transitionGen = 0
  let viewAnimation: Animation | null = null
  let suppressDoubleClickUntil = 0
  let clockTimer: number | null = null
  let disposed = false
  let transitionRaf = 0
  let denoiseAnimation: Animation | null = null
  let noiseAnimation: Animation | null = null
  let noiseRaf = 0

  // Precompute tiny noise tiles once. Zoom only composites the DOM plane and fades noise.
  const noiseContext = noise.getContext('2d')
  const noiseTiles = Array.from({ length: 6 }, () => {
    const tile = noiseContext?.createImageData(64, 43)
    if (tile)
      for (let i = 0; i < tile.data.length; i += 4) {
        const v = Math.floor(Math.random() * 256)
        tile.data.set([v, v, v, 255], i)
      }
    return tile
  })
  function stopDenoise() {
    cancelAnimationFrame(noiseRaf)
    noiseRaf = 0
    denoiseAnimation?.cancel()
    noiseAnimation?.cancel()
    denoiseAnimation = noiseAnimation = null
    crtFx.style.opacity = '0'
  }
  function startDenoise(duration = VIEW_IN_MS) {
    stopDenoise()
    if (motion.matches || disposed) return
    denoiseAnimation = crtLogicPlane.animate(
      [
        { filter: 'blur(5px)', opacity: 0.35 },
        { filter: 'blur(2px)', opacity: 0.7, offset: 0.55 },
        { filter: 'blur(0px)', opacity: 1 },
      ],
      { duration, easing: 'ease-out' },
    )
    noiseAnimation = crtFx.animate([{ opacity: 0.8 }, { opacity: 0 }], {
      duration,
      easing: 'ease-out',
    })
    const start = performance.now()
    let lastTile = -1
    const frame = (time: number) => {
      if (disposed || time - start >= duration) {
        stopDenoise()
        return
      }
      const index = Math.floor((time - start) / 70) % noiseTiles.length
      if (index !== lastTile && noiseTiles[index]) {
        noiseContext?.putImageData(noiseTiles[index]!, 0, 0)
        lastTile = index
      }
      noiseRaf = requestAnimationFrame(frame)
    }
    noiseRaf = requestAnimationFrame(frame)
  }

  root.querySelectorAll<HTMLElement>('.crt-desktop-icon-glyph').forEach((glyph) => {
    const icon = ENTRY_ICONS[glyph.dataset.icon ?? '']
    if (icon) glyph.innerHTML = icon
  })

  function updateClock() {
    if (!crtClock) return
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    crtClock.textContent = `${hh}:${mm}`
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()
    if (clockTimer) window.clearTimeout(clockTimer)
    clockTimer = window.setTimeout(updateClock, Math.max(1000, msUntilNextMinute))
  }
  updateClock()

  function updateLogicPlaneScale() {
    if (!glass || !crtLogicPlane) return
    const glassStyle = getComputedStyle(glass)
    const gw =
      Number.parseFloat(glassStyle.width) -
      Number.parseFloat(glassStyle.borderLeftWidth) -
      Number.parseFloat(glassStyle.borderRightWidth)
    const gh =
      Number.parseFloat(glassStyle.height) -
      Number.parseFloat(glassStyle.borderTopWidth) -
      Number.parseFloat(glassStyle.borderBottomWidth)
    const scale = Math.min(gw / 512, gh / 342)
    const x = (gw - 512 * scale) / 2
    const y = (gh - 342 * scale) / 2
    crtLogicPlane.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
  }

  function layout() {
    if (!rig || !glass || !well || !studio) return
    const focused = mode === 'screen'
    const frontW = rig.offsetWidth
    const depth = Number.parseFloat(getComputedStyle(rig).getPropertyValue('--d'))
    const hostW = studio.clientWidth || window.innerWidth
    const hostH = studio.clientHeight || window.innerHeight

    let scale = focused
      ? Math.min((hostW - 48) / frontW, (hostH - 40) / glass.offsetHeight)
      : Math.min((studio.clientWidth - 48) / 560, (studio.clientHeight - 36) / 620, 1.15)

    if (focused) {
      const dpr = window.devicePixelRatio || 1
      scale = Math.max(
        1 / glass.offsetWidth,
        Math.floor(glass.offsetWidth * scale * dpr) / (glass.offsetWidth * dpr),
      )
    }

    const centerX = well.offsetLeft + glass.offsetLeft + glass.offsetWidth / 2
    const centerY = well.offsetTop + glass.offsetTop + glass.offsetHeight / 2

    rig.style.setProperty('--zoom', String(scale))
    // Match the demo's 19% left inset while reserving room for manual rotation.
    const machineCenterX = Math.max(24 + 280 * scale, hostW * 0.19 + (frontW * scale) / 2)
    rig.style.setProperty(
      '--move-x',
      `${focused ? (frontW / 2 - centerX) * scale : machineCenterX - hostW / 2}px`,
    )
    rig.style.setProperty(
      '--move-y',
      `${focused ? (rig.offsetHeight / 2 - centerY) * scale : -42}px`,
    )
    rig.style.setProperty('--move-z', `${focused ? -(depth / 2 + 1) * scale : 0}px`)
    rig.style.setProperty('--tilt-x', `${focused ? 0 : pitch}deg`)
    rig.style.setProperty('--tilt-y', `${yaw}deg`)

    updateLogicPlaneScale()
  }

  function drawCrt() {
    if (!crt) return
    const c = crt.getContext('2d')
    if (!c) return
    c.fillStyle = '#f3eee0'
    c.fillRect(0, 0, 512, 342)

    // Dot grid pattern
    c.fillStyle = '#dbd6c6'
    for (let y = 0; y < 342; y += 4) {
      for (let x = 0; x < 512; x += 4) {
        c.fillRect(x, y, 1, 1)
      }
    }
  }

  function setBlank(val: number) {
    if (crtBlank) crtBlank.style.opacity = String(val)
  }

  function syncBezel() {
    if (bezelReturn) {
      bezelReturn.disabled = mode !== 'screen'
      bezelReturn.tabIndex = mode === 'screen' ? 0 : -1
    }
    if (bezelPower) {
      bezelPower.disabled = mode !== 'screen' || crtPowered
      bezelPower.setAttribute('aria-pressed', String(crtPowered))
    }
    if (bodyPower) {
      bodyPower.disabled = mode !== 'machine'
      bodyPower.setAttribute('aria-pressed', String(crtPowered))
    }
  }

  function setEntriesReady(ready: boolean) {
    entriesReady = ready
    crtLogicPlane.inert = mode !== 'screen' || !ready
    entryButtons.forEach((btn) => {
      btn.disabled = !ready
    })
  }

  function setDesktopPage(page: 'desktop' | 'album') {
    desktopPage = page
    if (glass) {
      glass.classList.toggle('mac-album-open', page === 'album')
    }
    selectedEntry = page === 'album' ? 'album' : null
    entryButtons.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.entry === selectedEntry))
    })
  }

  function selectEntry(id: 'track' | 'album' | 'year') {
    setDesktopPage(id === 'album' ? 'album' : 'desktop')
    selectedEntry = id
    entryButtons.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.entry === id))
    })
    options.onEntrySelected?.(id)
  }

  function setMode(next: 'machine' | 'screen') {
    if (mode === next || disposed) return
    endDrag()
    const before = getComputedStyle(rig).transform
    const gen = ++transitionGen
    cancelAnimationFrame(transitionRaf)
    stopDenoise()
    viewAnimation?.cancel()
    viewAnimation = null

    options.onViewTransition?.(true)
    mode = next
    if (next === 'machine') pitch = -8
    yaw = Math.round(yaw / 360) * 360 + (next === 'machine' ? -23 : 0)

    rig.classList.add('is-transitioning')
    shell.classList.toggle('is-screen-focused', next === 'screen')
    studio.classList.toggle('screen-mode', next === 'screen')
    options.onModeChange?.(next)
    rig.tabIndex = next === 'screen' ? -1 : 0

    if (next === 'screen' && motion.matches) crtPowered = true
    setEntriesReady(false)
    if (next === 'screen') drawCrt()
    setBlank(crtPowered ? 0 : 1)
    layout()
    const after = getComputedStyle(rig).transform

    syncBezel()
    if (next === 'screen') bezelReturn?.focus({ preventScroll: true })
    else rig.focus({ preventScroll: true })

    const duration = motion.matches ? 0 : next === 'screen' ? VIEW_IN_MS : VIEW_OUT_MS
    const followTick = () => {
      options.onGeometryChange?.()
      transitionRaf = requestAnimationFrame(followTick)
    }
    transitionRaf = requestAnimationFrame(followTick)
    if (next === 'screen') startDenoise(duration)

    const animation = rig.animate([{ transform: before }, { transform: after }], {
      duration,
      easing: next === 'screen' ? 'cubic-bezier(0.4, 0, 0.2, 1)' : 'cubic-bezier(0.16, 1, 0.3, 1)',
    })
    viewAnimation = animation

    animation.finished
      .then(() => {
        if (disposed || gen !== transitionGen) return
        cancelAnimationFrame(transitionRaf)
        transitionRaf = 0
        options.onGeometryChange?.()
        if (gen !== transitionGen || viewAnimation !== animation) return
        viewAnimation = null
        rig.classList.remove('is-transitioning')
        options.onViewTransition?.(false)

        if (next === 'screen') {
          crtPowered = true
          setBlank(0)
          syncBezel()
          setEntriesReady(true)
        } else {
          setBlank(crtPowered ? 0 : 1)
          syncBezel()
        }
      })
      .catch(() => {
        if (gen === transitionGen) cancelAnimationFrame(transitionRaf)
      })
  }

  function endDrag(event?: PointerEvent) {
    if (!drag || (event && event.pointerId !== drag.id)) return
    const ended = drag
    drag = null
    rig.classList.remove('is-dragging')
    if (rig.hasPointerCapture(ended.id)) rig.releasePointerCapture(ended.id)
    if (ended.moved) suppressDoubleClickUntil = performance.now() + 400
  }

  // Pointer & Double Click Interactions on Rig
  rig.addEventListener(
    'dblclick',
    (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (
        !target.closest('button, select, .terminal-ui, .floppy') &&
        event.button === 0 &&
        performance.now() >= suppressDoubleClickUntil
      ) {
        event.preventDefault()
        setMode('screen')
      }
    },
    listenOptions,
  )

  rig.addEventListener(
    'pointerdown',
    (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (
        event.button !== 0 ||
        mode !== 'machine' ||
        operationBusy ||
        Boolean(viewAnimation) ||
        drag ||
        target.closest('button, select, .terminal-ui, .floppy')
      )
        return
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        yaw,
        pitch,
        moved: false,
      }
      rig.setPointerCapture(event.pointerId)
      rig.classList.add('is-dragging')
      event.preventDefault()
    },
    listenOptions,
  )

  rig.addEventListener(
    'pointermove',
    (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < 4) return
      drag.moved = true
      yaw = drag.yaw + dx * 0.45
      // The replacement chassis has no underside; keep the camera above its base.
      pitch = Math.max(-45, Math.min(-4, drag.pitch - dy * 0.3))
      rig.style.setProperty('--tilt-y', `${yaw}deg`)
      rig.style.setProperty('--tilt-x', `${pitch}deg`)
      options.onGeometryChange?.()
    },
    listenOptions,
  )

  rig.addEventListener('pointerup', endDrag, listenOptions)
  rig.addEventListener('pointercancel', endDrag, listenOptions)
  rig.addEventListener('lostpointercapture', endDrag, listenOptions)

  rig.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      if (event.target !== rig) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        setMode('screen')
      }
    },
    listenOptions,
  )

  // Entry buttons
  entryButtons.forEach((btn) => {
    btn.addEventListener(
      'click',
      (e) => {
        e.stopPropagation()
        const entryId = btn.dataset.entry as 'track' | 'album' | 'year'
        if (entryId) selectEntry(entryId)
      },
      listenOptions,
    )
  })

  // Bezel buttons
  bezelReturn.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      setMode('machine')
    },
    listenOptions,
  )
  bezelPower.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      crtPowered = true
      setBlank(0)
      syncBezel()
      startDenoise()
    },
    listenOptions,
  )
  bodyPower.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      crtPowered = true
      drawCrt()
      setBlank(0)
      syncBezel()
      startDenoise()
    },
    listenOptions,
  )

  // Keyboard navigation & Esc handling
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      // Priority 1: Date popup closes
      if (options.onDatePopupEsc?.()) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      // Priority 2: Cancel pending drag or insertion
      if (options.onCancelGesture?.()) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      // Priority 3: Exit screen focus back to machine
      if (mode === 'screen') {
        event.preventDefault()
        event.stopPropagation()
        setMode('machine')
      }
    }
  }

  const handleResize = () => {
    endDrag()
    layout()
  }

  const handleVisibility = () => {
    if (!document.hidden) {
      updateClock()
      layout()
    }
  }

  root.addEventListener('keydown', handleKeydown as EventListener, listenOptions)
  motion.addEventListener(
    'change',
    () => {
      if (motion.matches) {
        stopDenoise()
        viewAnimation?.finish()
      }
    },
    listenOptions,
  )
  window.addEventListener('resize', handleResize)
  document.addEventListener('visibilitychange', handleVisibility)

  const resizeObserver = new ResizeObserver(() => {
    if (mode === 'machine' && !drag && !viewAnimation) layout()
  })
  resizeObserver.observe(studio)

  drawCrt()
  layout()
  syncBezel()
  setEntriesReady(false)

  return {
    setMode,
    getMode: () => mode,
    setBusy: (busy: boolean) => {
      operationBusy = busy
      if (operationBusy) endDrag()
    },
    setDesktopPage,
    powerOn: () => {
      crtPowered = true
      setBlank(0)
      syncBezel()
    },
    powerOnMachine: () => {
      crtPowered = true
      drawCrt()
      setBlank(0)
      syncBezel()
    },
    inspect: () => ({
      mode,
      yaw,
      pitch,
      powered: crtPowered,
      entriesReady,
      busy: Boolean(viewAnimation),
      operationBusy,
      desktopPage,
    }),
    drawCrt,
    dispose: () => {
      disposed = true
      listeners.abort()
      endDrag()
      stopDenoise()
      cancelAnimationFrame(transitionRaf)
      if (clockTimer) window.clearTimeout(clockTimer)
      transitionGen++
      viewAnimation?.cancel()
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibility)
    },
  }
}
