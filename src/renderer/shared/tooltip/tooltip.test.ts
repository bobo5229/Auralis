import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVNode, type DirectiveBinding, type VNode } from 'vue'
import { createTooltipController } from './tooltip'

vi.mock('@renderer/shared/animation/motion', () => ({
  animateTooltipOpacity: () => () => {},
}))

vi.mock('@floating-ui/dom', async (original) => ({
  ...(await original<typeof import('@floating-ui/dom')>()),
  computePosition: vi.fn(async () => ({
    x: 100,
    y: 72,
    placement: 'top',
    strategy: 'fixed',
    middlewareData: {},
  })),
  autoUpdate: vi.fn((_reference, _floating, update: () => void) => {
    update()
    return vi.fn()
  }),
}))

// DOM stand-ins test event/timer lifecycle in the project's Node-only test environment.
// Pixel rendering remains a manual check.
class TestElement {
  attributes = new Map<string, string>()
  children: TestElement[] = []
  parent: TestElement | null = null
  style: Record<string, string> = {}
  hidden = false
  id = ''
  className = ''
  textContent = ''
  isConnected = true
  focusVisible = true
  clientWidth = 100
  clientHeight = 20
  scrollWidth = 100
  scrollHeight = 20
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }
  append(child: TestElement): void {
    child.parent = this
    this.children.push(child)
  }
  remove(): void {
    this.isConnected = false
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this)
  }
  contains(target: TestElement | null): boolean {
    return target === this || this.children.some((child) => child.contains(target))
  }
  closest(): TestElement | null {
    return this.attributes.has('data-auralis-tooltip') ? this : (this.parent?.closest() ?? null)
  }
  matches(selector: string): boolean {
    return selector === ':focus-visible' ? this.focusVisible : false
  }
  getClientRects(): unknown[] {
    return this.isConnected ? [this.getBoundingClientRect()] : []
  }
  getBoundingClientRect() {
    return { left: 100, right: 200, top: 100, bottom: 120, width: 100, height: 20 }
  }
}

class TestDocument extends EventTarget {
  body = new TestElement()
  documentElement = { clientWidth: 800, clientHeight: 600 }
  activeElement: TestElement | null = null
  createElement(): TestElement {
    return new TestElement()
  }
}

describe('shared tooltip lifecycle', async () => {
  let doc: TestDocument
  let controller: ReturnType<typeof createTooltipController>
  let checkMutations: () => void

  function binding(
    value: string,
    modifiers: Record<string, boolean> = {},
  ): DirectiveBinding<string> {
    return { value, oldValue: null, modifiers, instance: null, dir: controller.directive }
  }
  function mount(
    value: string,
    modifiers: Record<string, boolean> = {},
    clipped = false,
  ): TestElement {
    const element = new TestElement()
    if (clipped) element.scrollWidth = 200
    doc.body.append(element)
    controller.directive.mounted?.(
      element as unknown as HTMLElement,
      binding(value, modifiers),
      createVNode('span') as VNode<HTMLElement, HTMLElement>,
      null,
    )
    return element
  }
  function dispatch(type: string, target: TestElement, props: Record<string, unknown> = {}): void {
    const event = new Event(type)
    for (const [key, value] of Object.entries({
      target,
      pointerType: 'mouse',
      relatedTarget: null,
      ...props,
    })) {
      Object.defineProperty(event, key, { value })
    }
    doc.dispatchEvent(event)
  }
  function visible(): TestElement | undefined {
    return doc.body.children.find(
      (child) =>
        child.className === 'tooltip-overlay' &&
        !child.hidden &&
        child.style.visibility !== 'hidden',
    )
  }

  beforeEach(() => {
    vi.useFakeTimers()
    doc = new TestDocument()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('window', new EventTarget())
    vi.stubGlobal('Element', TestElement)
    vi.stubGlobal('HTMLElement', TestElement)
    vi.stubGlobal('Node', TestElement)
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(callback: () => void) {
          checkMutations = callback
        }
        observe(): void {}
        disconnect(): void {}
      },
    )
    controller = createTooltipController()
  })
  afterEach(() => {
    controller.dispose()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps fully visible text quiet and shows clipped text after 500ms', async () => {
    const complete = mount('Complete', { overflow: true })
    dispatch('pointerover', complete)
    await vi.advanceTimersByTimeAsync(700)
    expect(visible()).toBeUndefined()
    const clipped = mount('Full track title', { overflow: true }, true)
    dispatch('pointerover', clipped)
    await vi.advanceTimersByTimeAsync(499)
    expect(visible()).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(visible()?.textContent).toBe('Full track title')
  })

  it('cancels a pending hint on exit and re-arms it on a quick re-entry', async () => {
    const element = mount('Hint')
    dispatch('pointerover', element)
    await vi.advanceTimersByTimeAsync(300)
    dispatch('pointerout', element)
    await vi.advanceTimersByTimeAsync(50)
    dispatch('pointerover', element)
    await vi.advanceTimersByTimeAsync(599)
    expect(visible()).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(visible()?.textContent).toBe('Hint')
  })

  it('uses a single overlay and never shows the stale pending target', async () => {
    const first = mount('First')
    const second = mount('Second', { data: true })
    dispatch('pointerover', first)
    await vi.advanceTimersByTimeAsync(500)
    dispatch('pointerover', second)
    await vi.advanceTimersByTimeAsync(150)
    expect(visible()?.textContent).toBe('Second')
    await vi.advanceTimersByTimeAsync(600)
    expect(visible()?.textContent).toBe('Second')
    expect(doc.body.children.filter((child) => child.className === 'tooltip-overlay')).toHaveLength(
      1,
    )
  })

  it('lets the pointer cross the gap and remain over the tooltip', async () => {
    const element = mount('Readable')
    dispatch('pointerover', element)
    await vi.advanceTimersByTimeAsync(600)
    const tooltip = visible()!
    dispatch('pointerout', element)
    await vi.advanceTimersByTimeAsync(80)
    dispatch('pointerover', tooltip)
    await vi.advanceTimersByTimeAsync(500)
    expect(visible()).toBe(tooltip)
    dispatch('pointerout', tooltip)
    await vi.advanceTimersByTimeAsync(250)
    expect(visible()).toBeUndefined()
  })

  it('supports keyboard focus and Escape without removing existing descriptions', async () => {
    const element = mount('Keyboard hint')
    element.setAttribute('aria-describedby', 'existing-description')
    doc.activeElement = element
    dispatch('focusin', element)
    await vi.advanceTimersByTimeAsync(600)
    expect(element.getAttribute('aria-describedby')).toContain(visible()!.id)
    dispatch('keydown', element, { key: 'Escape' })
    expect(visible()).toBeUndefined()
    expect(doc.activeElement).toBe(element)
    expect(element.getAttribute('aria-describedby')).toBe('existing-description')
  })

  it('ignores touch hover and mouse focus', async () => {
    const element = mount('Hint')
    dispatch('pointerover', element, { pointerType: 'touch' })
    element.focusVisible = false
    dispatch('focusin', element)
    await vi.advanceTimersByTimeAsync(1000)
    expect(visible()).toBeUndefined()
  })

  it.each(['scroll', 'pointerdown', 'click'])('dismisses pending hints on %s', async (event) => {
    const element = mount('Hint')
    dispatch('pointerover', element)
    dispatch(event, element)
    await vi.advanceTimersByTimeAsync(1000)
    expect(visible()).toBeUndefined()
  })

  it('dismisses a recycled row when its bound content changes', async () => {
    const element = mount('Old title')
    dispatch('pointerover', element)
    await vi.advanceTimersByTimeAsync(600)
    controller.directive.updated?.(
      element as unknown as HTMLElement,
      binding('New title'),
      createVNode('span') as VNode<HTMLElement, HTMLElement>,
      createVNode('span') as VNode<HTMLElement, HTMLElement>,
    )
    expect(visible()).toBeUndefined()
    expect(element.getAttribute('aria-describedby')).toBeNull()
  })

  it('cleans up when a trigger is removed by KeepAlive or unmount', async () => {
    const element = mount('Hint')
    dispatch('pointerover', element)
    await vi.advanceTimersByTimeAsync(600)
    element.remove()
    checkMutations()
    expect(visible()).toBeUndefined()
    expect(element.getAttribute('aria-describedby')).toBeNull()
  })

  it('disposes pending work and global listeners', async () => {
    const element = mount('Hint')
    dispatch('pointerover', element)
    controller.dispose()
    dispatch('pointerover', element)
    await vi.advanceTimersByTimeAsync(1000)
    expect(visible()).toBeUndefined()
  })
})
