import { animateFrames } from '@renderer/shared/animation/motion'
import { cdPose, cdSlots } from './cdGeometry'

export interface CdStartupDisc {
  slot: HTMLElement
  disc: HTMLElement
  vinyl: HTMLElement
}

const smooth = (value: number): number => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * t * (10 + t * (-15 + 6 * t))
}
const mix = (from: number, to: number, progress: number): number => from + (to - from) * progress

export interface CdStartupFrame {
  visible: readonly number[]
  /** Next disc to enter, while its slot opacity is still 0. */
  upcoming: number | null
  /** False once the fast slide has started. */
  gather: boolean
}

/** Motion is unchanged. The owner promotes layers and freezes cover textures. */
export function playCdStartup(
  pool: ReadonlyMap<number, CdStartupDisc>,
  count: number,
  dimensions: () => { width: number; height: number },
  complete: () => void,
  prepare?: (frame: CdStartupFrame) => void,
): () => void {
  // A small catalog unfolds without manufacturing duplicate albums.
  const travel = count >= 4 ? 9 : 0
  const seeds = Array.from({ length: 4 }, (_, index) => ({
    x: (index - 1.5) * 13 + (Math.random() - 0.5) * 14,
    y: (index - 1.5) * -9,
    tilt: -15 + (Math.random() - 0.5) * 10,
    turn: (Math.random() - 0.5) * 36,
    arcX: (Math.random() - 0.5) * 90,
    arcY: -30 - Math.random() * 70,
    delay: Math.random() * 110,
  }))
  let elapsed = 0
  let previousSlots: number[] = []
  return animateFrames((seconds) => {
    elapsed += seconds * 1000
    const { width, height } = dimensions()
    const slide = Math.max(0, Math.min(1, (elapsed - 1550) / 2850))
    const position = -travel + travel * smooth(slide)
    const slots = cdSlots(position, count)
    const lead = slots.length ? Math.max(...slots) + 1 : null
    // Promote and freeze textures before this frame writes opacity, so a disc
    // never fades in on a layer or a cover that arrives halfway through.
    prepare?.({
      visible: slots,
      upcoming: lead !== null && pool.has(lead) ? lead : null,
      gather: elapsed < 1550,
    })
    for (const index of previousSlots) {
      if (!slots.includes(index)) pool.get(index)!.slot.style.opacity = '0'
    }
    const reveal = smooth((slide - 0.26) / 0.46)
    slots.forEach((index, layer) => {
      const node = pool.get(index)!
      const t = index - position
      const pose = cdPose(t, width, height)
      let { cx, cy, size, tilt, turn } = pose
      let opacity = smooth(Math.min((t + 2.5) * 2, (1.5 - t) * 2))
      if (elapsed < 1550) {
        const seed = seeds[layer]
        const appear = smooth((elapsed - 200 - layer * 55) / 330)
        const spread = smooth((elapsed - 650 - seed.delay) / (760 - seed.delay))
        const arc = Math.sin(Math.PI * spread)
        cx = mix(width * 0.5 + seed.x, cx, spread) + seed.arcX * arc
        cy = mix(height * 0.49 + seed.y, cy, spread) + seed.arcY * arc
        size = mix(Math.min(width * 0.28, height * 0.43) * (1 + layer * 0.025), size, spread)
        size *= 0.94 + 0.06 * appear
        tilt = mix(seed.tilt, tilt, spread)
        turn = mix(seed.turn, turn, spread)
        opacity *= appear
      }
      const sway = Math.sin(slide * Math.PI * 14) * Math.sin(slide * Math.PI) * 1.15
      node.slot.style.opacity = String(opacity)
      node.slot.style.zIndex = String(layer + 1)
      node.slot.style.transform = `translate3d(${cx - size / 2}px, ${cy - size / 2}px, 0) scale(${size / 400})`
      node.disc.style.transform = `perspective(1100px) rotateZ(${turn + sway}deg) rotateY(${tilt + sway * 0.62}deg) rotateX(9deg)`
      if (node.vinyl) node.vinyl.style.opacity = String(1 - reveal)
    })
    previousSlots = slots
    if (elapsed < 4500) return true
    complete()
    return false
  })
}
