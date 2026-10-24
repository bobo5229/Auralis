import { createRenderer, markRaw } from 'vue'

// DOM measurements and compositor timing are external to the shell state machine.
// This host makes them controllable while mounting the real App setup and template.
export class ShellTestStyle {
  [key: string]: unknown
  length = 0
  setProperty(key: string, value: string): void {
    this[key] = value
  }
  getPropertyValue(key: string): string {
    return String(this[key] ?? '')
  }
  getPropertyPriority(): string {
    return ''
  }
  removeProperty(key: string): void {
    delete this[key]
    delete this[key.replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase())]
  }
  item(): string {
    return ''
  }
}

export class ShellTestRect {
  constructor(
    public x = 0,
    public y = 0,
    public width = 320,
    public height = 600,
  ) {}
  get left() {
    return this.x
  }
  get top() {
    return this.y
  }
  get right() {
    return this.x + this.width
  }
  get bottom() {
    return this.y + this.height
  }
}

export class ShellTestAnimation {
  onfinish: (() => void) | null = null
  cancelled = false
  private resolve!: () => void
  readonly finished = new Promise<void>((resolve) => {
    this.resolve = resolve
  })
  constructor(
    readonly keyframes: unknown,
    readonly options: unknown,
  ) {}
  finish(): void {
    this.resolve()
    this.onfinish?.()
  }
  cancel(): void {
    this.cancelled = true
    this.resolve()
  }
}

export class ShellTestElement extends EventTarget {
  props: Record<string, unknown> = {}
  children: ShellTestElement[] = []
  parent: ShellTestElement | null = null
  style = new ShellTestStyle()
  dataset: Record<string, string> = {}
  animations: ShellTestAnimation[] = []
  rect = new ShellTestRect()
  inert = false
  text = ''
  tabIndex = -1
  scrollTop = 0
  captures = new Set<number>()
  constructor(public tagName = 'div') {
    super()
    markRaw(this)
  }
  get className(): string {
    return String(this.props.class ?? '')
  }
  set className(value: string) {
    this.props.class = value
  }
  get classList() {
    return {
      contains: (name: string) => this.className.split(' ').includes(name),
      remove: (name: string) => this.classList.toggle(name, false),
      add: (name: string) => this.classList.toggle(name, true),
      toggle: (name: string, enabled: boolean) => {
        const names = new Set(this.className.split(' ').filter(Boolean))
        if (enabled) names.add(name)
        else names.delete(name)
        this.className = [...names].join(' ')
      },
    }
  }
  get isConnected(): boolean {
    return this === shellTestDocument.body || !!this.parent?.isConnected
  }
  get firstElementChild() {
    return this.children[0] ?? null
  }
  get attributes() {
    return Object.entries(this.props).map(([name, value]) => ({ name, value }))
  }
  contains(node: unknown): boolean {
    return this === node || this.children.some((child) => child.contains(node))
  }
  matches(selector: string): boolean {
    return selector.split(',').some((part) => {
      const value = part.trim()
      if (value === '*') return true
      if (value.startsWith(':')) return false
      const classes = [...value.matchAll(/\.([\w-]+)/gu)].map((match) => match[1])
      const attrs = [...value.matchAll(/\[([\w-]+)\]/gu)].map((match) => match[1])
      const tag = /^[a-z][\w-]*/iu.exec(value)?.[0]
      return (
        (!tag || tag === this.tagName) &&
        classes.every((name) => this.classList.contains(name)) &&
        attrs.every((name) => this.hasAttribute(name))
      )
    })
  }
  closest(selector: string): ShellTestElement | null {
    return this.matches(selector) ? this : (this.parent?.closest(selector) ?? null)
  }
  querySelectorAll(selector: string): ShellTestElement[] {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ])
  }
  querySelector(selector: string): ShellTestElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }
  setAttribute(name: string, value: string): void {
    this.props[name] = value
    if (name.startsWith('data-'))
      this.dataset[
        name.slice(5).replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase())
      ] = value
  }
  hasAttribute(name: string): boolean {
    return name === 'inert' ? this.inert : name in this.props
  }
  removeAttribute(name: string): void {
    delete this.props[name]
  }
  append(child: ShellTestElement): void {
    child.remove()
    child.parent = this
    this.children.push(child)
  }
  remove(): void {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1)
    this.parent = null
  }
  replaceChildren(): void {
    for (const child of [...this.children]) child.remove()
  }
  cloneNode(deep: boolean): ShellTestElement {
    const node = new ShellTestElement(this.tagName)
    node.props = { ...this.props }
    node.dataset = { ...this.dataset }
    node.rect = this.rect
    Object.assign(node.style, this.style)
    if (deep) for (const child of this.children) node.append(child.cloneNode(true))
    return node
  }
  getBoundingClientRect() {
    return this.rect
  }
  focus(): void {
    shellTestDocument.activeElement = this
  }
  setPointerCapture(id: number): void {
    this.captures.add(id)
  }
  hasPointerCapture(id: number): boolean {
    return this.captures.has(id)
  }
  releasePointerCapture(id: number): void {
    this.captures.delete(id)
  }
  animate(keyframes: unknown, options: unknown): ShellTestAnimation {
    const animation = new ShellTestAnimation(keyframes, options)
    this.animations.push(animation)
    return animation
  }
}

export const shellTestDocument = Object.assign(new EventTarget(), {
  body: new ShellTestElement('body'),
  activeElement: null as ShellTestElement | null,
  hidden: false,
  createElement: (tag: string) => new ShellTestElement(tag),
  querySelector: (selector: string) => shellTestDocument.body.querySelector(selector),
})

export const shellTestRenderer = createRenderer<ShellTestElement, ShellTestElement>({
  createElement: (tag) => new ShellTestElement(tag),
  createText: (text) => Object.assign(new ShellTestElement('#text'), { text }),
  createComment: () => new ShellTestElement('#comment'),
  setText: (node, text) => {
    node.text = text
  },
  setElementText: (node, text) => {
    node.text = text
  },
  patchProp: (node, key, _old, value) => {
    if (key === 'style') Object.assign(node.style, value)
    else if (key === 'inert') node.inert = Boolean(value)
    else if (key.startsWith('data-')) node.setAttribute(key, String(value))
    else {
      node.props[key] = value
      node.props[key.replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase())] = value
    }
  },
  insert: (child, parent, anchor) => {
    child.remove()
    child.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(child)
    else parent.children.splice(index, 0, child)
  },
  remove: (node) => node.remove(),
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
})
