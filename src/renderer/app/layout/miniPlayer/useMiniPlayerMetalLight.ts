import { computed, ref, type CSSProperties } from 'vue'

export interface MiniPlayerMetalLightPose {
  hiX: number
  hiY: number
  hiW: number
  hiH: number
  loX: number
  loY: number
  loW: number
  loH: number
  bodyAngle: number
  hoverHiX: number
  hoverHiY: number
  hoverLoX: number
  hoverLoY: number
  sweepAngle: number
  sweepFrom: number
  sweepTo: number
}

type RandomSource = () => number

function randomRange(random: RandomSource, min: number, max: number): number {
  return min + random() * (max - min)
}

export function createMiniPlayerMetalLightPose(
  random: RandomSource = Math.random,
  previous?: MiniPlayerMetalLightPose | null,
): MiniPlayerMetalLightPose {
  // Highlight stays in the upper half; dark sits roughly opposite for volume.
  let hiX = randomRange(random, 14, 70)
  let hiY = randomRange(random, 8, 40)
  let loX = randomRange(random, 40, 90)
  let loY = randomRange(random, 52, 90)

  if (previous) {
    // Nudge away from last pose so the change is noticeable.
    if (Math.abs(hiX - previous.hiX) < 12) {
      hiX = ((previous.hiX + randomRange(random, 28, 48)) % 70) + 12
    }
    if (Math.abs(hiY - previous.hiY) < 10) {
      hiY = ((previous.hiY + randomRange(random, 14, 28)) % 32) + 8
    }
    if (Math.abs(loX - previous.loX) < 12) {
      loX = ((previous.loX + randomRange(random, 24, 42)) % 50) + 40
    }
    if (Math.abs(loY - previous.loY) < 10) {
      loY = ((previous.loY + randomRange(random, 12, 24)) % 38) + 52
    }
  }

  if (Math.abs(loX - hiX) < 18) {
    loX = Math.min(90, Math.max(40, hiX + (hiX < 50 ? 28 : -28)))
  }
  if (Math.abs(loY - hiY) < 22) {
    loY = Math.min(90, hiY + randomRange(random, 36, 52))
  }

  const bodyAngle = randomRange(random, 118, 208)
  const hoverHiX = Math.min(78, Math.max(10, hiX + randomRange(random, -8, 12)))
  const hoverHiY = Math.min(48, Math.max(6, hiY + randomRange(random, -10, 6)))
  const hoverLoX = Math.min(94, Math.max(36, loX + randomRange(random, -8, 8)))
  const hoverLoY = Math.min(94, Math.max(48, loY + randomRange(random, -6, 10)))

  return {
    hiX,
    hiY,
    hiW: randomRange(random, 105, 140),
    hiH: randomRange(random, 78, 105),
    loX,
    loY,
    loW: randomRange(random, 78, 110),
    loH: randomRange(random, 68, 95),
    bodyAngle,
    hoverHiX,
    hoverHiY,
    hoverLoX,
    hoverLoY,
    sweepAngle: randomRange(random, 98, 148),
    sweepFrom: randomRange(random, 115, 145),
    sweepTo: randomRange(random, -40, -10),
  }
}

export function useMiniPlayerMetalLight(random: RandomSource = Math.random) {
  const pose = ref<MiniPlayerMetalLightPose>(createMiniPlayerMetalLightPose(random))
  const style = computed(
    () =>
      ({
        '--metal-hi-x': `${pose.value.hiX}%`,
        '--metal-hi-y': `${pose.value.hiY}%`,
        '--metal-hi-w': `${pose.value.hiW}%`,
        '--metal-hi-h': `${pose.value.hiH}%`,
        '--metal-lo-x': `${pose.value.loX}%`,
        '--metal-lo-y': `${pose.value.loY}%`,
        '--metal-lo-w': `${pose.value.loW}%`,
        '--metal-lo-h': `${pose.value.loH}%`,
        '--metal-body-angle': `${pose.value.bodyAngle}deg`,
        '--metal-hi-hover-x': `${pose.value.hoverHiX}%`,
        '--metal-hi-hover-y': `${pose.value.hoverHiY}%`,
        '--metal-lo-hover-x': `${pose.value.hoverLoX}%`,
        '--metal-lo-hover-y': `${pose.value.hoverLoY}%`,
        '--metal-sweep-angle': `${pose.value.sweepAngle}deg`,
        '--metal-sweep-from': `${pose.value.sweepFrom}%`,
        '--metal-sweep-to': `${pose.value.sweepTo}%`,
      }) as CSSProperties,
  )

  function reshuffle(): void {
    pose.value = createMiniPlayerMetalLightPose(random, pose.value)
  }

  return { pose, style, reshuffle }
}
