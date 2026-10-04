const duration = 900
const canonicalWave = 'M17 38C23 29.5 28 45.5 34 37.5S42 32 47 38'
const wave = document.querySelector('#wave')
const contour = document.querySelector('#contour')
const legs = [document.querySelector('#left-leg'), document.querySelector('#right-leg')]
const wordmark = document.querySelector('#wordmark')
const seek = document.querySelector('#seek')
const time = document.querySelector('#time')
const play = document.querySelector('#play')
const speed = document.querySelector('#speed')
const reduce = document.querySelector('#reduce')
const preference = matchMedia('(prefers-reduced-motion: reduce)')
reduce.checked = preference.matches
let frame = 0
let position = duration
let startedAt = 0
let startPosition = 0
let playing = false
const lengths = legs.map((leg) => leg.getTotalLength())
const clamp = (value) => Math.max(0, Math.min(1, value))
const ease = (value) => 1 - (1 - clamp(value)) ** 3

function render(milliseconds) {
  position = Math.max(0, Math.min(duration, milliseconds))
  seek.value = String(Math.round(position))
  time.textContent = `${Math.round(position)} ms`
  seek.setAttribute('aria-valuetext', `${Math.round(position)} 毫秒`)
  if (reduce.checked) {
    legs.forEach((leg) => {
      leg.style.opacity = '0'
    })
    contour.style.opacity = String(ease(position / 180))
    wave.style.opacity = contour.style.opacity
    wave.setAttribute('d', canonicalWave)
    wordmark.style.opacity = contour.style.opacity
    wordmark.style.transform = 'none'
    return
  }

  const spread = ease(position / 240)
  const shape = ease((position - 45) / 260)
  const settle = clamp((position - 610) / 250)
  const amplitude = shape + Math.sin(settle * Math.PI * 2) * 0.12 * (1 - settle) ** 2
  const x = (value) => (32 + (value - 32) * (0.12 + spread * 0.88)).toFixed(3)
  const y = (value) => (38 + (value - 38) * amplitude).toFixed(3)
  wave.setAttribute(
    'd',
    position >= 860
      ? canonicalWave
      : `M${x(17)} 38C${x(23)} ${y(29.5)} ${x(28)} ${y(45.5)} ${x(34)} ${y(37.5)}S${x(42)} ${y(32)} ${x(47)} 38`,
  )
  wave.style.opacity = String(ease(position / 90))
  const growth = ease((position - 200) / 420)
  const joined = position >= 620
  contour.style.opacity = joined ? '1' : '0'
  legs.forEach((leg, index) => {
    leg.style.opacity = !joined && position > 200 ? '1' : '0'
    leg.style.strokeDasharray = String(lengths[index])
    leg.style.strokeDashoffset = String(lengths[index] * (1 - growth))
  })
  const lettering = ease((position - 570) / 280)
  wordmark.style.opacity = String(lettering)
  wordmark.style.transform = `translateY(${(1 - lettering) * 4}px)`
}

function stop() {
  cancelAnimationFrame(frame)
  playing = false
  play.querySelector('span').textContent = position >= duration ? '重新播放' : '继续播放'
}

function tick(now) {
  render(startPosition + (now - startedAt) * Number(speed.value))
  if (position >= duration) {
    stop()
  } else {
    frame = requestAnimationFrame(tick)
  }
}

function start(restart = false) {
  cancelAnimationFrame(frame)
  if (restart || position >= duration) render(0)
  startPosition = position
  startedAt = performance.now()
  playing = true
  play.querySelector('span').textContent = '暂停播放'
  frame = requestAnimationFrame(tick)
}

play.addEventListener('click', () => {
  if (playing) stop()
  else start()
})
seek.addEventListener('input', () => {
  stop()
  render(Number(seek.value))
  stop()
})
speed.addEventListener('change', () => {
  if (playing) start()
})
reduce.addEventListener('change', () => start(true))
preference.addEventListener('change', (event) => {
  reduce.checked = event.matches
  start(true)
})
document.querySelectorAll('input[name="theme"]').forEach((input) => {
  input.addEventListener('change', () => {
    document.documentElement.dataset.theme = input.value
  })
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) stop()
})
// Keep the default SVG visible when scripting is unavailable; start after local fonts settle.
document.fonts.ready.then(() => start(true))
