import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
  type ComputePositionReturn,
  type Middleware,
  type ReferenceElement,
  type VirtualElement,
} from '@floating-ui/dom'
import { rendererDiagnostics } from '../diagnostics/rendererDiagnostics'

export type FloatingProfile = 'tooltip' | 'tooltip-right' | 'point-menu' | 'submenu'

export function pointReference(x: number, y: number): VirtualElement {
  return {
    getBoundingClientRect: () => ({
      x,
      y,
      left: x,
      right: x,
      top: y,
      bottom: y,
      width: 0,
      height: 0,
    }),
  }
}

/** One session per open floating element. Disposing also invalidates pending calculations. */
export function startFloatingPosition(options: {
  reference: ReferenceElement
  floating: HTMLElement
  profile: FloatingProfile
  onPosition?: (result: ComputePositionReturn, first: boolean) => void
  onError: () => void
}) {
  const { reference, floating, profile } = options
  const tooltip = profile === 'tooltip' || profile === 'tooltip-right'
  let disposed = false
  let request = 0
  let positioned = false
  let cleanup: (() => void) | undefined
  const overflow = { padding: 8, boundary: [] as Element[], rootBoundary: 'viewport' as const }
  floating.style.visibility = 'hidden'
  floating.style.left = '0px'
  floating.style.top = '0px'
  if (!tooltip) {
    floating.style.maxWidth = ''
    floating.style.maxHeight = ''
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    request++
    cleanup?.()
    cleanup = undefined
  }

  function fail(cause: unknown): void {
    dispose()
    floating.style.visibility = 'hidden'
    rendererDiagnostics.warn({
      scope: 'floating.position',
      message: 'Floating position failed',
      cause,
    })
    options.onError()
  }

  async function update(): Promise<void> {
    if (disposed) return
    const sequence = ++request
    const current = (): boolean => !disposed && request === sequence && floating.isConnected
    const middleware: Middleware[] = []
    if (profile !== 'point-menu') {
      middleware.push(offset(tooltip ? 8 : 4))
      middleware.push(
        flip({
          ...overflow,
          fallbackPlacements:
            profile === 'tooltip-right'
              ? ['top', 'bottom']
              : profile === 'tooltip'
                ? ['bottom']
                : ['left-start'],
        }),
      )
    }
    middleware.push(shift({ ...overflow, mainAxis: true, crossAxis: true }))
    if (!tooltip)
      middleware.push(
        size({
          ...overflow,
          apply({ availableWidth, availableHeight }) {
            if (!current()) return
            floating.style.maxWidth = `${Math.max(0, availableWidth)}px`
            floating.style.maxHeight = `${Math.max(0, availableHeight)}px`
          },
        }),
      )
    try {
      const result = await computePosition(reference, floating, {
        strategy: 'fixed',
        placement:
          profile === 'tooltip'
            ? 'top'
            : profile === 'tooltip-right'
              ? 'right'
              : profile === 'submenu'
                ? 'right-start'
                : 'bottom-start',
        middleware,
      })
      if (!current()) return
      floating.style.left = `${result.x}px`
      floating.style.top = `${result.y}px`
      floating.style.visibility = 'visible'
      const first = !positioned
      positioned = true
      options.onPosition?.(result, first)
    } catch (cause) {
      if (current()) fail(cause)
    }
  }

  try {
    const stop = autoUpdate(
      reference,
      floating,
      () => {
        void update()
      },
      {
        ancestorScroll: !tooltip,
        ancestorResize: !tooltip,
        animationFrame: false,
      },
    )
    if (disposed) stop()
    else cleanup = stop
  } catch (cause) {
    fail(cause)
  }
  return { update, dispose }
}
