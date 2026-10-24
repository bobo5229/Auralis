module.exports = function installSuedeCase(css) {
  const panel = document.querySelector('.placement-badges')
  if (!panel) throw new Error('Badge placement preview is missing')
  const sources = [...panel.querySelectorAll('img')].map((img) => img.src)

  // Static, deterministic nap: several noise scales and short, irregular fibres.
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 384
  const context = canvas.getContext('2d')
  const pixels = context.createImageData(384, 384)
  let seed = 20261024
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const patches = Float32Array.from({ length: 33 * 33 }, () => random())
  const smooth = (x) => x * x * (3 - 2 * x)
  for (let y = 0; y < 384; y++) {
    for (let x = 0; x < 384; x++) {
      const gx = x / 12
      const gy = y / 12
      const ix = Math.floor(gx)
      const iy = Math.floor(gy)
      const tx = smooth(gx - ix)
      const ty = smooth(gy - iy)
      const a = patches[iy * 33 + ix] * (1 - tx) + patches[iy * 33 + ix + 1] * tx
      const b = patches[(iy + 1) * 33 + ix] * (1 - tx) + patches[(iy + 1) * 33 + ix + 1] * tx
      const luminance = 127 + (random() - 0.5) * 72 + (a * (1 - ty) + b * ty - 0.5) * 24
      const index = (y * 384 + x) * 4
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = luminance
      pixels.data[index + 3] = 255
    }
  }
  context.putImageData(pixels, 0, 0)
  context.lineWidth = 0.6
  for (let i = 0; i < 14000; i++) {
    const x = random() * 384
    const y = random() * 384
    const length = 0.6 + random() * 2.3
    const angle = -1.1 + (random() - 0.5) * 1.9
    context.strokeStyle = random() > 0.5 ? 'rgba(223,227,234,0.15)' : 'rgba(18,22,28,0.18)'
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length)
    context.stroke()
  }

  panel.className = 'commemoration-case'
  panel.setAttribute('aria-label', '聆听纪念：炭灰麂皮与银色盒沿效果预览')
  panel.style.setProperty('--suede-nap', `url("${canvas.toDataURL('image/png')}")`)
  panel.innerHTML = `
    <div class="commemoration-case__lining">
      <header class="commemoration-case__header">
        <span>聆听纪念</span>
        <span class="commemoration-case__more">查看全部
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12 12 4M5 4h7v7"/></svg>
        </span>
      </header>
      <div class="commemoration-case__display">
        ${sources.map((src) => `<span class="commemoration-case__slot"><img src="${src}" alt="示意徽章" /></span>`).join('')}
      </div>
    </div>`
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  return { texture: { width: 384, height: 384 }, continuousAnimation: false }
}
