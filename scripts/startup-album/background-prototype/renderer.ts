import * as THREE from 'three'
import { createAlbumCard } from '../../../src/renderer/features/startupAlbum/rendering/card'
import { loadCardFonts } from '../../../src/renderer/features/startupAlbum/rendering/cardTypography'
import { createCardAppearance } from '../../../src/renderer/features/startupAlbum/rendering/cardAppearance'
import { randomPatternSeed } from '../../../src/renderer/features/startupAlbum/rendering/backgrounds/variation'
import { hasBrightSurface, variants, type BackgroundId } from './backgrounds'
import { createLegacyCoating } from './coating'
import { extractBackgroundPalette, getRedSurfaceStrength, neutralPalette } from './palette'
import './style.css'
import { verifyComposition } from './compositionVerification'

const host = document.querySelector<HTMLDivElement>('#stage')!
const captions = document.querySelector<HTMLDivElement>('#captions')!
const status = document.querySelector<HTMLSpanElement>('#status')!
const foilButton = document.querySelector<HTMLButtonElement>('#foil')!
const coatingButton = document.querySelector<HTMLButtonElement>('#coating')!
const swatches = document.querySelector<HTMLDivElement>('#palette-swatches')!
const paletteNote = document.querySelector<HTMLSpanElement>('#palette-note')!
let coverRevision = 0
const preview = JSON.parse(document.querySelector('#preview-config')?.textContent || '{}') as {
  title?: string
  artist?: string
  coverUrl?: string
  compare?: boolean
  verify?: boolean
  seed?: number
}
const albumTitle = preview.title || '夜航 · Night Flight'
const albumArtist = preview.artist || 'Auralis Studio'

function sampleCover() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1000
  const c = canvas.getContext('2d')!
  const sky = c.createLinearGradient(0, 0, 0, 1000)
  sky.addColorStop(0, '#12203e')
  sky.addColorStop(0.6, '#355c76')
  sky.addColorStop(1, '#c0a3a0')
  c.fillStyle = sky
  c.fillRect(0, 0, 1000, 1000)
  const moon = c.createRadialGradient(670, 315, 5, 670, 315, 145)
  moon.addColorStop(0, '#f5e4c8')
  moon.addColorStop(1, '#caa99f')
  c.fillStyle = moon
  c.beginPath()
  c.arc(670, 315, 145, 0, Math.PI * 2)
  c.fill()
  for (let i = 0; i < 5; i++) {
    c.beginPath()
    c.moveTo(0, 600 + i * 80)
    for (let x = 0; x <= 1000; x += 4)
      c.lineTo(x, 590 + i * 83 + Math.sin(x / 190 + i * 1.4) * 80 + Math.cos(x / 97 + i) * 28)
    c.lineTo(1000, 1000)
    c.lineTo(0, 1000)
    c.fillStyle = ['#607b8b', '#486879', '#325165', '#203b50', '#142b40'][i]
    c.fill()
  }
  c.fillStyle = '#f1e5d6'
  c.font = '300 66px "Segoe UI", sans-serif'
  c.fillText('NIGHT FLIGHT', 65, 120)
  c.font = '22px "Segoe UI", sans-serif'
  c.fillText('A STUDY IN BLUE', 70, 163)
  return canvas
}

let cover: CanvasImageSource = sampleCover()
let view: BackgroundId | 'all' | 'recent' = preview.compare ? 'all' : 'recent'
let foil = true
let separatedCoating = true
let disposed = false
let frame = 0
let layoutFrame = 0
let pointer: THREE.Vector2 | null = null
const reduced = matchMedia('(prefers-reduced-motion: reduce)')

function start() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setClearColor(0, 0)
  host.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-5, 5, 3, -3, 0.1, 100)
  camera.position.z = 12
  scene.add(new THREE.HemisphereLight('#ffffff', '#61728a', 2))
  const raycaster = new THREE.Raycaster()
  const cards = variants.map((variant) => {
    const album = createAlbumCard(
      {
        id: variant.id,
        title: albumTitle,
        artist: albumArtist,
        cover,
      },
      { appearance: createCardAppearance(cover, variant.id, preview.seed ?? randomPatternSeed()) },
    )
    const presentation = new THREE.Group()
    presentation.rotation.z = Math.PI / 120
    presentation.add(album.object)
    scene.add(presentation)
    const front = album.object.children[1] as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshBasicMaterial
    >
    const coated = front.material
    const legacyCoated = createLegacyCoating(album.texture)
    const plain = new THREE.MeshBasicMaterial({ map: album.texture, toneMapped: false })
    const diagnosticMask = preview.verify
      ? new THREE.MeshBasicMaterial({ map: album.printMask, toneMapped: false })
      : null
    return {
      variant,
      album,
      presentation,
      front,
      coated,
      legacyCoated,
      plain,
      diagnosticMask,
      targetX: 0,
      targetY: 0,
    }
  })

  function paint(regenerate = false) {
    let palette = neutralPalette()
    try {
      palette = extractBackgroundPalette(cover)
    } catch {
      // A valid image can still fail pixel readback; preserve cover + interaction.
    }
    swatches.replaceChildren()
    swatches.dataset.colors = JSON.stringify(palette.swatches)
    swatches.dataset.quality = palette.quality
    paletteNote.textContent =
      palette.quality === 'fallback'
        ? '取色不可用，使用中性底图'
        : palette.quality === 'neutral'
          ? '黑白封面 · 中性明暗层次'
          : '封面取色 · 主色与辅助色'
    for (const color of palette.swatches) {
      const swatch = document.createElement('span')
      swatch.style.backgroundColor = color
      swatch.title = color
      swatch.setAttribute('aria-label', color)
      swatches.append(swatch)
    }
    for (const { variant, album } of cards) {
      album.setContent(
        {
          id: variant.id,
          title: albumTitle,
          artist: albumArtist,
          cover,
        },
        {
          background: variant.id,
          palette,
          redSurface: hasBrightSurface(variant.id) ? getRedSurfaceStrength(palette) : 0,
          patternSeed: regenerate ? randomPatternSeed() : album.appearance.patternSeed,
        },
      )
    }
    invalidate()
  }

  function resize() {
    const width = host.clientWidth
    const height = host.clientHeight
    const visibleCards = cards.filter(
      (card) =>
        view === 'all' ||
        (view === 'recent'
          ? ['paper', 'terrain', 'flow'].includes(card.variant.id)
          : view === card.variant.id),
    )
    const small = matchMedia('(max-width: 1050px)').matches
    const columns = Math.min(visibleCards.length, small ? 2 : 4)
    const rows = Math.ceil(visibleCards.length / columns)
    const desiredHeight = rows === 1 ? (small ? 500 : 540) : rows * (small ? 450 : 480)
    if (host.clientHeight !== desiredHeight) {
      host.style.height = `${desiredHeight}px`
      return // ResizeObserver will render once the new layout has settled.
    }
    renderer.setDrawingBufferSize(width, height, Math.min(devicePixelRatio, 2))
    const worldHeight = rows * 4.8
    const worldWidth = (worldHeight * width) / height
    camera.left = -worldWidth / 2
    camera.right = worldWidth / 2
    camera.top = worldHeight / 2
    camera.bottom = -worldHeight / 2
    camera.updateProjectionMatrix()
    const cellWidth = worldWidth / columns
    const scale = Math.min(1.05, (cellWidth - 0.35) / 3.05)
    captions.replaceChildren()
    captions.style.gridTemplateColumns = `repeat(${columns}, 1fr)`
    captions.style.gridTemplateRows = `repeat(${rows}, 1fr)`
    cards.forEach((card, i) => {
      const cell = visibleCards.indexOf(card)
      card.presentation.visible = cell !== -1
      card.presentation.position.set(
        ((cell % columns) + 0.5) * cellWidth - worldWidth / 2,
        worldHeight / 2 - (Math.floor(cell / columns) + 0.5) * 4.8 + 0.25,
        0,
      )
      card.presentation.scale.setScalar(scale)
      if (card.presentation.visible) {
        const label = document.createElement('div')
        label.className = 'caption'
        const title = document.createElement('strong')
        title.textContent = `${String(i + 1).padStart(2, '0')} / ${card.variant.name}`
        const description = document.createElement('p')
        description.textContent = card.variant.description
        label.append(title, description)
        captions.append(label)
      }
    })
    resetHover()
    invalidate()
  }
  function invalidate() {
    if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(render)
  }
  function resetHover() {
    pointer = null
    cards.forEach((card) => {
      card.targetX = card.targetY = 0
    })
    invalidate()
  }
  function render() {
    frame = 0
    if (disposed || document.hidden) return
    scene.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    cards.forEach((card) => {
      card.targetX = card.targetY = 0
    })
    if (pointer && !reduced.matches) {
      raycaster.setFromCamera(pointer, camera)
      for (const card of cards) {
        if (!card.presentation.visible) continue
        card.album.hoverSurface.matrixWorld.copy(card.presentation.matrixWorld)
        const hit = raycaster.intersectObject(card.album.hoverSurface, false)[0]
        if (!hit) continue
        const local = card.presentation.worldToLocal(hit.point)
        card.targetX = -Math.max(-0.5, Math.min(0.5, local.y / 3.8)) * 0.8
        card.targetY = Math.max(-0.5, Math.min(0.5, local.x / 2.65)) * 1.1
      }
    }
    let moving = false
    for (const card of cards) {
      const rotation = card.album.object.rotation
      rotation.x += (card.targetX - rotation.x) * (reduced.matches ? 1 : 0.22)
      rotation.y += (card.targetY - rotation.y) * (reduced.matches ? 1 : 0.22)
      if (Math.abs(rotation.x - card.targetX) < 0.0003) rotation.x = card.targetX
      if (Math.abs(rotation.y - card.targetY) < 0.0003) rotation.y = card.targetY
      moving ||= rotation.x !== card.targetX || rotation.y !== card.targetY
    }
    renderer.render(scene, camera)
    if (moving) invalidate()
  }
  host.addEventListener('pointermove', (event) => {
    const rect = host.getBoundingClientRect()
    pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2,
    )
    invalidate()
  })
  host.addEventListener('pointerleave', resetHover)
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      view = button.dataset.view as typeof view
      document
        .querySelector('main')!
        .classList.toggle('single', view !== 'all' && view !== 'recent')
      document
        .querySelectorAll('[data-view]')
        .forEach((item) => item.setAttribute('aria-pressed', String(item === button)))
      resize()
    })
  })
  foilButton.addEventListener('click', () => {
    foil = !foil
    updateMaterials()
    foilButton.textContent = `闪膜：${foil ? '开启' : '关闭'}`
    foilButton.setAttribute('aria-pressed', String(foil))
    invalidate()
  })
  document.querySelector('#regenerate')!.addEventListener('click', () => {
    resetHover()
    paint(true)
    status.textContent = '已重新生成七种图案，封面与配色保持一致'
  })
  function updateMaterials() {
    for (const card of cards)
      card.front.material = foil ? (separatedCoating ? card.coated : card.legacyCoated) : card.plain
  }
  // Verification-only: project the actual glyph mask through the same camera
  // to locate printed strokes independently of their light/dark ink colour.
  const showPrintMask = (event: Event) => {
    if (!preview.verify) return
    if ((event as CustomEvent<boolean>).detail) {
      for (const card of cards) if (card.diagnosticMask) card.front.material = card.diagnosticMask
    } else updateMaterials()
    invalidate()
  }
  document.addEventListener('card-study-print-mask', showPrintMask)
  coatingButton.addEventListener('click', () => {
    separatedCoating = !separatedCoating
    coatingButton.textContent = `虹彩：${separatedCoating ? '分区增强' : '原有方式'}`
    coatingButton.setAttribute('aria-pressed', String(separatedCoating))
    updateMaterials()
    invalidate()
  })
  document.querySelector('#theme')!.addEventListener('click', (event) => {
    const light = document.body.classList.toggle('light')
    ;(event.currentTarget as HTMLButtonElement).textContent = `切换${light ? '深' : '浅'}色背景`
  })
  document.querySelector<HTMLInputElement>('#cover')!.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    const revision = ++coverRevision
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      if (disposed || revision !== coverRevision) return
      cover = image
      paint()
      status.textContent = '已更换封面并更新七种底图配色；文字仍为示例'
    } catch {
      if (!disposed && revision === coverRevision)
        status.textContent = '封面无法读取，保留上一张封面与底图'
    } finally {
      URL.revokeObjectURL(url)
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame)
      frame = 0
    } else invalidate()
  })
  reduced.addEventListener('change', resetHover)
  const observer = new ResizeObserver(() => {
    // A layout update can change stage height. Defer writes out of the observer
    // delivery cycle so they cannot trigger undelivered resize notifications.
    if (!layoutFrame && !disposed)
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = 0
        resize()
      })
  })
  observer.observe(host)
  window.addEventListener('beforeunload', () => {
    disposed = true
    cancelAnimationFrame(frame)
    cancelAnimationFrame(layoutFrame)
    observer.disconnect()
    reduced.removeEventListener('change', resetHover)
    document.removeEventListener('card-study-print-mask', showPrintMask)
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry)
        materials.add(object.material)
      }
    })
    for (const card of cards) {
      card.album.disposeArtwork()
      materials.add(card.coated)
      materials.add(card.legacyCoated)
      materials.add(card.plain)
      if (card.diagnosticMask) materials.add(card.diagnosticMask)
    }
    geometries.forEach((item) => item.dispose())
    materials.forEach((item) => item.dispose())
    renderer.dispose()
    renderer.forceContextLoss()
  })
  paint()
  resize()
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.view === view))
  })
  status.textContent = `${albumTitle} · ${albumArtist} · 七种底图已按同一封面配色`
  document.querySelector('#source-note')!.textContent = preview.coverUrl
    ? '本地真实封面 · 正式卡面渲染 · 固定初始图案种子'
    : '程序绘制示例封面 · 正式卡面渲染'
  if (preview.compare)
    document.body.dataset.composition = JSON.stringify(
      verifyComposition(extractBackgroundPalette(cover)),
    )
  document.body.dataset.ready = 'true'
}

try {
  if (preview.coverUrl) {
    const image = new Image()
    image.src = preview.coverUrl
    await image.decode()
    cover = image
  }
  await loadCardFonts(albumTitle, albumArtist)
  start()
} catch (error) {
  status.textContent = `原型渲染失败：${error instanceof Error ? error.message : String(error)}`
  console.error(error)
}
