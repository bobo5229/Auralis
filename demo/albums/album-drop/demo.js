/* Standalone motion preview. All artwork and audio are local demonstration assets. */
const paths = {
  music:
    '<path d="M9 18V5l12-2v13M9 8l12-2"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M7 7l2 2m6 6 2 2"/>',
  archive: '<path d="M3 4h18v5H3zM5 9v11h14V9M10 13h4"/>',
  settings:
    '<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  play: '<path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor" stroke="none"/>',
  previous: '<path d="M5 5v14m14-14L7 12l12 7z"/>',
  next: '<path d="M19 5v14M5 5l12 7-12 7z"/>',
  queue: '<path d="M4 5h16M4 11h16M4 17h10m4-2 4 3-4 3z"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-6 5H2v6h3l6 5zM16 9l6 6m0-6-6 6"/>',
}
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`
}
document.querySelectorAll('[data-icon]').forEach((element) => {
  element.innerHTML = icon(element.dataset.icon)
})

const albums = [
  {
    title: '潮汐之间',
    artist: '海岸线',
    year: '2024',
    ink: '#d7c3aa',
    paper: '#234c49',
    light: '#789b8c',
    shape: 'tide',
  },
  {
    title: '夜航',
    artist: '南方来信',
    year: '2023',
    ink: '#ecd7af',
    paper: '#282e4e',
    light: '#a78c88',
    shape: 'moon',
  },
  {
    title: '慢慢醒来',
    artist: '松间',
    year: '2025',
    ink: '#334536',
    paper: '#d4d2b7',
    light: '#9bac87',
    shape: 'sun',
  },
  {
    title: '余温',
    artist: '回声计划',
    year: '2022',
    ink: '#f4d9bc',
    paper: '#84483a',
    light: '#c49272',
    shape: 'arch',
  },
  {
    title: '风经过的时候',
    artist: '海岸线',
    year: '2021',
    ink: '#e5e4d5',
    paper: '#52666c',
    light: '#a1ada3',
    shape: 'moon',
  },
  {
    title: '房间里的雨',
    artist: '松间',
    year: '2020',
    ink: '#ced8bb',
    paper: '#38432e',
    light: '#73886c',
    shape: 'tide',
  },
  {
    title: '远处的灯',
    artist: '南方来信',
    year: '2024',
    ink: '#dce2dd',
    paper: '#383c46',
    light: '#748585',
    shape: 'arch',
  },
  {
    title: '日落以后',
    artist: '回声计划',
    year: '2023',
    ink: '#453438',
    paper: '#c99a88',
    light: '#edcabb',
    shape: 'sun',
  },
]
function coverArtwork(album, index) {
  const shapes = {
    tide: `<path d="M-30 230Q130 80 330 230T700 210V520H-30Z" fill="${album.light}"/><path d="M-30 310Q180 170 360 310T710 310V540H-30Z" fill="${album.ink}" opacity=".65"/><path d="M-30 400Q180 240 360 400T710 400V570H-30Z" fill="${album.paper}" opacity=".72"/>`,
    moon: `<circle cx="308" cy="215" r="117" fill="${album.ink}"/><circle cx="262" cy="182" r="103" fill="${album.paper}"/><path d="M0 460 250 325l170 75 180-115v315H0Z" fill="${album.light}" opacity=".5"/>`,
    sun: `<circle cx="300" cy="252" r="127" fill="${album.light}"/><path d="M0 342h600v125H0z" fill="${album.paper}"/><path d="M25 345h550m-550 30h550m-550 30h550" fill="none" stroke="${album.ink}" stroke-width="2" opacity=".4"/>`,
    arch: `<path d="M130 458V250a170 170 0 0 1 340 0v208" fill="${album.light}"/><path d="M216 458V255a84 84 0 0 1 168 0v203" fill="${album.paper}"/><path d="M0 459h600" stroke="${album.ink}" opacity=".6" stroke-width="2"/>`,
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="${album.paper}"/>${shapes[album.shape]}<text x="40" y="63" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="19" letter-spacing="4" fill="${album.ink}">AURALIS · STUDY ${String(index + 1).padStart(2, '0')}</text><text x="40" y="526" font-family="Microsoft YaHei,sans-serif" font-size="41" font-weight="500" fill="${album.ink}">${album.title}</text><text x="42" y="561" font-family="Microsoft YaHei,sans-serif" font-size="18" fill="${album.ink}" opacity=".8">${album.artist} / ${album.year}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
albums.forEach((album, index) => {
  album.cover = coverArtwork(album, index)
})
const grid = document.getElementById('album-grid')
albums.forEach((album, index) => {
  const card = document.createElement('article')
  card.className = 'album-card'
  card.innerHTML = `<button class="album-cover" type="button" data-album="${index}" aria-label="长按播放《${album.title}》"><img src="${album.cover}" alt="《${album.title}》演示封面" draggable="false" /></button><h2>${album.title}</h2><p>${album.artist}</p><span class="album-year">${album.year} 年</span>`
  grid.append(card)
})

const stage = document.getElementById('motion-stage')
const playbar = document.getElementById('playbar')
const hint = document.getElementById('hint')
const reduceMotion = document.getElementById('reduce-motion')
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
reduceMotion.checked = motionPreference.matches
function updateMotionPreference() {
  document.body.classList.toggle('reduced-motion', reduceMotion.checked)
}
updateMotionPreference()
reduceMotion.addEventListener('change', () => {
  cancelSequence()
  updateMotionPreference()
})
motionPreference.addEventListener('change', (event) => {
  reduceMotion.checked = event.matches
  cancelSequence()
  updateMotionPreference()
})

let revision = 0
let sequence = null
let press = null
let suppressedClick = null
const animations = new Set()
function setPhase(phase) {
  document.body.dataset.phase = phase
}
setPhase('idle')
function cancelPress() {
  if (!press) return
  cancelAnimationFrame(press.frame)
  press.cover.classList.remove('holding')
  if (press.moved || press.triggered) suppressedClick = press.cover
  press = null
}
function cleanupSequence() {
  animations.forEach((animation) => animation.cancel())
  animations.clear()
  if (sequence) sequence.cover.style.visibility = ''
  sequence = null
  stage.replaceChildren()
  document.body.classList.remove('in-motion')
  setPhase('idle')
}
function cancelSequence() {
  revision += 1
  cancelPress()
  cleanupSequence()
}
async function animate(element, keyframes, duration, token, easing = 'cubic-bezier(.16,1,.3,1)') {
  if (token !== revision) return false
  const animation = element.animate(keyframes, { duration, easing, fill: 'forwards' })
  animations.add(animation)
  try {
    await animation.finished
  } catch {
    return false
  }
  return token === revision
}
const clamp = (value, min, max) => Math.max(min, Math.min(value, max))
const smooth = (value) => value * value * (3 - 2 * value)
function discTransform(x, y, diameter, angle = 0, scale = 1, tilt = 0) {
  return `translate3d(${x - diameter / 2}px,${y - diameter / 2}px,0) scale(${scale}) rotateX(${tilt}deg) rotate(${angle}deg)`
}

async function launchAlbum(cover) {
  cancelSequence()
  const token = revision
  const album = albums[Number(cover.dataset.album)]
  const rect = cover.getBoundingClientRect()
  const bar = playbar.getBoundingClientRect()
  const rate = Number(document.getElementById('speed').value)
  const requestedDirection = document.getElementById('direction').value
  const sourceCenterX = rect.left + rect.width / 2
  const sourceCenterY = rect.top + rect.height / 2
  const direction =
    requestedDirection === 'left'
      ? -1
      : requestedDirection === 'right'
        ? 1
        : sourceCenterX > window.innerWidth / 2
          ? -1
          : 1
  const scale = Math.min(1.18, (window.innerHeight - 165) / rect.height)
  const enlargedWidth = rect.width * scale
  const diameter = enlargedWidth * 0.9
  const overlap = 18
  const minX = direction === -1 ? diameter - overlap + 20 : 20
  const maxX =
    direction === 1
      ? window.innerWidth - enlargedWidth - diameter + overlap - 20
      : window.innerWidth - enlargedWidth - 20
  const coverLeft = clamp(sourceCenterX - enlargedWidth / 2, minX, maxX)
  const coverTop = clamp(sourceCenterY - enlargedWidth / 2, 24, bar.top - enlargedWidth - 32)
  const centerX = coverLeft + enlargedWidth / 2
  const centerY = coverTop + enlargedWidth / 2
  const coverTransform = `translate(${centerX - sourceCenterX}px,${centerY - sourceCenterY}px) scale(${scale})`
  const floatingCover = document.createElement('div')
  floatingCover.className = 'floating-cover'
  Object.assign(floatingCover.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  })
  floatingCover.append(cover.querySelector('img').cloneNode())
  const disc = document.createElement('div')
  disc.className = 'disc-position'
  Object.assign(disc.style, {
    left: '0',
    top: '0',
    width: `${diameter}px`,
    height: `${diameter}px`,
    transform: discTransform(centerX, centerY, diameter),
  })
  disc.innerHTML = `<div class="disc"><div class="disc-label">${album.title}</div><div class="disc-subtitle">AURALIS · DEMO AUDIO</div></div>`
  disc.style.setProperty('--disc-artwork', `url("${album.cover}")`)
  const labelFace = document.createElement('div')
  labelFace.className = 'disc disc-back'
  disc.append(labelFace)
  stage.append(disc, floatingCover)
  sequence = { cover, token }
  cover.style.visibility = 'hidden'
  document.body.classList.add('in-motion')
  document.getElementById('queue-panel').hidden = true
  document.getElementById('queue-toggle').setAttribute('aria-expanded', 'false')
  setPhase('focus')
  if (
    !(await animate(
      floatingCover,
      [{ transform: 'translate(0,0) scale(1)' }, { transform: coverTransform }],
      reduceMotion.checked ? 100 : 260 * rate,
      token,
    ))
  )
    return

  const extractedX = centerX + direction * (enlargedWidth / 2 + diameter / 2 - overlap)
  const targetX = clamp(bar.left + bar.width / 2 + direction * 80, bar.left + 70, bar.right - 70)
  const targetY = bar.top + 10
  let lastTransform = discTransform(extractedX, centerY, diameter, direction * 18)
  if (!reduceMotion.checked) {
    setPhase('extract')
    if (
      !(await animate(
        disc,
        [{ transform: discTransform(centerX, centerY, diameter) }, { transform: lastTransform }],
        380 * rate,
        token,
        'cubic-bezier(.22,1,.36,1)',
      ))
    )
      return
    disc.style.zIndex = '3'
    setPhase('flight')
    const frames = Array.from({ length: 61 }, (_, index) => {
      const t = index / 60
      const x = extractedX + (targetX - extractedX) * t
      const y = centerY + (targetY - centerY) * t * t
      const shrinking = 1 - 0.58 * smooth(t)
      const flip = 360 * smooth(clamp((t - 0.08) / 0.72, 0, 1))
      const landingTilt = 62 * smooth(clamp((t - 0.8) / 0.2, 0, 1))
      const tilt = flip + landingTilt
      lastTransform = discTransform(x, y, diameter, direction * (18 + 260 * t), shrinking, tilt)
      return { transform: lastTransform, offset: t }
    })
    if (!(await animate(disc, frames, 760 * rate, token, 'linear'))) return
  } else {
    disc.style.opacity = '0'
    lastTransform = discTransform(targetX, targetY, diameter, 0, 0.42, 62)
    disc.style.transform = lastTransform
  }
  if (token !== revision) return
  setPhase('landing')
  startAlbum(album)
  const duration = reduceMotion.checked ? 100 : 180 * rate
  const barAnimation = reduceMotion.checked
    ? Promise.resolve(true)
    : animate(
        playbar,
        [
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(3px) scale(.989)', offset: 0.35 },
          { transform: 'translateY(0) scale(1)' },
        ],
        290 * rate,
        token,
        'cubic-bezier(.22,1,.36,1)',
      )
  if (
    !(await animate(
      disc,
      [
        { transform: lastTransform, opacity: reduceMotion.checked ? 0 : 1 },
        {
          transform: discTransform(
            targetX,
            targetY + 12,
            diameter,
            direction * 290,
            0.16,
            reduceMotion.checked ? 76 : 436,
          ),
          opacity: 0,
        },
      ],
      duration,
      token,
    ))
  )
    return
  setPhase('return')
  document.body.classList.remove('in-motion')
  const returned = await animate(
    floatingCover,
    [{ transform: coverTransform }, { transform: 'translate(0,0) scale(1)' }],
    reduceMotion.checked ? 100 : 240 * rate,
    token,
  )
  await barAnimation
  if (returned && token === revision) {
    cleanupSequence()
    hint.textContent = `正在顺序播放《${album.title}》的全部 3 首演示音 · 可继续长按其他专辑`
  }
}

grid.addEventListener('pointerdown', (event) => {
  const cover = event.target.closest('.album-cover')
  if (!cover || event.button !== 0 || sequence) return
  cancelPress()
  suppressedClick = null
  const state = {
    cover,
    x: event.clientX,
    y: event.clientY,
    triggered: false,
    moved: false,
    frame: null,
    startedAt: performance.now(),
  }
  press = state
  cover.classList.add('holding')
  function advanceHold(now) {
    if (press !== state || state.moved) return
    if (now - state.startedAt < 500) {
      state.frame = requestAnimationFrame(advanceHold)
      return
    }
    state.triggered = true
    suppressedClick = cover
    cover.classList.remove('holding')
    launchAlbum(cover).catch((error) => {
      console.error(error)
      cancelSequence()
      hint.textContent = '动效已取消，可重新长按封面'
    })
  }
  state.frame = requestAnimationFrame(advanceHold)
  unlockAudio()
})
window.addEventListener('pointermove', (event) => {
  if (!press || press.triggered) return
  if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 9) {
    press.moved = true
    cancelPress()
  }
})
window.addEventListener('pointerup', cancelPress)
window.addEventListener('pointercancel', cancelPress)
grid.addEventListener('click', (event) => {
  const cover = event.target.closest('.album-cover')
  if (!cover) return
  if (suppressedClick === cover) {
    suppressedClick = null
    event.preventDefault()
    return
  }
  hint.textContent = '轻点保留专辑详情入口；这个预览中，请长按封面 500ms'
})
grid.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  cancelPress()
})
grid.addEventListener('keydown', (event) => {
  const cover = event.target.closest('.album-cover')
  if (cover && event.key === 'Enter' && event.shiftKey && !sequence) {
    event.preventDefault()
    unlockAudio()
    launchAlbum(cover)
  }
})
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    cancelSequence()
    document.getElementById('queue-panel').hidden = true
    document.getElementById('queue-toggle').setAttribute('aria-expanded', 'false')
    hint.textContent = '已取消 · 可重新长按任一封面'
  }
})
window.addEventListener(
  'wheel',
  () => {
    if (press || sequence) cancelSequence()
  },
  { passive: true },
)
window.addEventListener('resize', cancelSequence)
window.addEventListener('blur', cancelSequence)

// Three short, gentle synthetic tracks make the landing trigger audible without using a music library.
const songNames = ['序曲', '回响', '归途']
const trackDuration = 18
let audioContext = null
let masterGain = null
const buffers = []
const preparedSamples = []
let pendingPlayback = null
let source = null
let audioRevision = 0
let currentAlbum = null
let trackIndex = 0
let playing = false
let muted = false
let pausedAt = 0
let startedAt = 0
function prepareAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext()
    masterGain = audioContext.createGain()
    masterGain.gain.value = muted ? 0 : 0.28
    masterGain.connect(audioContext.destination)
  }
  preparedSamples.forEach((samples, index) => prepareBuffer(samples, index))
}
function unlockAudio() {
  prepareAudioContext()
  audioContext.resume().catch((error) => {
    console.error(error)
    hint.textContent = '试听音暂不可用，仍可预览动效'
  })
}
function prepareBuffer(samples, index) {
  if (!audioContext || buffers[index]) return
  const buffer = audioContext.createBuffer(1, samples.length, 24000)
  buffer.copyToChannel(samples, 0)
  buffers[index] = buffer
}
function makeTrack(index) {
  const sampleRate = 24000
  const data = new Float32Array(sampleRate * 18)
  const roots = [
    [48, 53, 55, 48],
    [50, 55, 57, 50],
    [45, 50, 52, 45],
  ][index]
  const arpeggio = [0, 7, 12, 16, 12, 7, 4, 7]
  for (let i = 0; i < data.length; i += 1) {
    const t = i / sampleRate
    const root = roots[Math.min(3, Math.floor(t / 4.5))]
    const chordTime = t % 4.5
    const noteTime = t % 0.5625
    const note = root + 12 + arpeggio[Math.floor(t / 0.5625) % arpeggio.length]
    const rootFrequency = 440 * 2 ** ((root - 69) / 12)
    const frequency = 440 * 2 ** ((note - 69) / 12)
    const pad =
      0.075 *
      Math.sin((Math.PI * chordTime) / 4.5) *
      (Math.sin(2 * Math.PI * rootFrequency * chordTime) +
        0.35 * Math.sin(2 * Math.PI * rootFrequency * 1.5 * chordTime))
    const pluck =
      0.13 *
      Math.exp(-noteTime * 9) *
      Math.min(1, noteTime * 120) *
      (Math.sin(2 * Math.PI * frequency * noteTime) +
        0.18 * Math.sin(4 * Math.PI * frequency * noteTime))
    const envelope = Math.min(1, t * 3, (18 - t) * 2)
    data[i] = (pad + pluck) * envelope
  }
  return data
}
// Synthesize away from the UI thread so the first long press uses the same timing as later ones.
const workerUrl = URL.createObjectURL(
  new Blob(
    [
      `${makeTrack.toString()}; onmessage = () => { for (let index = 0; index < 3; index++) { const samples = makeTrack(index); postMessage({ index, samples }, [samples.buffer]); } };`,
    ],
    { type: 'text/javascript' },
  ),
)
const audioWorker = new Worker(workerUrl)
audioWorker.onmessage = (event) => {
  const { index, samples } = event.data
  preparedSamples[index] = samples
  prepareBuffer(samples, index)
  if (preparedSamples.filter(Boolean).length === 3) {
    audioWorker.terminate()
    URL.revokeObjectURL(workerUrl)
    if (pendingPlayback && currentAlbum) playTrack(pendingPlayback.index, pendingPlayback.position)
  }
}
audioWorker.onerror = (event) => {
  console.error(event.message)
  hint.textContent = '试听音暂不可用，仍可预览动效'
}
audioWorker.postMessage('prepare')
function elapsed() {
  return playing ? Math.min(trackDuration, audioContext.currentTime - startedAt) : pausedAt
}
function stopSource() {
  audioRevision += 1
  if (source) {
    source.onended = null
    source.stop()
    source.disconnect()
    source = null
  }
}
function playTrack(index, position = 0) {
  if (!currentAlbum || !audioContext) return
  if (!buffers[index]) {
    pendingPlayback = { index, position }
    return
  }
  pendingPlayback = null
  stopSource()
  trackIndex = clamp(index, 0, songNames.length - 1)
  pausedAt = clamp(position, 0, trackDuration - 0.01)
  source = audioContext.createBufferSource()
  source.buffer = buffers[trackIndex]
  source.connect(masterGain)
  const token = audioRevision
  source.onended = () => {
    if (token !== audioRevision) return
    source = null
    if (trackIndex + 1 < songNames.length) playTrack(trackIndex + 1)
    else {
      playing = false
      pausedAt = trackDuration
      renderPlayback()
    }
  }
  startedAt = audioContext.currentTime - pausedAt
  playing = true
  source.start(0, pausedAt)
  renderPlayback()
}
function startAlbum(album) {
  currentAlbum = album
  playbar.style.background = `color-mix(in srgb, ${album.paper} 28%, #232821)`
  document.getElementById('track-cover').innerHTML =
    `<img src="${album.cover}" alt="《${album.title}》封面" />`
  if (audioContext?.state === 'running') playTrack(0)
  else {
    trackIndex = 0
    pausedAt = 0
    playing = false
    renderPlayback()
    hint.textContent = '专辑已加入演示队列，点击播放可试听'
  }
}
function renderPlayback() {
  document.getElementById('play-pause').disabled = !currentAlbum
  document.getElementById('previous').disabled = !currentAlbum
  document.getElementById('next').disabled = !currentAlbum
  document.getElementById('progress').disabled = !currentAlbum
  document.getElementById('play-pause').innerHTML = icon(playing ? 'pause' : 'play')
  document.getElementById('play-pause').setAttribute('aria-label', playing ? '暂停' : '播放')
  document.getElementById('track-title').textContent = currentAlbum
    ? `${songNames[trackIndex]} · ${trackIndex + 1} / 3`
    : '尚未播放'
  document.getElementById('track-subtitle').textContent = currentAlbum
    ? `${currentAlbum.artist} · ${currentAlbum.title}`
    : '长按专辑封面开始整张播放'
  document.getElementById('duration').textContent = currentAlbum ? '0:18' : '0:00'
  renderQueue()
}
function renderQueue() {
  const panel = document.getElementById('queue-panel')
  panel.replaceChildren()
  const title = document.createElement('h3')
  title.textContent = currentAlbum ? currentAlbum.title : '播放队列'
  panel.append(title)
  if (!currentAlbum) {
    const text = document.createElement('p')
    text.textContent = '长按封面，开始整张播放'
    panel.append(text)
    return
  }
  songNames.forEach((name, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `queue-track${index === trackIndex ? ' active' : ''}`
    button.textContent = `${String(index + 1).padStart(2, '0')}　${name}`
    button.addEventListener('click', () => {
      unlockAudio()
      playTrack(index)
    })
    panel.append(button)
  })
}
document.getElementById('play-pause').addEventListener('click', () => {
  unlockAudio()
  if (playing) {
    pausedAt = elapsed()
    playing = false
    stopSource()
    renderPlayback()
  } else playTrack(trackIndex, pausedAt >= trackDuration ? 0 : pausedAt)
})
document.getElementById('previous').addEventListener('click', () => {
  unlockAudio()
  playTrack(Math.max(0, trackIndex - 1))
})
document.getElementById('next').addEventListener('click', () => {
  unlockAudio()
  playTrack((trackIndex + 1) % songNames.length)
})
document.getElementById('mute').addEventListener('click', () => {
  muted = !muted
  if (masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : 0.28, audioContext.currentTime, 0.03)
  document.getElementById('mute').innerHTML = icon(muted ? 'muted' : 'volume')
  document.getElementById('mute').setAttribute('aria-label', muted ? '取消静音' : '静音')
})
document.getElementById('progress').addEventListener('input', (event) => {
  const position = Number(event.target.value)
  if (playing) playTrack(trackIndex, position)
  else pausedAt = position
})
document.getElementById('queue-toggle').addEventListener('click', () => {
  const panel = document.getElementById('queue-panel')
  panel.hidden = !panel.hidden
  document.getElementById('queue-toggle').setAttribute('aria-expanded', String(!panel.hidden))
  renderQueue()
})
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('#queue-panel, #queue-toggle')) {
    document.getElementById('queue-panel').hidden = true
    document.getElementById('queue-toggle').setAttribute('aria-expanded', 'false')
  }
})
document.getElementById('reset').addEventListener('click', () => {
  cancelSequence()
  stopSource()
  currentAlbum = null
  pendingPlayback = null
  playing = false
  pausedAt = 0
  playbar.style.background = ''
  document.getElementById('track-cover').innerHTML = icon('disc')
  document.getElementById('queue-panel').hidden = true
  document.getElementById('queue-toggle').setAttribute('aria-expanded', 'false')
  hint.textContent = '长按 500ms · 松手前可取消 · Esc 取消动效'
  renderPlayback()
})
function updateProgress() {
  const time = elapsed()
  const progress = document.getElementById('progress')
  progress.value = time
  progress.style.setProperty('--progress', `${(100 * time) / trackDuration}%`)
  document.getElementById('elapsed').textContent = `0:${String(Math.floor(time)).padStart(2, '0')}`
  requestAnimationFrame(updateProgress)
}
prepareAudioContext()
renderPlayback()
requestAnimationFrame(updateProgress)
window.addEventListener('pagehide', () => {
  cancelSequence()
  stopSource()
  audioContext?.close()
  audioWorker.terminate()
  URL.revokeObjectURL(workerUrl)
})

// Preview export controls used by the local Electron viewer.
window.albumDropPreview = {
  play: (index = 0) => {
    unlockAudio()
    return launchAlbum(grid.querySelector(`[data-album="${index}"]`))
  },
  cancel: cancelSequence,
  state: () => ({
    phase: document.body.dataset.phase,
    album: currentAlbum?.title ?? null,
    track: trackIndex,
    playing,
    elapsed: elapsed(),
    audioState: audioContext?.state ?? 'idle',
    queueLength: currentAlbum ? songNames.length : 0,
  }),
}
