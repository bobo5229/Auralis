import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, type Component } from 'vue'
import FlatTrackColumnHeader from './FlatTrackColumnHeader.vue'
import { resolveLibraryFlatColumnLayout } from '../utils/libraryFlatColumnLayout'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

type TestNode = {
  props: Record<string, unknown>
  children: TestNode[]
  text?: string
  dataset: Record<string, string | undefined>
  querySelectorAll: (selector: string) => TestNode[]
  setPointerCapture: ReturnType<typeof vi.fn>
  hasPointerCapture: ReturnType<typeof vi.fn>
  releasePointerCapture: ReturnType<typeof vi.fn>
  getBoundingClientRect: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
}

function node(): TestNode {
  const value = {
    props: {},
    children: [] as TestNode[],
    dataset: {} as Record<string, string | undefined>,
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({
      left: 40,
      top: 0,
      right: 48,
      bottom: 32,
      width: 8,
      height: 32,
    })),
    focus: vi.fn(),
    querySelectorAll(selector: string) {
      if (selector !== '[data-column-resize-handle]') return []
      const descendants = value.children.flatMap((child) => [
        child,
        ...child.querySelectorAll(selector),
      ])
      return descendants.filter((child) => Boolean(child.dataset.columnResizeHandle))
    },
  }
  Object.defineProperty(value.dataset, 'columnResizeHandle', {
    get: () => value.props['data-column-resize-handle'] as string | undefined,
  })
  return value
}

const renderer = createRenderer<TestNode, TestNode>({
  createElement: node,
  createText: (text) => ({ ...node(), text }),
  createComment: node,
  insert: (child, parent) => parent.children.push(child),
  remove: () => undefined,
  setText: (element, text) => {
    element.text = text
  },
  setElementText: (element, text) => {
    element.text = text
  },
  parentNode: () => null,
  nextSibling: () => null,
  patchProp: (element, key, _previous, value) => {
    element.props[key] = value
  },
})

const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
})

function mountHeader() {
  const listeners = new Map<string, (event: never) => void>()
  vi.stubGlobal('window', {
    addEventListener: vi.fn((type: string, listener: (event: never) => void) => {
      listeners.set(type, listener)
    }),
    removeEventListener: vi.fn((type: string) => listeners.delete(type)),
  })
  const preview = vi.fn()
  const commit = vi.fn()
  const cancel = vi.fn()
  const setResizing = vi.fn()
  let exposedHeader: {
    beginPointerResize: (handleId: string, event: PointerEvent) => void
  } | null = null
  const app = renderer.createApp({
    render: () =>
      h(FlatTrackColumnHeader as Component, {
        ref: (component) => {
          exposedHeader = component as typeof exposedHeader
        },
        layout: resolveLibraryFlatColumnLayout({ containerWidth: 900, showPlayCount: false }),
        onResizePreview: preview,
        onResizeCommit: commit,
        onResizeCancel: cancel,
        onResizeState: setResizing,
      }),
  })
  const container = node()
  app.mount(container)
  const instance = exposedHeader!
  cleanups.push(() => app.unmount())
  return { instance, container, listeners, preview, commit, cancel, setResizing }
}

describe('FlatTrackColumnHeader resize interaction', () => {
  it('captures a pointer drag, previews the adjacent pair, and commits it once', () => {
    const view = mountHeader()
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()
    view.instance.beginPointerResize('artwork:title', {
      button: 0,
      pointerId: 4,
      clientX: 40,
      preventDefault,
      stopPropagation,
    } as unknown as PointerEvent)

    const move = view.listeners.get('pointermove')
    move?.({ pointerId: 4, clientX: 64, preventDefault: vi.fn() } as never)
    const up = view.listeners.get('pointerup')
    up?.({ pointerId: 4 } as never)

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(stopPropagation).toHaveBeenCalledOnce()
    expect(view.setResizing).toHaveBeenNthCalledWith(1, true)
    expect(view.preview).toHaveBeenCalledOnce()
    expect(view.commit).toHaveBeenCalledOnce()
    expect(view.commit.mock.calls[0][1]).toEqual(['artwork', 'title'])
    expect(view.setResizing).toHaveBeenLastCalledWith(false)
    const handles = view.container.children[0].querySelectorAll('[data-column-resize-handle]')
    expect(handles[0].dataset.columnResizeHandle).toBe('artwork:title')
    expect(handles[0].setPointerCapture).toHaveBeenCalledWith(4)
    expect(handles[0].releasePointerCapture).toHaveBeenCalledWith(4)
  })

  it('cancels a drag on Escape without committing the temporary widths', () => {
    const view = mountHeader()
    view.instance.beginPointerResize('artwork:title', {
      button: 0,
      pointerId: 7,
      clientX: 40,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent)
    view.listeners.get('pointermove')?.({
      pointerId: 7,
      clientX: 70,
      preventDefault: vi.fn(),
    } as never)
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()
    view.listeners.get('keydown')?.({ key: 'Escape', preventDefault, stopPropagation } as never)

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(stopPropagation).toHaveBeenCalledOnce()
    expect(view.cancel).toHaveBeenCalledOnce()
    expect(view.commit).not.toHaveBeenCalled()
    expect(view.setResizing).toHaveBeenLastCalledWith(false)
  })

  it('commits keyboard arrow adjustments on the focused separator', () => {
    const view = mountHeader()
    const separator = view.container.children[0].querySelectorAll('[data-column-resize-handle]')[0]
    const preventDefault = vi.fn()
    const keydown = separator.props.onKeydown as (event: object) => void
    keydown({ key: 'ArrowRight', shiftKey: false, preventDefault })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(view.commit).toHaveBeenCalledOnce()
    expect(view.commit.mock.calls[0][1]).toEqual(['artwork', 'title'])
  })
})
