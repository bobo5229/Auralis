import { describe, expect, it } from 'vitest'
import { createMiniPlayerMetalLightPose, useMiniPlayerMetalLight } from './useMiniPlayerMetalLight'

describe('useMiniPlayerMetalLight', () => {
  it('keeps generated light geometry inside the existing visual ranges', () => {
    const pose = createMiniPlayerMetalLightPose(() => 0.5)

    expect(pose.hiX).toBeGreaterThanOrEqual(14)
    expect(pose.hiX).toBeLessThanOrEqual(70)
    expect(pose.hiY).toBeGreaterThanOrEqual(8)
    expect(pose.hiY).toBeLessThanOrEqual(40)
    expect(pose.loX).toBeGreaterThanOrEqual(40)
    expect(pose.loX).toBeLessThanOrEqual(90)
    expect(pose.loY).toBeGreaterThanOrEqual(52)
    expect(pose.loY).toBeLessThanOrEqual(90)
    expect(pose.sweepFrom).toBeGreaterThanOrEqual(115)
    expect(pose.sweepTo).toBeLessThanOrEqual(-10)
  })

  it('maps every metal parameter to the existing CSS custom properties', () => {
    const { pose, style } = useMiniPlayerMetalLight(() => 0.5)

    expect(style.value).toEqual({
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
    })
  })

  it('reshuffles away from the previous pose after hover leaves', () => {
    const { pose, reshuffle } = useMiniPlayerMetalLight(() => 0.5)
    const previous = { ...pose.value }

    reshuffle()

    expect(pose.value).not.toEqual(previous)
    expect(Math.abs(pose.value.hiX - previous.hiX)).toBeGreaterThanOrEqual(12)
  })
})
