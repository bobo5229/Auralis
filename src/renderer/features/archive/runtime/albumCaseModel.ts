import '../styles/albumCase.css'

export interface AlbumCaseLabels {
  open: string
  close: string
}

/** Split the existing front into a 2px hinged lid; the other faces form the tray shell. */
export function createAlbumCase(object: HTMLElement, labels: () => AlbumCaseLabels) {
  object.classList.add('archive-case-shell')
  object.parentElement?.removeAttribute('aria-hidden')
  const lid = document.createElement('div')
  lid.className = 'archive-case-lid'
  lid.style.transform = 'translateZ(6px) rotateY(0deg)'
  const front = object.querySelector<HTMLElement>('.archive-album-front')!
  lid.append(front)
  const inner = document.createElement('div')
  inner.className = 'archive-case-lid-inner'
  lid.append(inner)
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const edge = document.createElement('div')
    edge.className = `archive-case-lid-edge archive-case-lid-${side}`
    lid.append(edge)
  }
  const handle = document.createElement('button')
  handle.className = 'archive-case-toggle'
  handle.type = 'button'
  lid.append(handle)
  const tray = document.createElement('div')
  tray.className = 'archive-case-tray'
  const disc = document.createElement('div')
  disc.className = 'archive-case-disc'
  const hub = document.createElement('div')
  hub.className = 'archive-case-hub'
  tray.append(disc, hub)
  object.append(tray, lid)
  const surfaces = [...object.children].filter((element) => element !== lid)
  surfaces.push(...[...lid.children].filter((element) => element !== handle))
  for (const surface of surfaces) {
    surface.setAttribute('data-case-face', '')
    surface.setAttribute('aria-hidden', 'true')
  }
  function setExpanded(open: boolean): void {
    handle.setAttribute('aria-pressed', String(open))
    handle.setAttribute('aria-label', open ? labels().close : labels().open)
  }
  setExpanded(false)
  return { lid, handle, setExpanded }
}
