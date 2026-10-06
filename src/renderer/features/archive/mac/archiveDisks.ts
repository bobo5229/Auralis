import { uiText, i18n } from '@renderer/i18n'
import type { DailyAlbumStatsItem } from '@shared/types/archive'
import { formatArchiveMinutes } from '../utils/archiveDailyDetailState'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import type { ArtworkPalette } from '@renderer/features/playback/types'
import {
  getArtworkPalette,
  peekArtworkPalette,
} from '@renderer/features/playback/composables/useArtworkPalette'

/** View-only physical media. Loading a disk never issues a playback command. */
export function mountArchiveDisks(
  root: ShadowRoot,
  select: (key: string) => void,
  artwork: (node: HTMLElement, key: string | null) => void,
) {
  const shell = root.getElementById('archive-mac-shell')!
  const deck = root.getElementById('album-list')!
  const slot = root.querySelector<HTMLElement>('.floppy')!
  const eject = root.getElementById('disk-eject') as HTMLButtonElement
  const status = root.getElementById('disk-status')!
  const motion = createReducedMotionQuery()
  const abort = new AbortController()
  const opts = { signal: abort.signal }
  const nodes = new Map<string, HTMLButtonElement>()
  let statusMessage: { key: string; title?: string } | null = null
  function renderStatus() {
    status.textContent = statusMessage
      ? uiText(statusMessage.key, { title: statusMessage.title })
      : ''
  }
  let items: DailyAlbumStatsItem[] = []
  let selected = ''
  let loaded = ''
  let date: string | null = null
  let ghost: HTMLElement | null = null
  let dock: HTMLElement | null = null
  let animation: Animation | null = null
  let busy = false
  let generation = 0
  let suppressClick = 0
  let drag: { id: number; key: string; x: number; y: number; moved: boolean } | null = null
  shell.dataset.diskReduced = String(motion.matches)

  function mirror() {
    const item = items.find((entry) => entry.key === loaded)
    const art = root.getElementById('crt-preview-art')!
    if (item) artwork(art, item.artworkCacheKey)
    else art.replaceChildren()
    root.getElementById('crt-record')!.dataset.loaded = String(Boolean(item))
    root.getElementById('crt-record-date')!.textContent = date ?? ''
    const title = root.getElementById('crt-preview-title')!
    title.textContent = item ? item.title || uiText('library.missing.album') : ''
    title.title = title.textContent
    const artist = root.getElementById('crt-preview-artist')!
    artist.textContent = item ? item.artist || uiText('library.missing.artist') : ''
    artist.title = artist.textContent
    root.getElementById('crt-record-plays')!.textContent = item
      ? uiText(
          'library.playCount',
          { count: item.playCount.toLocaleString(i18n.global.locale.value) },
          item.playCount,
        )
      : ''
    root.getElementById('crt-record-duration')!.textContent = item
      ? formatArchiveMinutes(item.durationSeconds)
      : ''
    slot.classList.toggle('disk-loaded', Boolean(item))
  }

  function layout() {
    const front = items.findIndex((item) => item.key === selected)
    items.forEach((item, index) => {
      const node = nodes.get(item.key)
      if (!node) return
      node.setAttribute('aria-pressed', String(index === front))
      node.classList.toggle('is-loaded', item.key === loaded)
      node.classList.toggle(
        'is-away',
        item.key === loaded || (busy && node.dataset.key === ghost?.dataset.key),
      )
      node.disabled = busy || item.key === loaded
    })
    eject.hidden = !loaded
    eject.disabled = busy
    deck.setAttribute('aria-busy', String(busy))
  }

  function removeGhost() {
    animation?.cancel()
    animation = null
    ghost?.remove()
    ghost = null
    dock?.remove()
    dock = null
    slot.classList.remove('disk-target')
  }

  function release() {
    const id = drag?.id
    drag = null
    if (id !== undefined && deck.hasPointerCapture(id)) deck.releasePointerCapture(id)
  }

  function cancel() {
    generation++
    release()
    removeGhost()
    busy = false
    for (const node of nodes.values()) node.classList.remove('is-dragging')
    layout()
  }

  function makeGhost(key: string) {
    const node = nodes.get(key)!
    const rect = node.getBoundingClientRect()
    const base = shell.getBoundingClientRect()
    const clone = node.cloneNode(true) as HTMLElement
    clone.className = 'disk-media disk-ghost'
    clone.removeAttribute('aria-pressed')
    clone.setAttribute('aria-hidden', 'true')
    clone.setAttribute('tabindex', '-1')
    clone.removeAttribute('disabled')
    clone.style.cssText = `left:${rect.left - base.left}px;top:${rect.top - base.top}px;width:${rect.width}px;height:${rect.height}px;`
    shell.append(clone)
    ghost = clone
    return clone
  }

  function near(x: number, y: number) {
    const rect = slot.getBoundingClientRect()
    return (
      x >= rect.left - 42 && x <= rect.right + 42 && y >= rect.top - 48 && y <= rect.bottom + 48
    )
  }

  async function transfer(key: string, returning = false) {
    if (busy || shell.dataset.scene !== 'ready' || !nodes.has(key)) return
    busy = true
    const token = ++generation
    const fly = ghost ?? makeGhost(key)
    const origin = fly.getBoundingClientRect()
    // The disk's top edge (metal shutter) meets the mouth of the drive. Its
    // positive local Y points out of the Mac; negative Y slides into it.
    const mount = document.createElement('div')
    mount.className = 'disk-dock'
    mount.setAttribute('aria-hidden', 'true')
    slot.append(mount)
    dock = mount
    const media = fly.cloneNode(true) as HTMLElement
    media.className = 'disk-media disk-in-slot'
    media.removeAttribute('style')
    media.style.visibility = 'hidden'
    mount.append(media)

    // Use one perspective camera for the whole flight. Only rigid rotations,
    // translation and uniform scale are animated; never interpolate a homography.
    const studio = root.getElementById('studio')!
    const rig = root.getElementById('rig')!
    const front = root.querySelector<HTMLElement>('.face.front')!
    const studioBounds = studio.getBoundingClientRect()
    const rigStyle = getComputedStyle(rig)
    const [ox, oy] = rigStyle.transformOrigin.split(' ').map(Number.parseFloat)
    const rigMatrix = new DOMMatrix()
      .translate(rig.offsetLeft + ox, rig.offsetTop + oy)
      .multiply(new DOMMatrix(rigStyle.transform))
      .translate(-ox, -oy)
    const frontDepth = new DOMMatrix(getComputedStyle(front).transform).m43
    const diskWidth = Number.parseFloat(getComputedStyle(mount).width)
    const end = rigMatrix.transformPoint(
      new DOMPoint(
        slot.offsetLeft + slot.clientWidth / 2,
        slot.offsetTop + slot.clientHeight / 2,
        frontDepth + diskWidth / 2,
      ),
    )
    const size = nodes.get(key)!.offsetWidth
    const start = {
      x: origin.left + origin.width / 2 - studioBounds.left,
      y: origin.top + origin.height / 2 - studioBounds.top,
      z: 0,
    }
    const startScale = Math.max(origin.width, origin.height) / size
    const zoom = Number.parseFloat(rigStyle.getPropertyValue('--zoom')) || 1
    const endScale = (diskWidth / size) * zoom
    const pitch = Number.parseFloat(rigStyle.getPropertyValue('--tilt-x')) || 0
    const rawYaw = Number.parseFloat(rigStyle.getPropertyValue('--tilt-y')) || 0
    const yaw = ((((rawYaw + 180) % 360) + 360) % 360) - 180
    studio.append(fly)
    fly.style.left = '0'
    fly.style.top = '0'
    fly.style.width = `${size}px`
    fly.style.height = `${size}px`
    fly.style.transformOrigin = '50% 50%'
    const pose = (t: number, lift = 0) => {
      const x = start.x + (end.x - start.x) * t - size / 2
      const y = start.y + (end.y - start.y) * t - size / 2 - lift
      const scale = startScale + (endScale - startScale) * t
      return `translate3d(${x}px,${y}px,${end.z * t}px) rotateX(${pitch * t}deg) rotateY(${-12 + (yaw + 12) * t}deg) rotateX(${90 * t}deg) scale(${scale})`
    }
    const flight: Keyframe[] = [
      { transform: pose(0), offset: 0 },
      { transform: pose(0.6, Math.min(28, size * 0.1)), offset: 0.5 },
      { transform: pose(1), offset: 1 },
    ]
    // Keep the same media geometry at handoff (including label typography).
    const localScale = diskWidth / size
    media.style.width = `${size}px`
    media.style.height = `${size}px`
    media.style.transformOrigin = '0 0'
    media.style.transform = `scale(${localScale})`
    const slide: Keyframe[] = [
      { transform: `scale(${localScale}) translateY(0%)`, clipPath: 'inset(0% 0 0 0)' },
      { transform: `scale(${localScale}) translateY(-100%)`, clipPath: 'inset(100% 0 0 0)' },
    ]
    slot.classList.add('disk-target')
    nodes.get(key)!.classList.add('is-dragging')
    layout()
    async function play(element: HTMLElement, frames: Keyframe[], duration: number) {
      if (token !== generation) return false
      if (motion.matches) return true
      animation = element.animate(frames, {
        duration,
        easing: 'cubic-bezier(.3,0,.2,1)',
        direction: returning ? 'reverse' : 'normal',
        fill: 'both',
      })
      try {
        await animation.finished
      } catch {
        return false
      }
      return token === generation
    }
    if (returning) {
      fly.style.visibility = 'hidden'
      media.style.visibility = 'visible'
      if (!(await play(media, slide, 380))) return
      media.style.visibility = 'hidden'
      fly.style.visibility = 'visible'
      if (!(await play(fly, flight, 480))) return
    } else {
      if (!(await play(fly, flight, 560))) return
      fly.style.visibility = 'hidden'
      media.style.visibility = 'visible'
      if (!(await play(media, slide, 440))) return
    }
    if (token !== generation) return
    loaded = returning ? '' : key
    busy = false
    removeGhost()
    nodes.get(key)?.classList.remove('is-dragging')
    mirror()
    layout()
    statusMessage = returning
      ? { key: 'archive.mac.returned' }
      : {
          key: 'archive.mac.loadedTitle',
          title: items.find((item) => item.key === key)?.title || uiText('library.missing.album'),
        }
    renderStatus()
    if (returning) nodes.get(key)?.focus({ preventScroll: true })
    else eject.focus({ preventScroll: true })
  }

  async function load(key: string) {
    if (busy || loaded === key) return
    // A second disk cannot enter an occupied drive. Return the first one first.
    if (loaded) {
      removeGhost()
      const token = generation
      await transfer(loaded, true)
      if (generation !== token + 1 || loaded) return
    }
    await transfer(key)
  }

  deck.addEventListener(
    'click',
    (event) => {
      if (busy || performance.now() < suppressClick) return
      const key = (event.target as HTMLElement).closest<HTMLElement>('.disk-media')?.dataset.key
      if (key) select(key)
    },
    opts,
  )
  deck.addEventListener(
    'dblclick',
    (event) => {
      if (performance.now() < suppressClick) return
      const key = (event.target as HTMLElement).closest<HTMLElement>('.disk-media')?.dataset.key
      if (key) {
        event.preventDefault()
        void load(key)
      }
    },
    opts,
  )
  deck.addEventListener(
    'keydown',
    (event) => {
      const key = (event.target as HTMLElement).closest<HTMLElement>('.disk-media')?.dataset.key
      if (!key || busy) return
      if (event.key === 'Enter') {
        event.preventDefault()
        select(key)
        void load(key)
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const available = items.filter((item) => item.key !== loaded)
        const index = available.findIndex((item) => item.key === key)
        const next =
          available[
            (index + (event.key === 'ArrowLeft' ? -1 : 1) + available.length) % available.length
          ]
        select(next.key)
        nodes.get(next.key)?.focus({ preventScroll: true })
      }
    },
    opts,
  )
  deck.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0 || busy || drag || shell.dataset.scene !== 'ready') return
      const key = (event.target as HTMLElement).closest<HTMLElement>('.disk-media')?.dataset.key
      if (!key || key === loaded) return
      drag = { id: event.pointerId, key, x: event.clientX, y: event.clientY, moved: false }
    },
    opts,
  )
  deck.addEventListener(
    'pointerleave',
    () => {
      if (drag && !drag.moved) release()
    },
    opts,
  )
  deck.addEventListener(
    'pointermove',
    (event) => {
      if (!drag || event.pointerId !== drag.id) return
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < 7) return
      if (!drag.moved) {
        drag.moved = true
        makeGhost(drag.key)
        nodes.get(drag.key)?.classList.add('is-dragging')
        deck.setPointerCapture(event.pointerId)
      }
      ghost!.style.transform = `translate(${dx}px,${dy}px) rotate(-5deg)`
      slot.classList.toggle('disk-target', near(event.clientX, event.clientY))
    },
    opts,
  )
  deck.addEventListener(
    'pointerup',
    (event) => {
      if (!drag || event.pointerId !== drag.id) return
      const { key, moved } = drag
      const hit = near(event.clientX, event.clientY)
      release()
      if (!moved) return
      suppressClick = performance.now() + 400
      if (hit) {
        // Bake the dragged position into its origin before starting the flight.
        const rect = ghost!.getBoundingClientRect(),
          base = shell.getBoundingClientRect()
        ghost!.style.left = `${rect.left - base.left}px`
        ghost!.style.top = `${rect.top - base.top}px`
        ghost!.style.transform = ''
        select(key)
        void load(key)
      } else cancel()
    },
    opts,
  )
  for (const type of ['pointercancel', 'lostpointercapture'])
    deck.addEventListener(
      type,
      () => {
        if (drag) cancel()
      },
      opts,
    )
  root.addEventListener(
    'keydown',
    (event) => {
      if ((event as KeyboardEvent).key === 'Escape' && (drag || busy)) cancel()
    },
    opts,
  )
  window.addEventListener(
    'blur',
    () => {
      if (drag || busy) cancel()
    },
    opts,
  )
  window.addEventListener(
    'resize',
    () => {
      if (drag || busy) cancel()
    },
    opts,
  )
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden && (drag || busy)) cancel()
    },
    opts,
  )
  motion.addEventListener(
    'change',
    () => {
      shell.dataset.diskReduced = String(motion.matches)
      if (motion.matches) {
        if (drag) cancel()
        else animation?.finish()
      }
    },
    opts,
  )
  eject.addEventListener(
    'click',
    () => {
      void transfer(loaded, true)
    },
    opts,
  )

  return {
    setVisible(visible: boolean) {
      if (!visible && (drag || busy)) cancel()
    },
    refreshLocale() {
      for (const item of items) {
        const node = nodes.get(item.key)
        if (!node) continue
        node.title = `${item.title || uiText('library.missing.album')} — ${item.artist || uiText('library.missing.artist')}`
        node.setAttribute('aria-label', uiText('archive.mac.insertAria', { title: node.title }))
        const title = node.querySelector('.disk-title')
        if (title) title.textContent = item.title || uiText('library.missing.album')
        const artist = node.querySelector('.disk-artist')
        if (artist) artist.textContent = item.artist || uiText('library.missing.artist')
        const playsPill = node.querySelector<HTMLElement>('.disk-pill-plays')
        if (playsPill) {
          playsPill.textContent = item.playCount
            ? uiText(
                'library.playCount',
                { count: item.playCount.toLocaleString(i18n.global.locale.value) },
                item.playCount,
              )
            : ''
        }
        const durPill = node.querySelector<HTMLElement>('.disk-pill-duration')
        if (durPill) {
          durPill.textContent = item.durationSeconds
            ? formatArchiveMinutes(item.durationSeconds)
            : ''
        }
      }
      mirror()
      layout()
      renderStatus()
    },
    reset() {
      cancel()
      loaded = ''
      suppressClick = 0
      statusMessage = null
      renderStatus()
      mirror()
      layout()
    },
    update(next: DailyAlbumStatsItem[], key: string | null, nextDate: string | null) {
      const sanitizedNext = next.slice(0, 10)
      const changed = date !== nextDate || JSON.stringify(items) !== JSON.stringify(sanitizedNext)
      if (changed) {
        cancel()
        if (date !== nextDate || !sanitizedNext.some((item) => item.key === loaded)) loaded = ''
        date = nextDate
        items = sanitizedNext
        const focused = (root.activeElement as HTMLElement | null)?.dataset.key
        deck.replaceChildren()
        nodes.clear()
        for (const item of items) {
          const node = createDiskNode(item, artwork)
          nodes.set(item.key, node)
          deck.append(node)
        }
        if (items.length > 0) {
          const emptyCount = Math.max(0, 10 - items.length)
          for (let i = 0; i < emptyCount; i++) {
            const bay = document.createElement('div')
            bay.className = 'disk-bay-empty'
            bay.setAttribute('aria-hidden', 'true')
            deck.append(bay)
          }
        }
        if (focused) nodes.get(focused)?.focus({ preventScroll: true })
        statusMessage = null
        renderStatus()
        mirror()
      }
      selected = key && nodes.has(key) ? key : (items[0]?.key ?? '')
      layout()
    },
    dispose() {
      abort.abort()
      cancel()
      nodes.clear()
    },
  }
}

function updateColorBarGradient(bar: HTMLElement, palette: ArtworkPalette): void {
  const c1 = palette.accents[0]?.rgb ?? palette.dominant ?? palette.background
  const c2 = palette.accents[1]?.rgb ??
    palette.dominant ?? {
      r: Math.min(255, c1.r + 30),
      g: Math.min(255, c1.g + 30),
      b: Math.min(255, c1.b + 30),
    }
  bar.style.background = `linear-gradient(90deg, rgb(${c1.r}, ${c1.g}, ${c1.b}) 0%, rgb(${c2.r}, ${c2.g}, ${c2.b}) 100%)`
}

function applyDiskColorBar(bar: HTMLElement, cacheKey: string | null): void {
  if (!cacheKey) {
    bar.style.background = 'linear-gradient(90deg, #2a7f8c 0%, #3df0ff 65%, #9aefe7 100%)'
    return
  }
  const cached = peekArtworkPalette(cacheKey)
  if (cached) {
    updateColorBarGradient(bar, cached)
    return
  }
  getArtworkPalette(cacheKey)
    .then((palette) => {
      updateColorBarGradient(bar, palette)
    })
    .catch(() => {
      bar.style.background = 'linear-gradient(90deg, #2a7f8c 0%, #3df0ff 65%, #9aefe7 100%)'
    })
}

function createDiskNode(
  item: DailyAlbumStatsItem,
  artwork: (node: HTMLElement, key: string | null) => void,
): HTMLButtonElement {
  const node = document.createElement('button')
  node.type = 'button'
  node.className = 'disk-media'
  node.dataset.key = item.key
  node.title = `${item.title || uiText('library.missing.album')} — ${item.artist || uiText('library.missing.artist')}`
  node.setAttribute('aria-label', uiText('archive.mac.insertAria', { title: node.title }))

  // 1. Extrusion Slices (9 slices covering 8px gapless physical 2.5D thickness)
  const extrusion = document.createElement('span')
  extrusion.className = 'disk-extrusion'
  extrusion.setAttribute('aria-hidden', 'true')
  for (let z = -4; z <= 4; z++) {
    const slice = document.createElement('span')
    slice.className = z === 0 ? 'disk-slice is-parting-line' : 'disk-slice'
    slice.style.transform = `translateZ(${z}px)`
    extrusion.append(slice)
  }

  // 2. Internal Optical Depth (Mylar platter & spindle hub)
  const internal = document.createElement('span')
  internal.className = 'disk-internal'
  internal.setAttribute('aria-hidden', 'true')
  const mylar = document.createElement('span')
  mylar.className = 'disk-mylar'
  const spindle = document.createElement('span')
  spindle.className = 'disk-spindle'
  const spindleHole = document.createElement('span')
  spindleHole.className = 'disk-spindle-hole'
  spindle.append(spindleHole)
  internal.append(mylar, spindle)

  // 3. Front Face Cap (Z = +4px)
  const front = document.createElement('span')
  front.className = 'disk-face-front'
  front.setAttribute('aria-hidden', 'true')

  const moldBevel = document.createElement('span')
  moldBevel.className = 'disk-mold-bevel'

  const cavity = document.createElement('span')
  cavity.className = 'disk-label-cavity'

  const label = document.createElement('span')
  label.className = 'disk-label'

  const colorBar = document.createElement('span')
  colorBar.className = 'disk-label-bar'
  applyDiskColorBar(colorBar, item.artworkCacheKey)

  const content = document.createElement('span')
  content.className = 'disk-label-content'

  const cover = document.createElement('span')
  cover.className = 'disk-cover'
  artwork(cover, item.artworkCacheKey)

  const meta = document.createElement('span')
  meta.className = 'disk-meta'

  const title = document.createElement('span')
  title.className = 'disk-title'
  title.textContent = item.title || uiText('library.missing.album')

  const artist = document.createElement('span')
  artist.className = 'disk-artist'
  artist.textContent = item.artist || uiText('library.missing.artist')

  const stats = document.createElement('span')
  stats.className = 'disk-stats'

  if (item.playCount) {
    const playsPill = document.createElement('span')
    playsPill.className = 'disk-pill disk-pill-plays'
    playsPill.textContent = uiText(
      'library.playCount',
      { count: item.playCount.toLocaleString(i18n.global.locale.value) },
      item.playCount,
    )
    stats.append(playsPill)
  }

  if (item.durationSeconds) {
    const durPill = document.createElement('span')
    durPill.className = 'disk-pill disk-pill-duration'
    durPill.textContent = formatArchiveMinutes(item.durationSeconds)
    stats.append(durPill)
  }

  meta.append(title, artist, stats)
  content.append(cover, meta)
  label.append(colorBar, content)
  cavity.append(label)

  const holeHd = document.createElement('span')
  holeHd.className = 'disk-hole-hd'
  const holeWp = document.createElement('span')
  holeWp.className = 'disk-hole-wp'
  const wpSlider = document.createElement('span')
  wpSlider.className = 'disk-wp-slider'
  holeWp.append(wpSlider)

  front.append(moldBevel, cavity, holeHd, holeWp)

  // 4. Shutter Assembly
  const shutter = document.createElement('span')
  shutter.className = 'disk-shutter'
  shutter.setAttribute('aria-hidden', 'true')

  const bridge = document.createElement('span')
  bridge.className = 'disk-shutter-bridge'

  const leaf = document.createElement('span')
  leaf.className = 'disk-shutter-leaf'

  const arrow = document.createElement('span')
  arrow.className = 'disk-shutter-arrow'

  const ribs = document.createElement('span')
  ribs.className = 'disk-shutter-ribs'

  const win = document.createElement('span')
  win.className = 'disk-shutter-window'
  const ref = document.createElement('span')
  ref.className = 'disk-shutter-reflection'
  win.append(ref)

  leaf.append(arrow, ribs, win)
  shutter.append(bridge, leaf)

  // 5. Back Face Cap (Z = -4px)
  const back = document.createElement('span')
  back.className = 'disk-face-back'
  back.setAttribute('aria-hidden', 'true')

  const rotor = document.createElement('span')
  rotor.className = 'disk-back-rotor'
  const rotorSlot = document.createElement('span')
  rotorSlot.className = 'disk-rotor-slot'
  rotor.append(rotorSlot)

  const backHoleHd = document.createElement('span')
  backHoleHd.className = 'disk-hole-hd'
  backHoleHd.style.cssText = 'left:auto;right:7%;'

  const backHoleWp = document.createElement('span')
  backHoleWp.className = 'disk-hole-wp'
  backHoleWp.style.cssText = 'right:auto;left:7%;'
  const backWpSlider = document.createElement('span')
  backWpSlider.className = 'disk-wp-slider'
  backHoleWp.append(backWpSlider)

  back.append(rotor, backHoleHd, backHoleWp)

  node.append(extrusion, internal, front, shutter, back)
  return node
}
