import { vi } from 'vitest'

type Frame = (seconds: number) => boolean

// Each cancellation removes only its own subscription, like the real animation driver.
const frames = new Set<Frame>()
export const stageClock = {
  update: (() => false) as Frame,
  get running(): boolean {
    return frames.size > 0
  },
  get size(): number {
    return frames.size
  },
  cancel: vi.fn(),
  press: vi.fn(() => vi.fn()),
  animateFrames(update: Frame): () => void {
    stageClock.update = update
    frames.add(update)
    return () => {
      frames.delete(update)
      stageClock.cancel()
    }
  },
  animateProgress(
    duration: number,
    update: (progress: number) => void,
    complete: () => void,
  ): () => void {
    let elapsed = 0
    return stageClock.animateFrames((seconds) => {
      elapsed += seconds * 1000
      update(Math.min(1, elapsed / duration))
      if (elapsed < duration) return true
      complete()
      return false
    })
  },
  advance(count: number): void {
    for (let index = 0; index < count; index++) {
      for (const frame of [...frames]) {
        if (frames.has(frame) && !frame(1 / 60)) frames.delete(frame)
      }
    }
  },
  reset(): void {
    frames.clear()
  },
}

// State/lifetime substitute only; this does not implement layout or visual rendering.
export class TestElement extends EventTarget {
  src = ''
  style = {} as CSSStyleDeclaration
  children: TestElement[] = []
  parent: TestElement | null = null
  attributes = new Map<string, string>()
  classList = { add: vi.fn() }
  clientWidth = 1200
  clientHeight = 700
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }
  focus(): void {}
  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, width: 400, height: 400 } as DOMRect
  }
  setPointerCapture(): void {}
  hasPointerCapture(): boolean {
    return true
  }
  releasePointerCapture(): void {}
  append(...children: TestElement[]): void {
    for (const child of children) {
      child.parent = this
      this.children.push(child)
    }
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this)
    this.parent = null
  }
}

export function installStageDOM() {
  const stage = new TestElement()
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    createElement: () => new TestElement(),
    createElementNS: () => new TestElement(),
    elementFromPoint: vi.fn(() => null as TestElement | null),
  })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', document)
  return { stage: stage as unknown as HTMLElement, element: stage, document }
}

export function pointerEvent(
  type: string,
  target: EventTarget,
  overrides: Record<string, unknown> = {},
): Event {
  return Object.assign(new Event(type, { cancelable: true }), {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: 200,
    clientY: 200,
    composedPath: () => [target],
    ...overrides,
  })
}

export async function flushDecodes(): Promise<void> {
  for (let index = 0; index < 40; index++) await Promise.resolve()
}
