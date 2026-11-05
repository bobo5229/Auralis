/** Carry the destination artwork between visible list and detail positions without per-frame layout. */
export function animateAlbumRouteArtwork(
  list: HTMLElement,
  detail: HTMLElement,
  albumKey: string | null,
  reverse: boolean,
): { animations: Animation[]; cleanup: () => void } | null {
  if (!albumKey) return null
  const card = Array.from(list.querySelectorAll<HTMLElement>('.album-card[data-album-key]')).find(
    (element) => element.dataset.albumKey === albumKey,
  )
  const small = card?.querySelector<HTMLElement>('.cover-frame')
  const large = detail.querySelector<HTMLElement>('.album-hero-cover')
  if (!small || !large) return null
  const smallImage = small.querySelector<HTMLImageElement>('img')
  const largeImage = large.querySelector<HTMLImageElement>('img')
  if (
    !smallImage?.complete ||
    !smallImage.naturalWidth ||
    !largeImage?.complete ||
    !largeImage.naturalWidth ||
    (smallImage.currentSrc || smallImage.src) !== (largeImage.currentSrc || largeImage.src)
  )
    return null
  const from = small.getBoundingClientRect()
  const to = large.getBoundingClientRect()
  const viewport = list.querySelector<HTMLElement>('.albums-scroll')?.getBoundingClientRect()
  const detailViewport = detail.getBoundingClientRect()
  const valid = (rect: DOMRect) =>
    [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0
  if (
    !valid(from) ||
    !valid(to) ||
    from.right <= 0 ||
    from.bottom <= 0 ||
    from.left >= window.innerWidth ||
    from.top >= window.innerHeight ||
    (viewport &&
      (from.left < viewport.left ||
        from.right > viewport.right ||
        from.top < viewport.top ||
        from.bottom > viewport.bottom)) ||
    to.left < detailViewport.left ||
    to.top < detailViewport.top ||
    to.left >= detailViewport.right ||
    to.top >= detailViewport.bottom
  )
    return null

  // A large destination clone keeps the cover sharp as it grows. Its size remains fixed;
  // only transform and opacity animate, while the real destination supplies the final mask.
  const cover = large.cloneNode(true) as HTMLElement
  const image = cover.querySelector<HTMLElement>('img')
  if (image) {
    image.style.maskImage = 'none'
    image.style.webkitMaskImage = 'none'
  }
  cover.setAttribute('aria-hidden', 'true')
  cover.setAttribute('data-album-route-artwork', '')
  Object.assign(cover.style, {
    position: 'fixed',
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
    maxWidth: 'none',
    margin: '0',
    transformOrigin: '0 0',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '1001',
    boxShadow: 'none',
  })
  const smallTransform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`
  const source = reverse ? large : small
  const destination = reverse ? small : large
  const oldSourceOpacity = source.style.opacity
  const oldDestinationOpacity = destination.style.opacity
  source.style.opacity = '0'
  destination.style.opacity = '0'
  document.body.append(cover)
  const timing = { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' as const }
  let movement: Animation | undefined
  try {
    movement = cover.animate(
      reverse
        ? [
            { transform: 'none', opacity: 1 },
            { transform: smallTransform, opacity: 1, offset: 0.78 },
            { transform: smallTransform, opacity: 0 },
          ]
        : [
            { transform: smallTransform, opacity: 1 },
            { transform: 'none', opacity: 1, offset: 0.78 },
            { transform: 'none', opacity: 0 },
          ],
      timing,
    )
    const reveal = destination.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 0, offset: 0.78 },
        { opacity: 1, offset: 1 },
      ],
      timing,
    )
    return {
      animations: [movement, reveal],
      cleanup: () => {
        cover.remove()
        source.style.opacity = oldSourceOpacity
        destination.style.opacity = oldDestinationOpacity
      },
    }
  } catch {
    movement?.cancel()
    cover.remove()
    source.style.opacity = oldSourceOpacity
    destination.style.opacity = oldDestinationOpacity
    return null
  }
}
