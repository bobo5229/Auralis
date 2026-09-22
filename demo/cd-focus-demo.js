// Standalone interaction study. Playback and metadata below are simulated.
;(() => {
  const { cdPose, cdSlots, cdProjectedDiscOutline, animateProgress } = window.CdFocusRuntime
  const byId = (id) => document.getElementById(id)
  const stage = byId('stage'),
    panel = byId('tracks'),
    list = byId('track-list')
  const media = matchMedia('(prefers-reduced-motion: reduce)')
  const listeners = new AbortController(),
    options = { signal: listeners.signal }
  const albums = SAMPLE_COVERS.map((cover, index) => ({
    cover,
    angle: Math.random() * 360,
    title: [
      'Collected Moments',
      '月光下的来信',
      'After the Rain',
      'Quiet Rooms',
      'Between Seasons',
      '夜行手记',
    ][index],
    artist: index % 2 ? '林间来信' : 'The Quiet Hours',
    tracks: Array.from({ length: index % 2 ? 9 : 18 }, (_, i) => ({
      disc: index % 2 ? null : Math.floor(i / 9) + 1,
      number: (i % 9) + 1,
      title: [
        'First Light',
        '风经过窗边',
        'Somewhere, Slowly',
        '未寄出的信',
        'The Shape of Silence',
        '日落以后',
        'A Room of Our Own',
        '回声与远方',
        'Until Tomorrow',
      ][i % 9],
      artist:
        i % 5 === 3 ? '林间来信 / The Quiet Hours' : index % 2 ? '林间来信' : 'The Quiet Hours',
    })),
  }))
  const nodes = new Map(),
    modes = ['专辑循环', '随机循环', '顺序播放']
  let selected = 0,
    position = 0,
    focus = 0,
    goal = 0,
    busy = false,
    cancel = null
  let width = 0,
    height = 0,
    stageTop = 0,
    pageHeight = 0,
    panelLeft = 0,
    focusScale = 1.08,
    mode = 0,
    playing = null
  const mod = (n) => ((n % albums.length) + albums.length) % albums.length
  const clamp = (v) => Math.max(0, Math.min(1, v))
  const ease = (v) => {
    const t = clamp(v)
    return t * t * t * (10 + t * (-15 + 6 * t))
  }
  const mix = (a, b, t) => a + (b - a) * t
  let progress = 0,
    paused = false,
    lastTick = performance.now()

  function wavePath(seed) {
    const points = []
    for (let i = 0; i <= 1440; i++) {
      const angle = (i / 1440) * Math.PI * 2
      const carrier = Math.sin(angle * 64 + seed)
      const sharpness = 0.65 + 0.55 * (1 + Math.sin(angle * 7 + seed))
      const amplitude = 4 + 3 * (0.5 + 0.5 * Math.sin(angle * 11 + seed))
      const radius = 216 + amplitude * Math.sign(carrier) * Math.abs(carrier) ** sharpness
      points.push(
        `${i ? 'L' : 'M'}${(200 + Math.sin(angle) * radius).toFixed(2)},${(200 - Math.cos(angle) * radius).toFixed(2)}`,
      )
    }
    return `${points.join(' ')} Z`
  }

  function coverColor(img) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 32
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(img, 0, 0, 32, 32)
    const pixels = context.getImageData(0, 0, 32, 32).data
    const buckets = new Map()
    for (let i = 0; i < pixels.length; i += 4) {
      const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]]
      const light = (Math.max(...rgb) + Math.min(...rgb)) / 2
      if (light < 25 || light > 235) continue
      const key = rgb.map((v) => Math.floor(v / 32)).join(',')
      const bucket = buckets.get(key) || { weight: 0, rgb }
      bucket.weight += 1 + (Math.max(...rgb) - Math.min(...rgb)) / 128
      buckets.set(key, bucket)
    }
    const dominant = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0]
    return dominant ? `rgb(${dominant.rgb.map((v) => Math.round(v * 0.8)).join(' ')})` : '#62625b'
  }

  function updatePlayback() {
    for (const [index, node] of nodes) {
      const visible =
        goal === 1 && focus === 1 && playing?.album === mod(index) && index === selected
      node.ring.style.opacity = visible ? '1' : '0'
      node.progress.setAttribute('stroke-dashoffset', String(1 - progress))
    }
    byId('playback-preview').hidden = !(focus === 1 && playing?.album === mod(selected))
    byId('pause').textContent = paused ? '继续' : '暂停'
    byId('seek').value = String(progress * 100)
    byId('progress-label').textContent = `${Math.floor(progress * 180)} / 180 秒`
  }

  function createDisc(index) {
    const album = albums[mod(index)],
      slot = document.createElement('div')
    slot.className = 'position'
    slot.innerHTML =
      '<div class="hover"><div class="plane"><button class="disc"><div class="art"><img alt=""></div><div class="hub"></div></button><svg class="wave-ring" viewBox="-28 -28 456 456" aria-hidden="true"><path class="wave-track"/><path class="wave-progress" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg></div></div>'
    const disc = slot.querySelector('.disc'),
      hover = slot.querySelector('.hover'),
      art = slot.querySelector('.art')
    const img = slot.querySelector('img')
    img.decoding = 'async'
    img.draggable = false
    const ring = slot.querySelector('.wave-ring')
    const progressPath = slot.querySelector('.wave-progress')
    ring
      .querySelectorAll('path')
      .forEach((path) => path.setAttribute('d', wavePath(mod(index) * 1.73)))
    img.addEventListener(
      'load',
      () => {
        album.color ||= coverColor(img)
        progressPath.style.stroke = album.color
      },
      { ...options, once: true },
    )
    img.src = album.cover
    art.style.transform = `rotate(${album.angle}deg)`
    disc.setAttribute(
      'aria-label',
      `${album.title}，点击${index === selected ? '查看曲目' : '移到中心'}`,
    )
    disc.addEventListener(
      'click',
      () => {
        if (busy || focus > 0) return
        if (index === selected) setFocus(true)
        else navigate(index - selected)
      },
      options,
    )
    disc.addEventListener(
      'pointermove',
      (event) => {
        if (busy || media.matches) return
        const rect = disc.getBoundingClientRect()
        const x = clamp((event.clientX - rect.left) / rect.width) - 0.5
        const y = clamp((event.clientY - rect.top) / rect.height) - 0.5
        hover.style.transform = `perspective(1100px) rotateX(${-y * 3}deg) rotateY(${x * 3}deg)`
      },
      options,
    )
    disc.addEventListener(
      'pointerleave',
      () => {
        hover.style.transform = ''
      },
      options,
    )
    stage.append(slot)
    const node = {
      slot,
      disc,
      hover,
      plane: slot.querySelector('.plane'),
      ring,
      progress: progressPath,
    }
    nodes.set(index, node)
    return node
  }

  function measure() {
    width = stage.clientWidth
    height = stage.clientHeight
    stageTop = stage.offsetTop
    pageHeight = byId('page').clientHeight
    panelLeft = panel.offsetLeft
    const pose = cdPose(0, width, height)
    const right = Math.max(...cdProjectedDiscOutline(pose).map((point) => point.x)) - pose.cx
    focusScale = Math.min(1.08, Math.max(0, panelLeft - width / 2 - 32) / Math.max(1, right * 1.12))
  }

  function render(wobble = 0) {
    const slots = cdSlots(position, albums.length)
    for (const [index, node] of nodes)
      if (!slots.includes(index)) {
        node.slot.remove()
        nodes.delete(index)
      }
    for (const [layer, index] of slots.entries()) {
      const node = nodes.get(index) || createDisc(index)
      const t = index - position,
        pose = cdPose(t, width, height)
      let { cx, cy, size, tilt, turn } = pose
      const isSelected = index === selected
      if (isSelected && focus > 0) {
        // Fit the projected contour, not its untransformed square. Leave room for hover tilt.
        cx = mix(pose.cx, width / 2, focus)
        cy = mix(pose.cy, pageHeight / 2 - stageTop, focus)
        size = mix(pose.size, pose.size * focusScale, focus)
        turn += wobble
        tilt += wobble * 0.62
      }
      node.slot.style.transform = `translate3d(${cx - size / 2}px,${cy - size / 2}px,0) scale(${size / 400})`
      node.plane.style.transform = `perspective(1100px) rotateZ(${turn}deg) rotateY(${tilt}deg) rotateX(9deg)`
      node.slot.style.opacity =
        ease(Math.min((t + 2.5) * 2, (1.5 - t) * 2)) * (isSelected ? 1 : 1 - ease(focus / 0.8))
      node.slot.style.zIndex = isSelected && focus > 0 ? 5 : layer + 1
      node.disc.tabIndex = busy || (focus > 0 && !isSelected) ? -1 : 0
      node.disc.style.pointerEvents = busy || (focus > 0 && !isSelected) ? 'none' : 'auto'
    }
    const reveal = ease((focus - 0.72) / 0.28)
    panel.style.opacity = reveal
    panel.style.transform = `translateX(${(1 - reveal) * 16}px)`
    panel.style.visibility = reveal > 0 ? 'visible' : 'hidden'
    panel.inert = focus < 1 || busy
    byId('browse-controls').style.opacity = 1 - ease(focus / 0.5)
    byId('browse-controls').inert = focus > 0 || busy
    updatePlayback()
  }

  function updateInfo() {
    const album = albums[mod(selected)]
    byId('album-title').textContent = album.title
    byId('artist').textContent = album.artist
    byId('count').textContent = `${album.tracks.length} 首`
    list.replaceChildren()
    let lastDisc = null
    album.tracks.forEach((track, index) => {
      if (track.disc && track.disc !== lastDisc) {
        const title = document.createElement('h3')
        title.className = 'disc-heading'
        title.textContent = `Disc ${track.disc}`
        list.append(title)
        lastDisc = track.disc
      }
      const button = document.createElement('button')
      button.className = 'track'
      const number = document.createElement('span')
      number.className = 'track-number'
      const detail = document.createElement('span'),
        title = document.createElement('span')
      detail.className = 'track-detail'
      title.className = 'track-title'
      title.textContent = track.title
      title.title = track.title
      detail.append(title)
      if (track.artist !== album.artist) {
        const artist = document.createElement('span')
        artist.className = 'track-artist'
        artist.textContent = track.artist
        artist.title = track.artist
        detail.append(artist)
      }
      const active = playing?.album === mod(selected) && playing?.index === index
      number.textContent = String(track.number).padStart(2, '0')
      button.setAttribute('aria-current', String(active))
      button.append(number, detail)
      button.addEventListener('click', () => {
        playing = { album: mod(selected), index }
        progress = 0
        paused = false
        lastTick = performance.now()
        // Update selection in place; preserve keyboard focus and list scroll position.
        list.querySelectorAll('.track').forEach((row, i) => {
          row.setAttribute('aria-current', String(i === index))
        })
        byId('hint').textContent = `已选择：${track.title} · Demo 不播放音频`
        updatePlayback()
      })
      list.append(button)
    })
    list.scrollTop = 0
  }

  function settle() {
    cancel = null
    busy = false
    render()
    for (const node of nodes.values()) {
      node.slot.style.willChange = ''
      node.disc.style.willChange = ''
    }
    byId('hint').textContent = focus === 1 ? '选择一首曲目 · Esc 返回浏览' : '点击中心 CD，展开曲目'
    byId('back').disabled = focus === 0
    if (focus === 1) byId('mode').focus({ preventScroll: true })
    else nodes.get(selected)?.disc.focus({ preventScroll: true })
  }

  function setFocus(open) {
    if ((busy && focus === 0 && goal === 0) || (open && goal === 1) || (!open && goal === 0)) return
    cancel?.()
    goal = open ? 1 : 0
    const from = focus
    busy = true
    panel.inert = true
    byId('back').disabled = false
    for (const node of nodes.values()) {
      node.hover.style.transform = ''
      node.slot.style.willChange = 'transform, opacity'
      node.disc.style.willChange = 'transform'
    }
    if (media.matches) {
      focus = goal
      settle()
      return
    }
    cancel = animateProgress(
      Math.max(180, (open ? 880 : 720) * Math.abs(goal - from)),
      (progress) => {
        focus = mix(from, goal, ease(progress))
        const wobble =
          Math.sin(progress * Math.PI * 7) *
          Math.sin(progress * Math.PI) *
          Math.pow(1 - progress, 1.3) *
          2.8
        render(wobble)
      },
      () => {
        focus = goal
        settle()
      },
    )
  }

  function navigate(delta) {
    if (busy || focus > 0) return
    const from = position,
      target = selected + delta
    busy = true
    const finish = () => {
      selected = position = target
      updateInfo()
      settle()
    }
    if (media.matches) {
      finish()
      return
    }
    cancel = animateProgress(
      640,
      (progress) => {
        position = mix(from, target, ease(progress))
        render()
      },
      finish,
    )
  }

  byId('back').addEventListener('click', () => setFocus(false), options)
  byId('pause').addEventListener(
    'click',
    () => {
      paused = !paused
      lastTick = performance.now()
      updatePlayback()
    },
    options,
  )
  byId('seek').addEventListener(
    'input',
    (event) => {
      progress = Number(event.target.value) / 100
      lastTick = performance.now()
      updatePlayback()
    },
    options,
  )
  const playbackTimer = setInterval(() => {
    const now = performance.now()
    if (playing && !paused) {
      progress = Math.min(1, progress + ((now - lastTick) / 180000) * Number(byId('speed').value))
      if (progress === 1) paused = true
      updatePlayback()
    }
    lastTick = now
  }, 100)
  byId('previous').addEventListener('click', () => navigate(-1), options)
  byId('next').addEventListener('click', () => navigate(1), options)
  byId('mode').addEventListener(
    'click',
    () => {
      mode = (mode + 1) % modes.length
      byId('mode').textContent = `${modes[mode]} ${['↻', '⤨', '→'][mode]}`
      byId('hint').textContent =
        mode === 1
          ? '随机循环：每轮不重复，下一轮重新打乱（交互预览）'
          : mode === 2
            ? '顺序播放：专辑最后一首结束后停止（交互预览）'
            : '专辑循环：按专辑顺序循环（交互预览）'
    },
    options,
  )
  addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') setFocus(false)
      if (focus === 0 && !busy && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault()
        navigate(event.key === 'ArrowLeft' ? -1 : 1)
      }
    },
    options,
  )
  const observer = new ResizeObserver(() => {
    measure()
    render()
  })
  observer.observe(byId('page'))
  media.addEventListener(
    'change',
    () => {
      if (!media.matches) return
      cancel?.()
      position = selected
      focus = goal
      settle()
    },
    options,
  )
  addEventListener(
    'pagehide',
    () => {
      cancel?.()
      observer.disconnect()
      clearInterval(playbackTimer)
      listeners.abort()
    },
    { once: true },
  )
  measure()
  updateInfo()
  render()
  byId('back').disabled = true
})()
