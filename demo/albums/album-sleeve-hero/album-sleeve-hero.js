const themeToggle = document.querySelector('.theme-toggle')
const scene = document.querySelector('.scroll-scene')
const stageLabel = document.querySelector('.scroll-stage-label')
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let sceneStart = 0
let scrollRange = 1
let frame = null
let lastProgress = null

const clamp = (value) => Math.min(1, Math.max(0, value))
const smoothstep = (value) => value * value * (3 - 2 * value)

function renderScroll() {
  frame = null
  const progress = reducedMotion.matches ? 1 : clamp((window.scrollY - sceneStart) / scrollRange)
  if (progress === lastProgress) return
  lastProgress = progress
  // 先撕开封口，再抽出唱片；滚动反向时，所有状态按相同路径回退。
  const tear = clamp(progress / 0.22)
  const pull = smoothstep(clamp((progress - 0.2) / 0.62))
  scene.style.setProperty('--tear', `${tear * 100}%`)
  scene.style.setProperty('--pull', String(pull))
  scene.style.setProperty('--strip-y', `${-tear * 20}px`)
  scene.style.setProperty('--strip-opacity', String(Math.sin(tear * Math.PI)))
  scene.dataset.progress = String(progress)
  stageLabel.textContent =
    progress < 0.2
      ? '向下滚动，撕开封口'
      : progress < 0.82
        ? '继续滚动，抽出唱片'
        : '继续向下，浏览曲目'
}

function scheduleScroll() {
  if (frame === null) frame = requestAnimationFrame(renderScroll)
}

function measureScene() {
  sceneStart = scene.getBoundingClientRect().top + window.scrollY
  scrollRange = Math.max(1, scene.offsetHeight - window.innerHeight)
  lastProgress = null
  scheduleScroll()
}

function syncMotionPreference() {
  document.documentElement.dataset.reducedMotion = String(reducedMotion.matches)
  measureScene()
}

window.addEventListener('scroll', scheduleScroll, { passive: true })
window.addEventListener('resize', measureScene)
reducedMotion.addEventListener('change', syncMotionPreference)
syncMotionPreference()
document.fonts.ready.then(measureScene)

themeToggle.addEventListener('click', () => {
  const isLight = document.documentElement.dataset.theme === 'light'
  document.documentElement.dataset.theme = isLight ? 'dark' : 'light'
  themeToggle.setAttribute('aria-label', isLight ? '切换到浅色主题' : '切换到深色主题')
})
