import { effectScope, nextTick, ref, shallowRef, watch } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlayerBarResponsiveFocus } from './usePlayerBarResponsiveFocus'

const scopes: ReturnType<typeof effectScope>[] = []
async function flushFocus(): Promise<void> {
  await nextTick()
  // The watcher resumes after the render tick that the test also awaits.
  await nextTick()
}
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.unstubAllGlobals()
})

function setup() {
  const body = {} as HTMLElement
  const documentState = { body, activeElement: body }
  vi.stubGlobal('document', documentState)
  function button() {
    const element = {
      isConnected: true,
      getClientRects: () => (element.isConnected ? [{}] : []),
      hasAttribute: () => false,
      closest: () => null,
      contains: (other: unknown) => other === element,
      focus: vi.fn(() => {
        documentState.activeElement = element as unknown as HTMLElement
      }),
    }
    return element as unknown as HTMLElement
  }
  const options = {
    overflow: ref(false),
    lyricsAvailable: ref(true),
    enabled: ref(true),
    lyricsButton: shallowRef<HTMLElement | null>(button()),
    overflowLyricsButton: shallowRef<HTMLElement | null>(null),
    modeButton: shallowRef<HTMLElement | null>(button()),
    overflowButton: shallowRef<HTMLElement | null>(null),
    overflowPanel: shallowRef<HTMLElement | null>(null),
    queueButton: shallowRef<HTMLElement | null>(button()),
    closeOverflowPanels: vi.fn(),
  }
  const scope = effectScope()
  scopes.push(scope)
  scope.run(() => usePlayerBarResponsiveFocus(options))
  function render(update: () => void) {
    // Simulate Vue's DOM patch after the pre-flush ownership capture.
    scope.run(() => {
      watch([options.overflow, options.lyricsAvailable], update, { flush: 'post', once: true })
    })
  }
  function remove(element: HTMLElement | null) {
    if (!element) return
    Object.defineProperty(element, 'isConnected', { value: false })
    if (documentState.activeElement === element) documentState.activeElement = body
  }
  return { options, documentState, button, render, remove, scope }
}

describe('responsive player bar focus', () => {
  it('moves a disappearing lyrics button to the queue after the narrow-window patch', async () => {
    const { options, render, remove } = setup()
    options.lyricsButton.value!.focus()
    render(() => {
      remove(options.lyricsButton.value)
      options.lyricsButton.value = null
    })
    options.lyricsAvailable.value = false
    await flushFocus()
    expect(options.queueButton.value!.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('waits for the overflow button to mount before restoring focus', async () => {
    const { options, button, render, remove } = setup()
    options.modeButton.value!.focus()
    const more = button()
    render(() => {
      remove(options.modeButton.value)
      options.modeButton.value = null
      options.overflowButton.value = more
    })
    options.overflow.value = true
    expect(more.focus).not.toHaveBeenCalled()
    await flushFocus()
    expect(more.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('restores a focused overflow lyrics item to the inline button on expansion', async () => {
    const { options, button, render, remove } = setup()
    options.overflow.value = true
    await flushFocus()
    options.lyricsButton.value = null
    options.overflowLyricsButton.value = button()
    options.overflowLyricsButton.value.focus()
    const inline = button()
    render(() => {
      remove(options.overflowLyricsButton.value)
      options.overflowLyricsButton.value = null
      options.lyricsButton.value = inline
    })
    options.overflow.value = false
    await flushFocus()
    expect(inline.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(options.closeOverflowPanels).toHaveBeenCalledOnce()
  })

  it('preserves focus moved elsewhere while awaiting the patch', async () => {
    const { options, button, render, remove, documentState } = setup()
    options.lyricsButton.value!.focus()
    const other = button()
    render(() => {
      remove(options.lyricsButton.value)
      options.lyricsButton.value = null
      other.focus()
    })
    options.lyricsAvailable.value = false
    await flushFocus()
    expect(documentState.activeElement).toBe(other)
    expect(options.queueButton.value!.focus).not.toHaveBeenCalled()
  })

  it('cancels pending restoration when the owning scope is disposed', async () => {
    const { options, scope, render, remove } = setup()
    options.lyricsButton.value!.focus()
    render(() => {
      remove(options.lyricsButton.value)
      scope.stop()
    })
    options.lyricsAvailable.value = false
    await flushFocus()
    expect(options.queueButton.value!.focus).not.toHaveBeenCalled()
  })
})
