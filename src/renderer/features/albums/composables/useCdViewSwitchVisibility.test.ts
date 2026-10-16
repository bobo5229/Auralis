import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { createCdViewSwitchVisibility } from './useCdViewSwitchVisibility'

describe('shared CD view switch visibility', () => {
  it('follows the browse page focus and startup state and releases on departure', () => {
    const context = createCdViewSwitchVisibility()
    const focused = ref(false)
    const starting = ref(false)
    expect(context.visible.value).toBe(false)
    const release = context.register(computed(() => !focused.value && !starting.value))
    expect(context.visible.value).toBe(true)
    focused.value = true
    expect(context.visible.value).toBe(false)
    focused.value = false
    starting.value = true
    expect(context.visible.value).toBe(false)
    starting.value = false
    expect(context.visible.value).toBe(true)
    release()
    expect(context.visible.value).toBe(false)
  })

  it('ignores outgoing state and cleanup after a newer browse page registers', () => {
    const context = createCdViewSwitchVisibility()
    const outgoing = ref(true)
    const incoming = ref(true)
    const releaseOutgoing = context.register(computed(() => outgoing.value))
    const releaseIncoming = context.register(computed(() => incoming.value))
    outgoing.value = false
    releaseOutgoing()
    expect(context.visible.value).toBe(true)
    incoming.value = false
    expect(context.visible.value).toBe(false)
    incoming.value = true
    expect(context.visible.value).toBe(true)
    releaseIncoming()
    expect(context.visible.value).toBe(false)
  })
})
