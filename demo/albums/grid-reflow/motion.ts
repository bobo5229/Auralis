import { ref } from 'vue'

export const motionMode = ref<'flip' | 'fade'>('flip')
export const motionStats = ref({ matched: 0, entering: 0, leaving: 0, nodes: 0 })
const easing = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** Preserve animated child geometry when the real page captures a reversal. */
export function freezeSnapshot(card: HTMLElement) {
  for (const child of card.querySelectorAll<HTMLElement>('.album-card-cover, .album-card-meta')) {
    child.style.transform = getComputedStyle(child).transform
  }
}

export async function animateFlip(
  groups: Map<string, HTMLElement>,
  animations: Animation[],
  duration: number,
) {
  const sourceGroup = groups.get('from')
  const targetGroup = groups.get('to')
  const sources = new Map(
    Array.from(sourceGroup?.children ?? []).map((e) => [
      (e as HTMLElement).dataset.albumKey,
      e as HTMLElement,
    ]),
  )
  const targets = Array.from(targetGroup?.children ?? []) as HTMLElement[]
  // Batch all layout reads before animation writes; only viewport snapshots are involved.
  const plans = targets.map((to) => {
    const from = sources.get(to.dataset.albumKey)
    const rect = to.getBoundingClientRect()
    const cover = to.querySelector<HTMLElement>('.album-card-cover')!
    const meta = to.querySelector<HTMLElement>('.album-card-meta')!
    return {
      to,
      from,
      rect,
      cover,
      meta,
      coverRect: cover.getBoundingClientRect(),
      metaRect: meta.getBoundingClientRect(),
      fromRect: from?.getBoundingClientRect(),
      fromCover: from?.querySelector('.album-card-cover')?.getBoundingClientRect(),
      fromMeta: from?.querySelector('.album-card-meta')?.getBoundingClientRect(),
    }
  })
  let matched = 0
  function animate(node: HTMLElement, frames: Keyframe[], fade = false) {
    const animation = node.animate(frames, {
      duration,
      easing: fade ? 'ease-out' : easing,
      fill: 'forwards',
    })
    animations.push(animation)
  }
  for (const group of groups.values()) {
    group.style.clipPath = 'none'
    group.style.opacity = '1'
  }
  for (const p of plans) {
    p.to.style.opacity = '1'
    if (!p.from || !p.fromRect || !p.fromCover || !p.fromMeta) {
      animate(
        p.to,
        [
          { opacity: 0, transform: 'translateY(12px)' },
          { opacity: 1, transform: 'none' },
        ],
        true,
      )
      continue
    }
    matched++
    sources.delete(p.to.dataset.albumKey)
    p.from.style.opacity = '0'
    const dx = p.fromRect.left - p.rect.left,
      dy = p.fromRect.top - p.rect.top
    animate(p.to, [{ transform: `translate3d(${dx}px,${dy}px,0)` }, { transform: 'none' }])
    p.cover.style.transformOrigin = '0 0'
    const cx = p.fromCover.left - p.fromRect.left - (p.coverRect.left - p.rect.left)
    const cy = p.fromCover.top - p.fromRect.top - (p.coverRect.top - p.rect.top)
    const scale = p.fromCover.width / p.coverRect.width
    animate(p.cover, [
      { transform: `translate(${cx}px,${cy}px) scale(${scale})` },
      { transform: 'none' },
    ])
    // Translate metadata separately so glyphs keep their original font size.
    const mx = p.fromMeta.left - p.fromRect.left - (p.metaRect.left - p.rect.left)
    const my = p.fromMeta.top - p.fromRect.top - (p.metaRect.top - p.rect.top)
    animate(p.meta, [{ transform: `translate(${mx}px,${my}px)` }, { transform: 'none' }])
  }
  for (const source of sources.values()) {
    const opacity = Number(getComputedStyle(source).opacity)
    animate(source, [{ opacity }, { opacity: 0 }], true)
  }
  motionStats.value = {
    matched,
    entering: plans.length - matched,
    leaving: sources.size,
    nodes: plans.length + sources.size,
  }
  await Promise.all(animations.map((a) => a.finished.catch(() => undefined)))
}
