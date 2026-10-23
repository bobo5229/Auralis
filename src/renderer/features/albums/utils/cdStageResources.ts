import { animateFrames } from '@renderer/shared/animation/motion'
import { cdAlbumIndex, cdSlots } from './cdGeometry'
import { cdPlaybackWavePath, cdPlaybackWaveSeed } from './cdPlaybackWave'
import type { CdStartupDisc } from './cdStartup'

export interface CdAlbum {
  key: string
  artworkUrl: string | null
}

export interface CdStageNode {
  readonly index: number
  readonly albumKey: string
  slot: HTMLDivElement
  positionTransform: string
  poseScale: number
  rotation: { x: number; y: number; z: number }
  disc: HTMLDivElement
  art: HTMLDivElement
  hoverPlane: HTMLDivElement
  waveRing?: SVGSVGElement
  waveTrack?: SVGPathElement
  sidewall?: SVGSVGElement
  sidewallBands?: SVGPathElement[]
  shadow?: SVGSVGElement
  shadowPath?: SVGPathElement
  waveProgress?: SVGPathElement
  wavePaths?: SVGPathElement[]
  waveSeed: number
}

interface NodeResources {
  image?: HTMLImageElement
  artwork: 'idle' | 'decoding' | 'shown' | 'deferred' | 'dropped'
  vinyl?: HTMLDivElement
}

export interface CdStartupPreparation {
  readonly pool: ReadonlyMap<number, CdStartupDisc>
  readonly count: number
  isCurrent(): boolean
}

/** Owns DOM lifetimes and texture preparation; never owns the startup motion. */
export function createCdStageResources(
  stage: HTMLElement,
  dimensions: () => { width: number; height: number },
  beforeRemove: (node: CdStageNode) => void,
  onArtworkRotation?: () => void,
) {
  const nodes = new Map<number, CdStageNode>()
  const nodeResources = new WeakMap<CdStageNode, NodeResources>()
  const resource = (node: CdStageNode): NodeResources => nodeResources.get(node)!
  const discNodes = new WeakMap<EventTarget, CdStageNode>()
  const artworkAngles = new Map<string, number>()
  let albums: readonly CdAlbum[] = []
  let startupGeneration = 0
  let preparing = false
  let preparationTimer: ReturnType<typeof setTimeout> | undefined
  let preparationCover: HTMLDivElement | undefined
  let cancelWarmup: (() => void) | undefined
  const readyImages = new Set<HTMLImageElement>()

  function removeNode(node: CdStageNode): void {
    beforeRemove(node)
    discNodes.delete(node.disc)
    releaseStartupImage(node)
    node.slot.remove()
    nodes.delete(node.index)
  }

  function releaseStartupImage(node: CdStageNode, deferred = false): void {
    const image = resource(node).image
    resource(node).image = undefined
    resource(node).artwork = deferred ? 'deferred' : 'dropped'
    if (!image) return
    readyImages.delete(image)
    image.remove()
    image.src = ''
  }

  function ensureDiscArtwork(node: CdStageNode, startupDisc = false): void {
    if (
      resource(node).image ||
      (resource(node).artwork !== 'idle' && resource(node).artwork !== 'deferred')
    )
      return
    const album = albums[cdAlbumIndex(node.index, albums.length)]
    if (album?.key !== node.albumKey || !album.artworkUrl) {
      resource(node).artwork = 'dropped'
      return
    }
    const image = new Image()
    image.alt = ''
    image.decoding = 'async'
    image.draggable = false
    image.addEventListener(
      'error',
      () => {
        if (resource(node).image === image) releaseStartupImage(node)
      },
      { once: true },
    )
    resource(node).image = image
    resource(node).artwork = 'idle'
    if (!startupDisc) {
      resource(node).artwork = 'shown'
      image.src = album.artworkUrl
      node.art.append(image)
    }
  }

  function showStartupImage(node: CdStageNode): void {
    const image = resource(node).image
    if (!image || resource(node).artwork === 'shown' || resource(node).artwork === 'dropped') return
    if (!readyImages.has(image)) return
    node.art.append(image)
    resource(node).artwork = 'shown'
  }

  function beginDecode(node: CdStageNode): Promise<void> | null {
    const image = resource(node).image
    if (!image || resource(node).artwork !== 'idle') return null
    const album = albums[cdAlbumIndex(node.index, albums.length)]
    if (!album?.artworkUrl) {
      releaseStartupImage(node)
      return Promise.resolve()
    }
    resource(node).artwork = 'decoding'
    const generation = startupGeneration
    image.src = album.artworkUrl
    return image.decode().then(
      () => {
        if (
          generation === startupGeneration &&
          resource(node).image === image &&
          resource(node).artwork === 'decoding'
        )
          readyImages.add(image)
      },
      () => {
        if (
          generation === startupGeneration &&
          resource(node).image === image &&
          resource(node).artwork === 'decoding'
        )
          releaseStartupImage(node)
      },
    )
  }

  function promoteStartupDisc(node: CdStageNode): void {
    node.slot.style.willChange = 'transform, opacity'
    node.disc.style.willChange = 'transform'
    if (resource(node).vinyl) return
    const vinyl = document.createElement('div')
    vinyl.className = 'cd-startup-vinyl'
    node.disc.append(vinyl)
    resource(node).vinyl = vinyl
  }

  function releasePassedStartupDiscs(visible: readonly number[]): void {
    const earliest = visible.length ? Math.min(...visible) : Number.POSITIVE_INFINITY
    for (const [index, node] of nodes) {
      if (index >= earliest || !resource(node).vinyl) continue
      node.slot.style.willChange = ''
      node.disc.style.willChange = ''
      resource(node).vinyl?.remove()
      resource(node).vinyl = undefined
      if (resource(node).artwork !== 'dropped') releaseStartupImage(node, true)
    }
  }

  function ensureDiscChrome(node: CdStageNode): void {
    if (node.waveRing) return
    const album = albums[cdAlbumIndex(node.index, albums.length)]
    const waveRing = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    waveRing.classList.add('cd-wave-ring')
    waveRing.setAttribute('viewBox', '-28 -28 456 456')
    waveRing.setAttribute('aria-hidden', 'true')
    const waveTrack = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    waveTrack.classList.add('cd-wave-track')
    waveTrack.setAttribute('pathLength', '1')
    waveTrack.setAttribute('stroke-dasharray', '1')
    waveTrack.setAttribute('stroke-dashoffset', '1')
    const waveProgress = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    waveProgress.classList.add('cd-wave-progress')
    waveProgress.setAttribute('pathLength', '1')
    waveProgress.setAttribute('stroke-dasharray', '1')
    waveProgress.setAttribute('stroke-dashoffset', '1')
    const waveSeed = cdPlaybackWaveSeed(album.key)
    const wavePath = cdPlaybackWavePath(waveSeed)
    waveTrack.setAttribute('d', wavePath)
    waveProgress.setAttribute('d', wavePath)
    waveRing.append(waveTrack, waveProgress)
    const sidewall = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    sidewall.classList.add('cd-sidewall')
    sidewall.setAttribute('viewBox', '0 0 400 400')
    sidewall.setAttribute('aria-hidden', 'true')
    const sidewallBands = ['#d9dddf', '#777e83', '#a4aaae'].map((color) => {
      const band = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      band.setAttribute('fill', color)
      sidewall.append(band)
      return band
    })
    node.hoverPlane.append(waveRing, sidewall)
    const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    shadow.classList.add('cd-disc-shadow')
    shadow.setAttribute('viewBox', '0 0 400 400')
    shadow.setAttribute('aria-hidden', 'true')
    shadow.style.opacity = '0'
    const shadowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    shadow.append(shadowPath)
    node.slot.append(shadow)
    node.waveRing = waveRing
    node.waveTrack = waveTrack
    node.sidewall = sidewall
    node.sidewallBands = sidewallBands
    node.shadow = shadow
    node.shadowPath = shadowPath
    node.waveProgress = waveProgress
    node.wavePaths = [waveTrack, waveProgress]
    node.waveSeed = waveSeed
  }

  function createDisc(index: number, startupDisc = false): CdStageNode {
    const album = albums[cdAlbumIndex(index, albums.length)]
    let angle = artworkAngles.get(album.key)
    if (angle === undefined) {
      const nearbyAngles: number[] = []
      for (let offset = -3; offset <= 3; offset++) {
        const neighbor = albums[cdAlbumIndex(index + offset, albums.length)]
        const assigned = artworkAngles.get(neighbor.key)
        if (neighbor.key !== album.key && assigned !== undefined) nearbyAngles.push(assigned)
      }
      // Keep adjacent albums visually distinct while retaining the full circle.
      const candidates = Array.from({ length: 360 }, (_, degree) => degree).filter((degree) =>
        nearbyAngles.every((other) => {
          const distance = Math.abs(degree - other)
          return Math.min(distance, 360 - distance) >= 24
        }),
      )
      angle = candidates[Math.floor(Math.random() * candidates.length)]
      artworkAngles.set(album.key, angle)
    }
    const slot = document.createElement('div')
    slot.className = 'cd-position'
    slot.setAttribute('aria-hidden', 'true')
    const hoverPlane = document.createElement('div')
    hoverPlane.className = 'cd-hover'
    const disc = document.createElement('div')
    disc.className = 'cd-disc'
    const art = document.createElement('div')
    art.className = 'cd-art'
    // Rotate inside the disc plane, leaving its silhouette, lighting and path intact.
    art.style.transform = `rotate(${angle}deg)`
    const hub = document.createElement('div')
    hub.className = 'cd-hub'
    disc.append(art, hub)
    hoverPlane.append(disc)
    // The shadow stays beside the tilted plane and is added with the other chrome.
    slot.append(hoverPlane)
    stage.append(slot)
    const node: CdStageNode = {
      index,
      albumKey: album.key,
      slot,
      positionTransform: '',
      poseScale: 1,
      rotation: { x: 0, y: 0, z: 0 },
      disc,
      art,
      hoverPlane,
      waveSeed: cdPlaybackWaveSeed(album.key),
    }
    nodeResources.set(node, { artwork: 'idle' })
    ensureDiscArtwork(node, startupDisc)
    if (!startupDisc) ensureDiscChrome(node)
    nodes.set(index, node)
    discNodes.set(disc, node)
    return node
  }

  function cancelPreparation(): void {
    ++startupGeneration
    clearTimeout(preparationTimer)
    preparationTimer = undefined
    cancelWarmup?.()
    cancelWarmup = undefined
    preparationCover?.remove()
    preparationCover = undefined
    if (!preparing) return
    preparing = false
    readyImages.clear()
    for (const node of nodes.values()) {
      resource(node).vinyl?.remove()
      resource(node).vinyl = undefined
      node.slot.style.willChange = ''
      node.disc.style.willChange = ''
      if (resource(node).artwork === 'idle' || resource(node).artwork === 'decoding')
        releaseStartupImage(node, true)
    }
  }

  function prepareStartup(ready: (preparation: CdStartupPreparation) => void): void {
    cancelPreparation()
    preparing = true
    const generation = ++startupGeneration
    readyImages.clear()
    const travel = albums.length >= 4 ? 9 : 0
    const startupOrigin = travel ? -travel : 0
    const first = travel ? -travel - 2 : 0
    const last = travel ? 1 : Math.min(1, albums.length - 1)
    // Bounded pool: at most 13 nodes, only four visible during motion.
    for (let index = first; index <= last; index++) {
      const node = createDisc(index, true)
      node.slot.style.opacity = '0'
      promoteStartupDisc(node)
    }
    const initial = cdSlots(startupOrigin, albums.length)
    const opening = initial
      .map((index) => nodes.get(index))
      .filter((node): node is CdStageNode => Boolean(node))
    let prepared = false
    const start = (): void => {
      if (prepared || generation !== startupGeneration) return
      prepared = true
      clearTimeout(preparationTimer)
      preparationTimer = undefined
      for (const node of nodes.values()) {
        if (resource(node).artwork === 'shown' || resource(node).artwork === 'dropped') continue
        const image = resource(node).image
        if (image && readyImages.has(image)) showStartupImage(node)
        else releaseStartupImage(node, true)
      }
      const pool = new Map(
        Array.from(nodes, ([index, node]) => [
          index,
          {
            slot: node.slot,
            disc: node.disc,
            get vinyl() {
              return resource(node).vinyl!
            },
          },
        ]),
      )
      const play = (): void => {
        for (const node of warming) {
          node.slot.style.opacity = '0'
          resource(node).vinyl!.style.opacity = '1'
        }
        preparationCover?.remove()
        preparationCover = undefined
        cancelWarmup = undefined
        ready({ pool, count: albums.length, isCurrent: () => generation === startupGeneration })
      }
      // Opacity 0 and decode() do not rasterize the masked disc. Exercise the
      // actual perspective, mask and translucent vinyl before the clock starts.
      // Prepare the bounded pool, including every cover orientation, so rapid
      // slide-in never creates a new vinyl/cover material for the first time.
      const warming = [...nodes.values()]
      const { width, height } = dimensions()
      // A nearly opaque page-coloured cover hides preparation, but remains
      // translucent so Chromium cannot occlusion-cull the real disc layers.
      preparationCover = document.createElement('div')
      preparationCover.className = 'cd-startup-preparation-cover'
      preparationCover.setAttribute('aria-hidden', 'true')
      Object.assign(preparationCover.style, {
        position: 'absolute',
        inset: '0',
        zIndex: '100',
        background: 'var(--cd-bg-image, none) var(--cd-bg)',
        opacity: '0.999',
        pointerEvents: 'none',
      })
      stage.append(preparationCover)
      for (const [layer, node] of warming.entries()) {
        const size = Math.min(width * 0.38, height * 0.6)
        node.slot.style.transform = `translate3d(${width * 0.5 - size / 2 + layer * 15}px, ${height * 0.49 - size / 2}px, 0) scale(${size / 400})`
        node.disc.style.transform =
          'perspective(1100px) rotateZ(24deg) rotateY(-42deg) rotateX(9deg)'
        node.slot.style.opacity = '0.99'
        resource(node).vinyl!.style.opacity = '0'
      }
      let warmFrames = 0
      cancelWarmup = animateFrames(() => {
        if (generation !== startupGeneration) return false
        if (warmFrames === 2) {
          for (const node of warming) resource(node).vinyl!.style.opacity = '0.5'
        }
        if (warmFrames === 4) {
          for (const node of warming) {
            resource(node).vinyl!.style.opacity = '1'
            node.slot.style.opacity = '1'
          }
        }
        if (++warmFrames < 7) return true
        play()
        return false
      })
    }
    preparationTimer = setTimeout(start, 1200)
    const openingDecodes = opening.flatMap((node) => {
      const job = beginDecode(node)
      return job ? [job] : []
    })
    const remaining = [...nodes.values()].filter((node) => !opening.includes(node))
    let decodeIndex = 0
    const decodeRemaining = async (): Promise<void> => {
      while (decodeIndex < remaining.length && generation === startupGeneration && !prepared) {
        const node = remaining[decodeIndex++]
        await beginDecode(node)
      }
    }
    void Promise.all(openingDecodes)
      .then(() => Promise.all([decodeRemaining(), decodeRemaining()]))
      .then(start)
  }

  function clearNodes(): void {
    for (const node of nodes.values()) removeNode(node)
  }

  function setArtworkAngle(node: CdStageNode, angle: number): void {
    artworkAngles.set(node.albumKey, angle)
    for (const item of nodes.values()) {
      if (item.albumKey === node.albumKey) item.art.style.transform = `rotate(${angle}deg)`
    }
    onArtworkRotation?.()
  }

  return {
    get: (index: number): CdStageNode | undefined => nodes.get(index),
    values: (): IterableIterator<CdStageNode> => nodes.values(),
    nodeFromTarget: (target: EventTarget | null): CdStageNode | undefined =>
      target ? discNodes.get(target) : undefined,
    ensure(index: number, duringStartup: boolean): CdStageNode {
      const node = nodes.get(index) ?? createDisc(index)
      if (!duringStartup) ensureDiscArtwork(node)
      ensureDiscChrome(node)
      return node
    },
    retain(visible: readonly number[]): void {
      for (const [index, node] of nodes) {
        if (!visible.includes(index)) removeNode(node)
      }
    },
    replaceAlbums(next: readonly CdAlbum[]): void {
      cancelPreparation()
      clearNodes()
      albums = next
      const retainedKeys = new Set(albums.map((album) => album.key))
      for (const key of artworkAngles.keys()) {
        if (!retainedKeys.has(key)) artworkAngles.delete(key)
      }
    },
    getArtworkAngle: (node: CdStageNode): number => artworkAngles.get(node.albumKey) ?? 0,
    setArtworkAngle,
    prepareStartup,
    cancelPreparation,
    releasePassedStartupDiscs,
    dispose(): void {
      cancelPreparation()
      clearNodes()
      albums = []
      artworkAngles.clear()
    },
  }
}

export type CdStageResources = ReturnType<typeof createCdStageResources>
