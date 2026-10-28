/* Original illustrative albums, entirely local. No library access, IPC or audio playback. */
;(() => {
  'use strict'

  const albums = [
    {
      title: '蓝色时分',
      english: 'BLUE HOURS',
      artist: '北岸电台',
      paper: '#24506b',
      ink: '#f5e7cb',
      accent: '#d99159',
      art: 'arcs',
    },
    {
      title: '短暂的夏天',
      english: 'BORROWED SUMMER',
      artist: '榆木慢跑',
      paper: '#c35945',
      ink: '#fff0cd',
      accent: '#edbd6d',
      art: 'stripes',
    },
    {
      title: '回声与尘埃',
      english: 'ECHO / DUST',
      artist: 'Mild Hours',
      paper: '#a7b4a0',
      ink: '#22352e',
      accent: '#e2dfc9',
      art: 'orbit',
    },
    {
      title: '夜航',
      english: 'NIGHT TRANSIT',
      artist: '暗房旅人',
      paper: '#542b3b',
      ink: '#f0c8ba',
      accent: '#b95a62',
      art: 'type',
    },
    {
      title: '无人的房间',
      english: 'EMPTY ROOMS',
      artist: '顾野',
      paper: '#e7dfcc',
      ink: '#354c59',
      accent: '#798e9b',
      art: 'frames',
    },
    {
      title: '低空飞行',
      english: 'LOW ALTITUDE',
      artist: '白日航线',
      paper: '#272829',
      ink: '#ede6d5',
      accent: '#b0aaa0',
      art: 'bands',
    },
    {
      title: '山的另一面',
      english: 'OTHER SIDE',
      artist: '木与石',
      paper: '#3c584c',
      ink: '#e3ddbf',
      accent: '#c49660',
      art: 'stripes',
    },
    {
      title: '失重的星期天',
      english: 'SUNDAY GRAVITY',
      artist: 'Paper Boats',
      paper: '#c6a357',
      ink: '#332d2c',
      accent: '#efe3ba',
      art: 'orbit',
    },
    {
      title: '慢慢消失',
      english: 'FADE SLOWLY',
      artist: '余音',
      paper: '#b4c5cb',
      ink: '#304957',
      accent: '#9a4d42',
      art: 'grid',
    },
  ]

  const viewport = document.querySelector('#viewport')
  const row = document.querySelector('#album-row')
  const info = document.querySelector('#album-info')
  const title = document.querySelector('#album-title')
  const artist = document.querySelector('#album-artist')
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  let active = null
  let inputMode = 'pointer'
  let lastPointerType = 'mouse'
  let touchWasActive = false
  let pointerFrame = 0
  let lastPoint = null

  function cover(album, index) {
    let artwork = ''
    const accent = album.accent
    switch (album.art) {
      case 'arcs':
        artwork = `<path d="M-20 244 A170 170 0 0 1 320 244" fill="none" stroke="${accent}" stroke-width="42"/><path d="M30 244 A120 120 0 0 1 270 244" fill="none" stroke="${album.ink}" stroke-width="2"/>`
        break
      case 'stripes':
        artwork = `<path d="M-20 212 320 96M-20 248 320 132M-20 284 320 168" stroke="${accent}" stroke-width="20"/><path d="M-20 184 320 68" stroke="${album.ink}" stroke-width="2"/>`
        break
      case 'orbit':
        artwork = `<circle cx="150" cy="166" r="87" fill="${accent}"/><circle cx="150" cy="166" r="56" fill="${album.paper}"/><circle cx="150" cy="166" r="37" fill="${album.ink}"/><path d="M45 70 255 262" stroke="${album.ink}" stroke-width="2"/>`
        break
      case 'type':
        artwork = `<text x="23" y="180" font-family="Georgia,serif" font-size="126" fill="${accent}">N/T</text><path d="M26 206H272" stroke="${album.ink}" stroke-width="1"/>`
        break
      case 'frames':
        artwork = `<path d="M82 74H240V239H82Z M58 98H216V263H58Z" fill="none" stroke="${accent}" stroke-width="2"/><path d="M108 100H214V213H108Z" fill="${album.ink}"/>`
        break
      case 'bands':
        artwork = `<path d="M20 114H280M20 139H280M20 164H280M20 189H280M20 214H280" stroke="${accent}" stroke-width="7"/><path d="M215 85V238" stroke="${album.ink}" stroke-width="18"/>`
        break
      case 'grid':
        artwork =
          Array.from(
            { length: 7 },
            (_, line) =>
              `<path d="M${38 + line * 37} 82V244M38 ${82 + line * 27}H260" stroke="${album.ink}" stroke-width="0.6" opacity="0.55"/>`,
          ).join('') + `<path d="M164 61V260" stroke="${accent}" stroke-width="18"/>`
        break
    }
    return `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="300" height="300" fill="${album.paper}"/>
      ${artwork}
      <g fill="${album.ink}" font-family="'Plus Jakarta Sans','HarmonyOS Sans SC',sans-serif">
        <text x="22" y="31" font-size="10" letter-spacing="1.2">${album.english}</text>
        <text x="22" y="55" font-size="17">${album.title}</text>
        <text x="22" y="282" font-size="9">${album.artist}</text>
        <text x="278" y="282" text-anchor="end" font-size="8">AUR—${String(index + 1).padStart(2, '0')}</text>
      </g>
    </svg>`
  }

  row.innerHTML = albums
    .map(
      (album, index) => `
    <li class="album-slot" data-index="${index}" style="--cover-paper:${album.paper};--spine-paper:${album.paper};--cover-ink:${album.ink}">
      <button class="album-trigger" type="button" aria-label="第 ${index + 1} 名，${album.title}，${album.artist}，展开封面" aria-pressed="false">
        <span class="album-rank" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
      </button>
      <div class="album-lift" aria-hidden="true">
        <div class="album-object">
          <div class="album-face album-back"></div>
          <div class="album-spine"><span class="spine-title">${album.title}</span><span class="spine-artist">${album.artist}</span></div>
          <div class="album-top"></div>
          <div class="album-face album-front">${cover(album, index)}</div>
        </div>
      </div>
      <div class="album-envelope" aria-hidden="true"></div>
    </li>`,
    )
    .join('')

  const slots = [...row.querySelectorAll('.album-slot')]
  const buttons = slots.map((slot) => slot.querySelector('.album-trigger'))
  const returning = new Map()
  let returnFrame = 0

  function syncReturnCopies() {
    returnFrame = 0
    const poses = [...returning.values()].map((item) => ({
      ...item,
      liftPose: getComputedStyle(item.lift).transform,
      objectPose: getComputedStyle(item.object).transform,
    }))
    poses.forEach(({ copyLift, copyObject, liftPose, objectPose }) => {
      copyLift.style.transform = liftPose
      copyObject.style.transform = objectPose
    })
    if (returning.size) returnFrame = requestAnimationFrame(syncReturnCopies)
  }

  function clearReturn(slot) {
    const item = returning.get(slot)
    if (!item) return
    const { overlay } = item
    overlay.getAnimations({ subtree: true }).forEach((animation) => animation.cancel())
    overlay.remove()
    returning.delete(slot)
    if (!returning.size) {
      cancelAnimationFrame(returnFrame)
      returnFrame = 0
    }
  }

  function returnAlbum(slot) {
    clearReturn(slot)
    const lift = slot.querySelector('.album-lift')
    const object = slot.querySelector('.album-object')
    const coverRect = lift.getBoundingClientRect()
    slot.classList.remove('is-active')
    if (motion.matches) return

    // A temporary copy preserves the current foreground image while a moving
    // boundary restores the real row's occlusion. Both copies follow one return path.
    const overlay = document.createElement('div')
    overlay.className = 'album-occlusion'
    overlay.setAttribute('aria-hidden', 'true')
    const copy = slot.cloneNode(false)
    copy.style.left = `${slot.offsetLeft}px`
    copy.style.top = `${slot.offsetTop}px`
    copy.append(lift.cloneNode(true))
    overlay.append(copy)
    row.append(overlay)
    const copyLift = copy.querySelector('.album-lift')
    const copyObject = copy.querySelector('.album-object')
    returning.set(slot, { overlay, lift, object, copyLift, copyObject })
    const rowRect = row.getBoundingClientRect()
    const endRect = copyLift.getBoundingClientRect()
    const transitions = []
    for (const source of [lift, object]) {
      const transition = source
        .getAnimations()
        .find((item) => item.transitionProperty === 'transform')
      if (!transition) continue
      transitions.push(transition)
    }
    const duration = Math.max(
      0,
      ...transitions.map((item) => item.effect.getComputedTiming().endTime),
    )
    if (!duration) {
      clearReturn(slot)
      return
    }
    // Sample the real CSS pose during this short return only. This also follows
    // the browser's shortened reversals and interruptions without a second clock.
    copyLift.style.transform = getComputedStyle(lift).transform
    copyObject.style.transform = getComputedStyle(object).transform
    if (!returnFrame) returnFrame = requestAnimationFrame(syncReturnCopies)
    const wipe = overlay.animate(
      [
        { clipPath: `inset(0 ${Math.max(0, rowRect.right - coverRect.right - 16)}px 0 0)` },
        {
          clipPath: `inset(0 ${Math.max(0, rowRect.right - Math.min(coverRect.left, endRect.left) + 16)}px 0 0)`,
        },
      ],
      { duration, easing: 'cubic-bezier(0.22, 0.8, 0.22, 1)', fill: 'both' },
    )
    wipe.finished.then(
      () => clearReturn(slot),
      () => {},
    )
  }

  function select(index, source = 'pointer') {
    inputMode = source
    if (active === index) return
    if (active !== null) {
      returnAlbum(slots[active])
      buttons[active].setAttribute('aria-pressed', 'false')
    }
    active = index
    row.dataset.active = index === null ? '' : String(index)
    info.classList.toggle('is-idle', index === null)
    if (index === null) {
      title.textContent = '悬停或聚焦一张专辑'
      artist.textContent = '方向键切换 · Esc 归位'
    } else {
      clearReturn(slots[index])
      slots[index].classList.add('is-active')
      buttons[index].setAttribute('aria-pressed', 'true')
      title.textContent = albums[index].title
      artist.textContent = `${albums[index].artist} · ${albums[index].english}`
    }
  }

  motion.addEventListener('change', () => {
    if (motion.matches) slots.forEach(clearReturn)
  })

  function contains(rect, point, padding = 0) {
    return (
      point.x >= rect.left - padding &&
      point.x <= rect.right + padding &&
      point.y >= rect.top - padding &&
      point.y <= rect.bottom + padding
    )
  }

  function inActiveRegion(point) {
    if (active === null) return false
    const slot = slots[active]
    const original = buttons[active].getBoundingClientRect()
    const current = slot.querySelector('.album-front').getBoundingClientRect()
    const expanded = slot.querySelector('.album-envelope').getBoundingClientRect()
    // The union bridges the extraction path, so moving toward the opening cover keeps it open.
    return contains(
      {
        left: Math.min(original.left, current.left, expanded.left),
        top: Math.min(original.top, current.top, expanded.top),
        right: Math.max(original.right, current.right, expanded.right),
        bottom: Math.max(original.bottom, current.bottom, expanded.bottom),
      },
      point,
      8,
    )
  }

  function pointerSelection() {
    pointerFrame = 0
    if (!lastPoint) return
    const point = lastPoint
    const candidate = buttons.findIndex((button) => contains(button.getBoundingClientRect(), point))
    // The rank strip remains an explicit way to reach a neighbor behind the expanded cover.
    if (
      candidate !== -1 &&
      contains(slots[candidate].querySelector('.album-rank').getBoundingClientRect(), point, 5)
    ) {
      select(candidate)
      return
    }
    if (inActiveRegion(point)) return
    select(candidate === -1 ? null : candidate)
  }

  viewport.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return
    inputMode = 'pointer'
    lastPoint = { x: event.clientX, y: event.clientY }
    if (!pointerFrame) pointerFrame = requestAnimationFrame(pointerSelection)
  })

  viewport.addEventListener('pointerleave', () => {
    lastPoint = null
    cancelAnimationFrame(pointerFrame)
    pointerFrame = 0
    if (inputMode === 'pointer') select(null)
  })

  viewport.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(pointerFrame)
      pointerFrame = 0
      lastPoint = null
      if (inputMode === 'pointer') select(null)
    },
    { passive: true },
  )

  row.addEventListener('focusin', (event) => {
    const index = buttons.indexOf(event.target)
    if (index !== -1) {
      const source = event.target.matches(':focus-visible')
        ? 'keyboard'
        : lastPointerType === 'touch'
          ? 'touch'
          : 'pointer'
      select(index, source)
    }
  })

  row.addEventListener('focusout', (event) => {
    if (!row.contains(event.relatedTarget) && inputMode === 'keyboard') select(null)
  })

  row.addEventListener('keydown', (event) => {
    const index = buttons.indexOf(event.target)
    if (index === -1) return
    let next = index
    if (event.key === 'ArrowRight') next = Math.min(index + 1, albums.length - 1)
    else if (event.key === 'ArrowLeft') next = Math.max(index - 1, 0)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = albums.length - 1
    else if (event.key === 'Escape') {
      event.preventDefault()
      select(null, 'keyboard')
      return
    } else return
    event.preventDefault()
    buttons[next].focus({ preventScroll: true })
    buttons[next].scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: motion.matches ? 'instant' : 'smooth',
    })
    select(next, 'keyboard')
  })

  row.addEventListener('pointerdown', (event) => {
    lastPointerType = event.pointerType
    const button = event.target.closest('.album-trigger')
    touchWasActive = buttons.indexOf(button) === active
  })

  row.addEventListener('click', (event) => {
    const button = event.target.closest('.album-trigger')
    const index = buttons.indexOf(button)
    if (index === -1) return
    if (event.detail === 0) select(index, 'keyboard')
    else if (lastPointerType === 'touch') select(touchWasActive ? null : index, 'touch')
  })

  document.addEventListener('pointerdown', (event) => {
    if (!viewport.contains(event.target)) select(null)
  })

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      select(null)
      slots.forEach(clearReturn)
      cancelAnimationFrame(pointerFrame)
      pointerFrame = 0
      lastPoint = null
    }
  })

  window.addEventListener('resize', () => select(null))

  const settings = [
    { id: 'angle', property: '--spine-angle', unit: 'deg', label: '°', initial: 78 },
    { id: 'spacing', property: '--album-pitch', unit: 'px', label: 'px', initial: 64 },
    { id: 'depth', property: '--pull-depth', unit: 'px', label: 'px', initial: 200 },
  ]

  function applySetting(setting) {
    const value = document.querySelector(`#${setting.id}`).value
    document.documentElement.style.setProperty(setting.property, `${value}${setting.unit}`)
    document.querySelector(`#${setting.id}-value`).value = `${value}${setting.label}`
  }

  settings.forEach((setting) => {
    document.querySelector(`#${setting.id}`).addEventListener('input', () => applySetting(setting))
  })

  document.querySelector('#reset').addEventListener('click', () => {
    select(null)
    settings.forEach((setting) => {
      document.querySelector(`#${setting.id}`).value = setting.initial
      applySetting(setting)
    })
  })

  const themeToggle = document.querySelector('#theme-toggle')
  themeToggle.addEventListener('click', () => {
    const light = document.documentElement.dataset.theme !== 'light'
    document.documentElement.dataset.theme = light ? 'light' : 'dark'
    themeToggle.setAttribute('aria-pressed', String(light))
    themeToggle.textContent = light ? '切换深色' : '切换浅色'
  })

  info.classList.add('is-idle')
  requestAnimationFrame(() => {
    viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2
  })
})()
