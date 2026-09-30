import {
  HOLOGRAM_DURATION,
  HOLOGRAM_PADDING,
  hologramFrame,
  paintHologram,
} from './archiveHologram.js'

// Canvas renderer adapted from the supplied demo. Receives data; no IPC or playback access.
export function mountArchiveStage(root) {
  const frames = new Set()
  const timers = new Set()
  const observers = []
  const subscriptions = []
  let disposed = false
  function requestAnimationFrame(callback) {
    if (disposed) return 0
    const id = window.requestAnimationFrame((time) => {
      frames.delete(id)
      if (!disposed) callback(time)
    })
    frames.add(id)
    return id
  }
  function cancelAnimationFrame(id) {
    frames.delete(id)
    window.cancelAnimationFrame(id)
  }
  function setTimeout(callback, delay) {
    const id = window.setTimeout(() => {
      timers.delete(id)
      if (!disposed) callback()
    }, delay)
    timers.add(id)
    return id
  }
  function clearTimeout(id) {
    timers.delete(id)
    window.clearTimeout(id)
  }
  function listen(target, type, callback) {
    target.addEventListener(type, callback)
    subscriptions.push(() => target.removeEventListener(type, callback))
  }
  function observe(Type, callback, target, options) {
    const observer = new Type(callback)
    observers.push(observer)
    observer.observe(target, options)
  }

  let setAlbums = () => {}
  const images = new Set()
  // Canvas 2.5D Album Turntable
  ;(() => {
    const canvas = root.getElementById('album-stage')
    const ctx = canvas.getContext('2d')
    const hostStyle = getComputedStyle(root.host)
    const token = (name, fallback) => hostStyle.getPropertyValue(name).trim() || fallback
    const colors = {
      accent: token('--archive-color-accent-secondary', '#f72585'),
      bgCard: token('--archive-color-bg-card', '#20232d'),
      borderControl: token('--archive-color-border-control', '#334155'),
      textPrimary: token('--archive-color-text-primary', '#f8fafc'),
      textSecondary: token('--archive-color-text-secondary', '#94a3b8'),
      projection: token('--archive-color-projection', '#7be2ed'),
    }
    const fonts = {
      display: token('--archive-font-display', "'Chakra Petch', sans-serif"),
      data: token('--archive-font-data', "'JetBrains Mono', monospace"),
      ui: token('--archive-font-ui', "'Rajdhani', sans-serif"),
    }
    let albums = []
    let albumRevision = 0
    let revealQueuedAt = 0
    let revealStart = null
    let revealing = false
    if (!ctx) return

    const TAU = Math.PI * 2
    let step = TAU
    const pitch = 0.36,
      cp = Math.cos(pitch),
      sp = Math.sin(pitch),
      focal = 1300
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const title = root.getElementById('stage-title'),
      artist = root.getElementById('stage-artist')
    const caption = root.getElementById('stage-caption')
    const captionFace = root.getElementById('stage-caption-face')
    const captionCtx = captionFace?.getContext?.('2d')
    const position = root.getElementById('stage-position'),
      autoButton = root.getElementById('stage-auto')
    let angle = 0,
      target = 0,
      selected = 0,
      auto = !motion.matches
    let drag = null,
      hovering = false,
      focused = false,
      raf = 0,
      lastTime = 0
    let nextAdvance = performance.now() + 6500,
      timer = 0,
      renderScale = 1,
      offsetX = 0,
      offsetY = 0
    let pixelRatio = 1,
      width = 800,
      height = 480,
      hits = []

    const mod = (n, d) => ((n % d) + d) % d
    const nearest = (a) => (albums.length ? mod(Math.round(-a / step), albums.length) : 0)

    let selectors = []
    function drawArtworkPlaceholder(album, surface) {
      const c = surface.getContext('2d')
      c.clearRect(0, 0, 512, 512)
      c.fillStyle = colors.bgCard
      c.fillRect(0, 0, 512, 512)
      c.strokeStyle = colors.borderControl
      c.lineWidth = 2
      c.strokeRect(30, 30, 452, 452)
      c.fillStyle = colors.textPrimary
      c.font = `700 28px ${fonts.display}`
      c.fillText(album.title, 48, 240, 416)
      c.fillStyle = colors.textSecondary
      c.font = `600 18px ${fonts.ui}`
      c.fillText(album.artist, 48, 280, 416)
      c.fillText('暂无封面', 48, 430, 416)
    }

    function artwork(album) {
      const surface = document.createElement('canvas')
      surface.width = surface.height = 512
      const c = surface.getContext('2d')
      drawArtworkPlaceholder(album, surface)
      if (album.artworkUrl) {
        const revision = albumRevision
        const image = new Image()
        images.add(image)
        image.onload = () => {
          images.delete(image)
          if (disposed || revision !== albumRevision) return
          const edge = Math.min(image.naturalWidth, image.naturalHeight)
          album.artworkSettled = true
          if (edge === 0) {
            wake()
            return
          }
          c.drawImage(
            image,
            (image.naturalWidth - edge) / 2,
            (image.naturalHeight - edge) / 2,
            edge,
            edge,
            0,
            0,
            512,
            512,
          )
          album.artworkLoaded = true
          // A delayed real cover gets its own reveal instead of popping over a finished placeholder.
          if (revealStart !== null && performance.now() - revealStart >= HOLOGRAM_DURATION)
            album.revealStart = performance.now()
          wake()
        }
        image.onerror = () => {
          images.delete(image)
          if (disposed || revision !== albumRevision) return
          album.artworkSettled = true
          wake()
        }
        image.src = album.artworkUrl
      }
      return surface
    }
    function fitCaptionText(ctx, text, maxWidth) {
      if (!text || ctx.measureText(text).width <= maxWidth) return text
      const ellipsis = '…'
      let end = text.length
      while (end > 0 && ctx.measureText(text.slice(0, end) + ellipsis).width > maxWidth) end--
      return `${end > 0 ? text.slice(0, end) : text.slice(0, 1)}${ellipsis}`
    }
    function paintCaption() {
      if (!captionCtx || disposed) return
      const cssWidth = Math.max(0, caption.getBoundingClientRect().width)
      const cssHeight = 48
      if (cssWidth < 2) return
      // Extra 2× so rotateX(48deg) still has enough texels after Y compression.
      const scale = Math.min(devicePixelRatio || 1, 2) * 2
      const bufferWidth = Math.round(cssWidth * scale)
      const bufferHeight = Math.round(cssHeight * scale)
      if (captionFace.width !== bufferWidth) captionFace.width = bufferWidth
      if (captionFace.height !== bufferHeight) captionFace.height = bufferHeight
      captionCtx.setTransform(scale, 0, 0, scale, 0, 0)
      captionCtx.clearRect(0, 0, cssWidth, cssHeight)
      captionCtx.textAlign = 'center'
      captionCtx.textBaseline = 'middle'
      const cx = cssWidth / 2
      const maxWidth = Math.max(24, cssWidth - 16)
      const titleText = title.textContent ?? ''
      const artistText = artist.textContent ?? ''
      captionCtx.letterSpacing = '1px'
      captionCtx.font = `700 18px ${fonts.display}`
      captionCtx.fillStyle = colors.textPrimary
      captionCtx.shadowColor = 'rgba(3, 3, 5, 0.55)'
      captionCtx.shadowBlur = 2
      captionCtx.shadowOffsetY = 1
      captionCtx.fillText(fitCaptionText(captionCtx, titleText, maxWidth), cx, 16)
      captionCtx.letterSpacing = '0.7px'
      captionCtx.font = `600 12px ${fonts.ui}`
      captionCtx.fillStyle = colors.textSecondary
      captionCtx.shadowColor = 'rgba(3, 3, 5, 0.4)'
      captionCtx.fillText(fitCaptionText(captionCtx, artistText, maxWidth), cx, 34)
      captionCtx.shadowBlur = 0
      captionCtx.shadowOffsetY = 0
      captionCtx.letterSpacing = '0px'
    }
    function redrawPlaceholderFonts(revision) {
      if (!document.fonts?.load) return
      void Promise.allSettled([
        document.fonts.load(`700 28px ${fonts.display}`, '中文专辑名'),
        document.fonts.load(`600 18px ${fonts.ui}`, '暂无封面'),
        document.fonts.load(`700 8px ${fonts.data}`, '日期 · 次 · 分钟'),
        document.fonts.load(`700 18px ${fonts.display}`, '中文专辑名'),
        document.fonts.load(`600 12px ${fonts.ui}`, '艺术家 · 次'),
      ]).then(() => {
        if (disposed || revision !== albumRevision) return
        albums.forEach((album) => {
          if (!album.artworkLoaded) drawArtworkPlaceholder(album, album.front)
        })
        paintCaption()
        wake()
      })
    }
    setAlbums = (items) => {
      ++albumRevision
      images.forEach((image) => {
        image.onload = null
        image.onerror = null
        image.removeAttribute('src')
      })
      images.clear()
      clearTimeout(timer)
      cancelAnimationFrame(raf)
      raf = 0
      const pointerId = drag?.id
      drag = null
      if (pointerId !== undefined && canvas.hasPointerCapture(pointerId))
        canvas.releasePointerCapture(pointerId)
      canvas.classList.remove('is-dragging')
      albums = items.slice(0, 5).map((album) => ({
        ...album,
        paper: colors.bgCard,
        artworkLoaded: false,
        artworkSettled: !album.artworkUrl,
      }))
      revealQueuedAt = performance.now()
      revealStart = null
      step = TAU / Math.max(1, albums.length)
      selected = 0
      angle = 0
      target = 0
      hits = []
      const controls = root.getElementById('stage-selectors')
      controls.replaceChildren()
      selectors = albums.map((album, i) => {
        album.front = artwork(album)
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'stage-control stage-selector'
        button.textContent = String(i + 1).padStart(2, '0')
        button.setAttribute('aria-label', '选择 ' + album.title + ' — ' + album.artist)
        button.addEventListener('click', () => select(i))
        controls.appendChild(button)
        return button
      })
      root.getElementById('stage-prev').disabled = albums.length < 2
      root.getElementById('stage-next').disabled = albums.length < 2
      autoButton.disabled = albums.length < 2
      canvas.tabIndex = albums.length ? 0 : -1
      nextAdvance = performance.now() + 6500
      updateInfo()
      updateAuto()
      draw()
      wake()
      redrawPlaceholderFonts(albumRevision)
    }

    function project(p) {
      const depth = p.z * cp + p.y * sp,
        scale = focal / (focal - depth)
      return { x: 400 + p.x * scale, y: 321 + (p.z * sp - p.y * cp) * scale, depth }
    }
    function path(points) {
      ctx.beginPath()
      points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
    }
    function circle(radius, y = 0, cx = 0, cz = 0) {
      return Array.from({ length: 121 }, (_, i) => {
        const t = (i / 120) * TAU
        return project({ x: cx + Math.cos(t) * radius, y, z: cz + Math.sin(t) * radius })
      })
    }
    function fill(points, color) {
      path(points)
      ctx.fillStyle = color
      ctx.fill()
    }
    function stroke(points, color, lineWidth = 1) {
      path(points)
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.stroke()
    }
    function ellipse(x, y, rx, ry, color) {
      ctx.beginPath()
      ctx.ellipse(x, y, rx, ry, 0, 0, TAU)
      ctx.fillStyle = color
      ctx.fill()
    }
    function cardPoint(theta, u, v, depth = 2.4) {
      const s = Math.sin(theta),
        c = Math.cos(theta),
        lateral = (u - 0.5) * 166
      return {
        x: s * 164 + c * lateral + s * depth,
        y: 12 + (1 - v) * 166,
        z: c * 164 - s * lateral + c * depth,
      }
    }
    function triangle(texture, a, b, c, sa, sb, sc) {
      const det = sa.x * (sb.y - sc.y) + sb.x * (sc.y - sa.y) + sc.x * (sa.y - sb.y)
      if (Math.abs(det) < 0.001) return
      const coefficient = (key) => [
        (a[key] * (sb.y - sc.y) + b[key] * (sc.y - sa.y) + c[key] * (sa.y - sb.y)) / det,
        (a[key] * (sc.x - sb.x) + b[key] * (sa.x - sc.x) + c[key] * (sb.x - sa.x)) / det,
        (a[key] * (sb.x * sc.y - sc.x * sb.y) +
          b[key] * (sc.x * sa.y - sa.x * sc.y) +
          c[key] * (sa.x * sb.y - sb.x * sa.y)) /
          det,
      ]
      const tx = coefficient('x'),
        ty = coefficient('y')
      ctx.save()
      const mx = (a.x + b.x + c.x) / 3,
        my = (a.y + b.y + c.y) / 3
      path(
        [a, b, c].map((p) => {
          const d = Math.hypot(p.x - mx, p.y - my) || 1
          return { x: p.x + ((p.x - mx) * 0.8) / d, y: p.y + ((p.y - my) * 0.8) / d }
        }),
      )
      ctx.clip()
      ctx.transform(tx[0], ty[0], tx[1], ty[1], tx[2], ty[2])
      ctx.drawImage(texture, 0, 0)
      ctx.restore()
    }
    function textureFace(texture, theta, back, reflection = false) {
      const holographic = texture.width !== 512
      const point = (u, v) => {
        const mappedU = holographic ? (u * texture.width - HOLOGRAM_PADDING) / 512 : u
        const p = cardPoint(theta, mappedU, v, back ? -2.4 : 2.4)
        if (reflection) p.y = -p.y
        return project(p)
      }
      const quad = [point(0, 0), point(1, 0), point(1, 1), point(0, 1)]
      ctx.save()
      path(quad)
      ctx.clip()
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 6; x++) {
          const u = x / 6,
            v = y / 4,
            U = (x + 1) / 6,
            V = (y + 1) / 4
          const a = point(u, v),
            b = point(U, v),
            c = point(U, V),
            d = point(u, V)
          triangle(
            texture,
            a,
            b,
            c,
            { x: u * texture.width, y: v * 512 },
            { x: U * texture.width, y: v * 512 },
            { x: U * texture.width, y: V * 512 },
          )
          triangle(
            texture,
            a,
            c,
            d,
            { x: u * texture.width, y: v * 512 },
            { x: U * texture.width, y: V * 512 },
            { x: u * texture.width, y: V * 512 },
          )
        }
      if (!reflection && !holographic) {
        const normal = (back ? -1 : 1) * Math.cos(theta)
        ctx.fillStyle = 'rgba(0,0,0,' + (0.08 + 0.48 * (1 - Math.max(0, normal))) + ')'
        ctx.fillRect(0, 0, 800, 480)
        const sheen = ctx.createLinearGradient(quad[0].x, quad[0].y, quad[2].x, quad[2].y)
        sheen.addColorStop(0, 'rgba(255,242,218,.14)')
        sheen.addColorStop(0.45, 'rgba(255,255,255,0)')
        sheen.addColorStop(1, 'rgba(0,0,0,.12)')
        ctx.fillStyle = sheen
        ctx.fillRect(0, 0, 800, 480)
      }
      ctx.restore()
      if (!reflection && !holographic) stroke(quad, 'rgba(224,217,199,.35)', 0.65)
      return quad
    }

    function draw() {
      const now = performance.now()
      if (
        revealStart === null &&
        (albums.every((album) => album.artworkSettled) || now - revealQueuedAt >= 500)
      )
        revealStart = now
      revealing = false
      for (const album of albums) {
        const state = hologramFrame(
          revealStart === null ? 0 : now - (album.revealStart ?? revealStart),
        )
        album.projecting = !motion.matches && state.active
        if (album.projecting) {
          revealing = true
          if (!album.hologram) {
            album.hologram = document.createElement('canvas')
            album.hologram.width = 512 + HOLOGRAM_PADDING * 2
            album.hologram.height = 512
          }
          paintHologram(album.hologram, album.front, state, colors.projection)
          album.texture = album.hologram
        } else {
          album.texture = album.front
          album.hologram = null
        }
      }
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.translate(offsetX, offsetY)
      ctx.scale(renderScale, renderScale)

      const ground = ctx.createRadialGradient(400, 396, 20, 400, 396, 310)
      ground.addColorStop(0, 'rgba(0,0,0,.9)')
      ground.addColorStop(0.72, 'rgba(0,0,0,.35)')
      ground.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.save()
      ctx.translate(400, 396)
      ctx.scale(1, 0.24)
      ctx.translate(-400, -396)
      ctx.fillStyle = ground
      ctx.fillRect(70, 60, 660, 670)
      ctx.restore()

      const body = ctx.createLinearGradient(105, 0, 695, 0)
      body.addColorStop(0, '#121319')
      body.addColorStop(0.17, '#383b42')
      body.addColorStop(0.4, '#1b1d23')
      body.addColorStop(0.7, '#111218')
      body.addColorStop(0.9, '#2f3038')
      body.addColorStop(1, '#0d0e13')
      for (let y = -24; y <= 0; y += 2) fill(circle(270, y), body)
      stroke(circle(270, -22), '#09090e', 2)

      const top = ctx.createLinearGradient(180, 215, 550, 402)
      top.addColorStop(0, '#5b5d65')
      top.addColorStop(0.22, '#34363d')
      top.addColorStop(0.6, '#22242b')
      top.addColorStop(1, '#393a43')
      fill(circle(270), top)
      stroke(circle(270), '#7c7b82', 1.1)
      stroke(circle(265), '#11131a', 2)
      fill(circle(253, 0.7), '#24262e')
      stroke(circle(253, 0.7), '#56565e', 0.8)
      for (let r = 225; r <= 247; r += 3) stroke(circle(r, 1), 'rgba(161,157,168,.085)', 0.5)

      // Recessed circular glow channel embedded into the turntable platter
      stroke(circle(259, 0.3), '#08090d', 3)
      ctx.save()
      ctx.shadowColor = colors.accent
      ctx.shadowBlur = 6
      stroke(circle(259, 0.4), colors.accent, 1.2)
      ctx.shadowBlur = 0
      ctx.globalAlpha = 0.85
      stroke(circle(259, 0.4), 'rgba(255, 255, 255, 0.7)', 0.5)
      ctx.restore()

      const cards = albums
        .map((album, i) => ({
          album,
          i,
          theta: angle + i * step,
          z: Math.cos(angle + i * step) * 164,
        }))
        .sort((a, b) => a.z - b.z)
      ctx.save()
      path(circle(252, 1))
      ctx.clip()
      for (const card of cards) {
        const p = project(cardPoint(card.theta, 0.5, 1, 0))
        const shade = ctx.createRadialGradient(p.x + 8, p.y + 5, 1, p.x + 8, p.y + 5, 86)
        shade.addColorStop(0, 'rgba(0,0,0,.75)')
        shade.addColorStop(1, 'rgba(0,0,0,0)')
        ellipse(p.x + 8, p.y + 5, 86, 19, shade)
        ctx.globalAlpha = 0.1
        const back = Math.cos(card.theta) < 0
        textureFace(card.album.texture, card.theta, back, true)
        ctx.globalAlpha = 1
      }
      ctx.restore()

      for (let i = 0; i < 60; i++) {
        const t = (i / 60) * TAU + angle
        const a = project({ x: Math.sin(t) * 242, y: 2, z: Math.cos(t) * 242 })
        const b = project({
          x: Math.sin(t) * (i % 5 ? 239 : 235),
          y: 2,
          z: Math.cos(t) * (i % 5 ? 239 : 235),
        })
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = i % 5 ? '#565660' : '#8c8793'
        ctx.lineWidth = 0.65
        ctx.stroke()
      }
      fill(circle(17, 2), '#13141c')
      stroke(circle(17, 2), '#64646c', 1)
      fill(circle(6, 5), '#7b7b80')

      const faces = []
      for (const card of cards) {
        const p = (u, v, d) => project(cardPoint(card.theta, u, v, d))
        const front = [p(0, 0, 2.4), p(1, 0, 2.4), p(1, 1, 2.4), p(0, 1, 2.4)]
        const back = [p(1, 0, -2.4), p(0, 0, -2.4), p(0, 1, -2.4), p(1, 1, -2.4)]
        const visible = (q) =>
          (q[1].x - q[0].x) * (q[2].y - q[0].y) - (q[1].y - q[0].y) * (q[2].x - q[0].x) > 0
        // Matte black acrylic: low-contrast diffuse faces without edge highlights.
        // Sort at the sleeve's mid-height so the near lip overlaps its bottom edge.
        const trayPoint = (u, y, d) => {
          const world = cardPoint(card.theta, u, 1 + (12 - y) / 166, d)
          return { ...project(world), trayDepth: project({ ...world, y: 95 }).depth }
        }
        const trayFace = (points, color) => {
          if (visible(points))
            faces.push({
              points,
              color,
              outline: false,
              depth: points.reduce((sum, point) => sum + point.trayDepth, 0) / 4,
            })
        }
        for (const side of [-1, 1]) {
          const near = side === 1
          const d0 = near ? 3.3 : -13
          const d1 = near ? 13 : -3.3
          const y0 = near ? 14 : 8
          const y1 = near ? 8 : 14
          const a = trayPoint(0.15, y0, d0),
            b = trayPoint(0.85, y0, d0)
          const c = trayPoint(0.85, y1, d1),
            d = trayPoint(0.15, y1, d1)
          const e = trayPoint(0.15, 2, d0),
            f = trayPoint(0.85, 2, d0)
          const g = trayPoint(0.85, 2, d1),
            h = trayPoint(0.15, 2, d1)
          trayFace([a, b, c, d], '#080808')
          trayFace([d, c, g, h], '#050505')
          trayFace([b, a, e, f], '#050505')
          trayFace([a, d, h, e], '#060606')
          trayFace([c, b, f, g], '#060606')
        }
        for (const [points, isBack] of [
          [front, false],
          [back, true],
        ])
          if (visible(points))
            faces.push({
              points,
              card,
              back: isBack,
              depth: points.reduce((n, p) => n + p.depth, 0) / 4,
            })
        const sides = [
          [p(0, 0, -2.4), p(0, 0, 2.4), p(0, 1, 2.4), p(0, 1, -2.4)],
          [p(1, 0, 2.4), p(1, 0, -2.4), p(1, 1, -2.4), p(1, 1, 2.4)],
          [p(0, 0, -2.4), p(1, 0, -2.4), p(1, 0, 2.4), p(0, 0, 2.4)],
        ]
        sides.forEach((points, i) => {
          if (!card.album.projecting && visible(points))
            faces.push({
              points,
              color: i === 2 ? '#aaa394' : card.album.paper,
              depth: points.reduce((n, p) => n + p.depth, 0) / 4,
            })
        })
      }
      hits = []
      faces
        .sort((a, b) => a.depth - b.depth)
        .forEach((face) => {
          if (face.card) {
            textureFace(face.card.album.texture, face.card.theta, face.back)
            hits.push({ points: face.points, index: face.card.i })
          } else {
            fill(face.points, face.color)
            if (face.outline !== false) stroke(face.points, 'rgba(206,196,173,.2)', 0.6)
          }
        })
      const badge = project({ x: 0, y: -11, z: 270 })
      ctx.save()
      ctx.font = `700 8px ${fonts.data}`
      ctx.textAlign = 'center'
      // Recessed lettering: a faint lower cut edge, dark upper lip and unlit groove.
      ctx.fillStyle = 'rgba(173,181,195,.38)'
      ctx.fillText('A U R A L I S', badge.x, badge.y + 0.7)
      ctx.fillStyle = 'rgba(0,0,0,.85)'
      ctx.fillText('A U R A L I S', badge.x, badge.y - 0.4)
      const engraving = ctx.createLinearGradient(0, badge.y - 8, 0, badge.y)
      engraving.addColorStop(0, '#020305')
      engraving.addColorStop(1, '#101218')
      ctx.fillStyle = engraving
      ctx.fillText('A U R A L I S', badge.x, badge.y)
      // Illuminate the recessed face with the same accent as the turntable ring.
      ctx.fillStyle = colors.accent
      ctx.shadowColor = colors.accent
      ctx.shadowBlur = 5
      ctx.globalAlpha = 0.85
      ctx.fillText('A U R A L I S', badge.x, badge.y)
      ctx.restore()
    }

    function updateInfo() {
      title.textContent = albums[selected]?.title ?? ''
      artist.textContent = albums[selected]
        ? `${albums[selected].artist} · ${albums[selected].playCount} 次`
        : ''
      paintCaption()
      caption.classList.remove('is-appearing')
      if (albums.length && !motion.matches) {
        // Restart once for each new selection, including the first album of a new day.
        void caption.offsetWidth
        caption.classList.add('is-appearing')
      }
      position.textContent = albums.length
        ? `${String(selected + 1).padStart(2, '0')} / ${String(albums.length).padStart(2, '0')}`
        : '00 / 00'
      selectors.forEach((button, i) => button.setAttribute('aria-pressed', String(i === selected)))
      root.getElementById('stage-selectors').style.setProperty('--active-index', String(selected))
    }
    function updateAuto() {
      autoButton.setAttribute('aria-pressed', String(auto && albums.length > 1))
      autoButton.textContent = 'AUTO'
      autoButton.title = auto && albums.length > 1 ? '关闭自动旋转' : '开启自动旋转'
    }
    function schedule() {
      clearTimeout(timer)
      if (albums.length > 1 && auto && !hovering && !focused && !drag && !document.hidden && !raf)
        timer = setTimeout(
          () => {
            target -= step
            nextAdvance = performance.now() + 6500
            wake()
          },
          Math.max(0, nextAdvance - performance.now()),
        )
    }
    function frame(now) {
      raf = 0
      const dt = Math.min((now - lastTime) / 1000 || 0.016, 0.05)
      lastTime = now
      if (!drag) {
        angle += (target - angle) * (motion.matches ? 1 : 1 - Math.exp(-8 * dt))
        if (Math.abs(target - angle) < 0.001) angle = target
      }
      const current = nearest(angle)
      if (current !== selected) {
        selected = current
        updateInfo()
      }
      draw()
      if (revealing || (!drag && angle !== target)) raf = requestAnimationFrame(frame)
      else schedule()
    }
    function wake() {
      if (document.hidden) return
      clearTimeout(timer)
      if (!raf) {
        lastTime = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    function select(index) {
      if (!albums.length) return
      const current = Math.round(-target / step),
        delta =
          mod(index - mod(current, albums.length) + Math.floor(albums.length / 2), albums.length) -
          Math.floor(albums.length / 2)
      target = -(current + delta) * step
      nextAdvance = performance.now() + 6500
      wake()
    }
    function move(delta) {
      if (albums.length < 2) return
      target = (-Math.round(-target / step) - delta) * step
      nextAdvance = performance.now() + 6500
      wake()
    }

    root.getElementById('stage-prev').addEventListener('click', () => move(-1))
    root.getElementById('stage-next').addEventListener('click', () => move(1))
    autoButton.addEventListener('click', () => {
      auto = !auto
      updateAuto()
      nextAdvance = performance.now() + 6500
      schedule()
    })

    canvas.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        move(event.key === 'ArrowRight' ? 1 : -1)
      }
      if (event.key === 'Home') {
        event.preventDefault()
        select(0)
      }
      if (event.key === ' ') {
        event.preventDefault()
        autoButton.click()
      }
    })

    const stage = root.querySelector('.stage-container')
    stage.addEventListener('pointerenter', () => {
      hovering = true
      clearTimeout(timer)
    })
    stage.addEventListener('pointerleave', () => {
      hovering = false
      nextAdvance = performance.now() + 6500
      schedule()
    })
    stage.addEventListener('focusin', () => {
      focused = true
      clearTimeout(timer)
    })
    stage.addEventListener('focusout', (event) => {
      focused = stage.contains(event.relatedTarget)
      nextAdvance = performance.now() + 6500
      schedule()
    })

    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || drag || albums.length < 2) return
      clearTimeout(timer)
      target = angle
      canvas.focus({ preventScroll: true })
      drag = {
        id: event.pointerId,
        x: event.clientX,
        lastX: event.clientX,
        time: performance.now(),
        velocity: 0,
        moved: 0,
      }
      canvas.setPointerCapture(event.pointerId)
      canvas.classList.add('is-dragging')
    })
    canvas.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return
      const now = performance.now(),
        dx = event.clientX - drag.lastX,
        dt = Math.max(8, now - drag.time)
      const da = dx / (Math.max(0.35, renderScale) * 210)
      angle += da
      target = angle
      drag.velocity = da / dt
      drag.lastX = event.clientX
      drag.time = now
      drag.moved = Math.max(drag.moved, Math.abs(event.clientX - drag.x))
      wake()
    })
    function finishDrag(event, cancelled = false) {
      if (!drag || drag.id !== event.pointerId) return
      const state = drag
      drag = null
      canvas.classList.remove('is-dragging')
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      if (!cancelled && state.moved < 6) {
        const rect = canvas.getBoundingClientRect(),
          x = (event.clientX - rect.left - offsetX) / renderScale,
          y = (event.clientY - rect.top - offsetY) / renderScale
        const contains = (points) => {
          let inside = false
          for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const a = points[i],
              b = points[j]
            if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
              inside = !inside
          }
          return inside
        }
        const hit = [...hits].reverse().find((hit) => contains(hit.points))
        if (hit) {
          select(hit.index)
          return
        }
      }
      const velocity = performance.now() - state.time > 100 ? 0 : state.velocity
      const inertia =
        cancelled || motion.matches
          ? 0
          : Math.max(-step * 0.8, Math.min(step * 0.8, velocity * 140))
      target = Math.round((angle + inertia) / step) * step
      nextAdvance = performance.now() + 6500
      wake()
    }
    canvas.addEventListener('pointerup', (event) => finishDrag(event))
    canvas.addEventListener('pointercancel', (event) => finishDrag(event, true))
    canvas.addEventListener('lostpointercapture', (event) => finishDrag(event, true))

    function resize() {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      pixelRatio = Math.min(devicePixelRatio || 1, 2)
      const bufferWidth = Math.round(width * pixelRatio),
        bufferHeight = Math.round(height * pixelRatio)
      if (canvas.width !== bufferWidth) canvas.width = bufferWidth
      if (canvas.height !== bufferHeight) canvas.height = bufferHeight
      renderScale = Math.min(width / 800, height / 480)
      offsetX = (width - 800 * renderScale) / 2
      // Raise the turntable within its viewport while keeping the canvas and controls in place.
      offsetY = (height - 480 * renderScale) / 2 - 28 * renderScale
      paintCaption()
      draw()
      wake()
    }
    observe(ResizeObserver, resize, canvas)
    observe(ResizeObserver, paintCaption, caption)
    listen(window, 'resize', resize)
    listen(motion, 'change', () => {
      if (motion.matches) {
        auto = false
        updateAuto()
        clearTimeout(timer)
      }
      wake()
    })
    listen(document, 'visibilitychange', () => {
      clearTimeout(timer)
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else {
        nextAdvance = performance.now() + 6500
        resize()
      }
    })
    updateInfo()
    updateAuto()
    resize()
  })()

  return {
    setAlbums: (items) => setAlbums(items),
    dispose: () => {
      disposed = true
      frames.forEach((id) => window.cancelAnimationFrame(id))
      timers.forEach((id) => window.clearTimeout(id))
      observers.forEach((observer) => observer.disconnect())
      subscriptions.forEach((unsubscribe) => unsubscribe())
      images.forEach((image) => {
        image.onload = null
        image.onerror = null
        image.removeAttribute('src')
      })
      images.clear()
    },
  }
}
