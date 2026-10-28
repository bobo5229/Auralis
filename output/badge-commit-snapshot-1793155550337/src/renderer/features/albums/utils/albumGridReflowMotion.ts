export const ALBUM_GRID_REFLOW_DURATION_MS = 500
const EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** Preserve the painted cover and metadata when a running reflow is reversed. */
export function freezeAlbumGridSnapshot(card: HTMLElement): void {
  const children = Array.from(
    card.querySelectorAll<HTMLElement>('.album-card-cover, .album-card-meta'),
  )
  const transforms = children.map((child) => getComputedStyle(child).transform)
  children.forEach((child, index) => {
    child.style.transform = transforms[index]
  })
}

/** FLIP only the snapshots collected from the viewport, independently of catalog size. */
export async function animateAlbumGridReflow(
  groups: ReadonlyMap<string, HTMLElement>,
  animations: Animation[],
): Promise<void> {
  const sources = new Map(
    Array.from(groups.get('from')?.children ?? []).map((element) => {
      const item = element as HTMLElement
      return [item.dataset.albumKey, item] as const
    }),
  )
  const targets = Array.from(groups.get('to')?.children ?? []) as HTMLElement[]
  // Finish geometry reads before starting any animations or changing visibility.
  const plans = targets.map((target) => {
    const source = sources.get(target.dataset.albumKey)
    const cover = target.querySelector<HTMLElement>('.album-card-cover')
    const metadata = target.querySelector<HTMLElement>('.album-card-meta')
    return {
      target,
      source,
      cover,
      metadata,
      rect: target.getBoundingClientRect(),
      coverRect: cover?.getBoundingClientRect(),
      metadataRect: metadata?.getBoundingClientRect(),
      sourceRect: source?.getBoundingClientRect(),
      sourceCoverRect: source?.querySelector('.album-card-cover')?.getBoundingClientRect(),
      sourceMetadataRect: source?.querySelector('.album-card-meta')?.getBoundingClientRect(),
    }
  })
  const leavingOpacities = new Map(
    Array.from(sources.values(), (source) => [source, Number(getComputedStyle(source).opacity)]),
  )
  function animate(element: HTMLElement, frames: Keyframe[], fade = false): void {
    animations.push(
      element.animate(frames, {
        duration: ALBUM_GRID_REFLOW_DURATION_MS,
        easing: fade ? 'ease-out' : EASING,
        fill: 'forwards',
      }),
    )
  }
  for (const group of groups.values()) {
    group.style.clipPath = 'none'
    group.style.opacity = '1'
  }
  for (const plan of plans) {
    const {
      target,
      source,
      cover,
      metadata,
      rect,
      coverRect,
      metadataRect,
      sourceRect,
      sourceCoverRect,
      sourceMetadataRect,
    } = plan
    target.style.opacity = '1'
    if (
      !source ||
      !sourceRect ||
      !cover ||
      !metadata ||
      !coverRect?.width ||
      !metadataRect ||
      !sourceCoverRect ||
      !sourceMetadataRect
    ) {
      animate(
        target,
        [
          { opacity: 0, transform: 'translateY(12px)' },
          { opacity: 1, transform: 'none' },
        ],
        true,
      )
      continue
    }
    sources.delete(target.dataset.albumKey)
    source.style.opacity = '0'
    animate(target, [
      {
        transform: `translate3d(${sourceRect.left - rect.left}px,${sourceRect.top - rect.top}px,0)`,
      },
      { transform: 'none' },
    ])
    cover.style.transformOrigin = '0 0'
    const coverX = sourceCoverRect.left - sourceRect.left - (coverRect.left - rect.left)
    const coverY = sourceCoverRect.top - sourceRect.top - (coverRect.top - rect.top)
    animate(cover, [
      {
        transform: `translate(${coverX}px,${coverY}px) scale(${sourceCoverRect.width / coverRect.width})`,
      },
      { transform: 'none' },
    ])
    // Metadata moves without scaling so text stays legible throughout the reflow.
    const metadataX = sourceMetadataRect.left - sourceRect.left - (metadataRect.left - rect.left)
    const metadataY = sourceMetadataRect.top - sourceRect.top - (metadataRect.top - rect.top)
    animate(metadata, [
      { transform: `translate(${metadataX}px,${metadataY}px)` },
      { transform: 'none' },
    ])
  }
  for (const source of sources.values()) {
    animate(source, [{ opacity: leavingOpacities.get(source) ?? 1 }, { opacity: 0 }], true)
  }
  await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)))
}
