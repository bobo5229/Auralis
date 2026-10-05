import { describe, expect, it } from 'vitest'
import {
  beginCdViewSwitchTransition,
  clearCdViewSwitchTransition,
  hasCdViewSwitchTransition,
} from './cdViewSwitchTransition'

describe('CD view switch transition handoff', () => {
  it('lets the route inspect the switch direction until navigation cleanup', () => {
    const transition = beginCdViewSwitchTransition('browse', 'index')
    expect(hasCdViewSwitchTransition('browse', 'index')).toBe(true)
    expect(hasCdViewSwitchTransition('index', 'browse')).toBe(false)
    expect(hasCdViewSwitchTransition('browse', 'index')).toBe(true)
    clearCdViewSwitchTransition(transition)
    expect(hasCdViewSwitchTransition('browse', 'index')).toBe(false)
  })

  it('does not reuse a cancelled navigation for a later direct entry', () => {
    const transition = beginCdViewSwitchTransition('browse', 'index')
    clearCdViewSwitchTransition(transition)
    expect(hasCdViewSwitchTransition('browse', 'index')).toBe(false)
  })

  it('keeps a newer switch when an earlier navigation finishes clearing', () => {
    const earlier = beginCdViewSwitchTransition('browse', 'index')
    const latest = beginCdViewSwitchTransition('index', 'browse')
    clearCdViewSwitchTransition(earlier)
    expect(hasCdViewSwitchTransition('index', 'browse')).toBe(true)
    clearCdViewSwitchTransition(latest)
    expect(hasCdViewSwitchTransition('index', 'browse')).toBe(false)
  })
})
