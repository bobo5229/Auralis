import { describe, expect, it } from 'vitest'
import { resolveProgressSeekStepSeconds } from './progressSeekStep'

describe('resolveProgressSeekStepSeconds', () => {
  it('uses a 5 second step without Shift', () => {
    expect(resolveProgressSeekStepSeconds(false)).toBe(5)
  })

  it('uses a 15 second step with Shift', () => {
    expect(resolveProgressSeekStepSeconds(true)).toBe(15)
  })
})
