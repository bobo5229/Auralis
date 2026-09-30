/** Reveal the real artwork through the original terminal's staggered noise decode. */
export function mountDecodedCover(
  container: HTMLElement,
  artworkUrl: string,
  delay: number,
): () => void {
  const image = document.createElement('img')
  image.alt = ''
  const canvas = document.createElement('canvas')
  canvas.className = 'cover-canvas cover-decode'
  canvas.width = canvas.height = 56
  canvas.setAttribute('aria-hidden', 'true')
  const ctx = canvas.getContext('2d')
  const sample = document.createElement('canvas')
  sample.width = sample.height = 56
  const sampleContext = sample.getContext('2d')
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let frame = 0
  let disposed = false

  function finish(): void {
    cancelAnimationFrame(frame)
    frame = 0
    canvas.remove()
  }
  function draw(progress: number): void {
    if (!ctx || !sampleContext) return
    const edge = 56
    ctx.globalAlpha = 1
    ctx.fillStyle = '#090c10'
    ctx.fillRect(0, 0, edge, edge)
    if (progress > 0 && image.naturalWidth > 0) {
      const resolution = Math.max(2, Math.round(edge * progress * progress))
      const crop = Math.min(image.naturalWidth, image.naturalHeight)
      sampleContext.clearRect(0, 0, edge, edge)
      sampleContext.drawImage(
        image,
        (image.naturalWidth - crop) / 2,
        (image.naturalHeight - crop) / 2,
        crop,
        crop,
        0,
        0,
        resolution,
        resolution,
      )
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(sample, 0, 0, resolution, resolution, 0, 0, edge, edge)
    }
    const block = progress > 0.8 ? 16 : progress > 0.5 ? 8 : progress > 0.2 ? 4 : 2
    ctx.globalAlpha = 1 - progress * progress
    for (let y = 0; y < edge; y += block) {
      for (let x = 0; x < edge; x += block) {
        ctx.fillStyle = `rgb(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255})`
        ctx.fillRect(x, y, block, block)
      }
    }
    ctx.globalAlpha = 1
  }
  function loaded(): void {
    if (disposed) return
    if (motion.matches || !ctx || !sampleContext) {
      finish()
      return
    }
    const start = performance.now() + delay
    const tick = (now: number): void => {
      if (disposed) return
      const progress = Math.max(0, (now - start) / 900)
      if (progress >= 1 || motion.matches) {
        finish()
        return
      }
      draw(progress)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  }
  function failed(): void {
    if (disposed) return
    finish()
    const fallback = document.createElement('span')
    fallback.className = 'cover-fallback'
    fallback.textContent = '无封面'
    image.replaceWith(fallback)
  }
  function preferenceChanged(): void {
    if (motion.matches) finish()
  }
  image.addEventListener('load', loaded, { once: true })
  image.addEventListener('error', failed, { once: true })
  motion.addEventListener('change', preferenceChanged)
  container.replaceChildren(image)
  if (!motion.matches && ctx && sampleContext) {
    draw(0)
    container.append(canvas)
  }
  image.src = artworkUrl

  return () => {
    disposed = true
    finish()
    image.removeEventListener('load', loaded)
    image.removeEventListener('error', failed)
    motion.removeEventListener('change', preferenceChanged)
    image.removeAttribute('src')
  }
}
