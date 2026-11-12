import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref, type Ref } from 'vue'
import { ShellTestElement } from '@renderer/testUtils/rendererTestHost'
import { FALLBACK_PALETTE } from '@renderer/shared/artwork/artworkPaletteDefaults'
import { getAlbumColorPreference, setAlbumColorPreference } from '../albumColorPreferences'
import AlbumColorPreference from './AlbumColorPreference.vue'

vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ...vue,
    Transition: vue.defineComponent({
      inheritAttrs: false,
      setup:
        (_props, { slots }) =>
        () =>
          slots.default?.(),
    }),
  }
})

vi.mock('@renderer/shared/dialog/AppDialog.vue', async () => {
  const { defineComponent, h, Teleport } = await import('vue')
  return {
    default: defineComponent({
      inheritAttrs: false,
      props: { open: Boolean },
      emits: ['close'],
      setup:
        (props, { slots, emit, attrs }) =>
        () =>
          props.open
            ? h(Teleport, { to: 'body' }, [
                h('div', { class: 'sampling-dialog', style: attrs.style }, [
                  h('button', { class: 'sampling-close', onClick: () => emit('close') }),
                  ...(slots.default?.() ?? []),
                ]),
              ])
            : null,
    }),
  }
})

const worker = vi.hoisted(() => ({ extract: vi.fn() }))
vi.mock('@renderer/shared/artwork/artworkPaletteWorkerClient', () => ({
  extractArtworkPaletteInWorker: worker.extract,
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const drawImage = vi.fn()
const getImageData = vi.fn()
const root = new ShellTestElement('root')
const overlay = new ShellTestElement('overlay')
const renderer = createRenderer<ShellTestElement, ShellTestElement>({
  querySelector: () => overlay,
  createElement: (type) => new ShellTestElement(type),
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
    else node.props[key] = value
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
const mounted: Array<ReturnType<typeof renderer.createApp>> = []
const anchor = { id: 771, createdAt: '2024-01-01' }
const listeners = new Map<string, Set<EventListener>>()
const palettes = new Map<string, (color: { r: number; g: number; b: number }) => void>()
async function settle() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function swatch() {
  const node = root.querySelector('.album-color-swatch')
  if (!node) throw new Error('Missing album color swatch')
  return node
}
function mount(
  artworkKey: Ref<string | null>,
  cover: HTMLImageElement | null = null,
  onSamplingChange = vi.fn(),
) {
  const app = renderer.createApp({
    render: () =>
      h(AlbumColorPreference, {
        anchors: [anchor],
        artworkKey: artworkKey.value,
        coverImage: cover,
        coverReady: Boolean(cover),
        onSamplingChange,
      }),
  })
  app.directive('tooltip', {})
  mounted.push(app)
  app.mount(root)
}
beforeEach(() => {
  root.replaceChildren()
  overlay.replaceChildren()
  palettes.clear()
  listeners.clear()
  drawImage.mockClear()
  getImageData.mockReset()
  getImageData.mockReturnValue({ data: new Uint8ClampedArray([18, 52, 86, 255]) })
  worker.extract.mockReset()
  worker.extract.mockImplementation(
    (key: string) =>
      new Promise((resolve) =>
        palettes.set(key, (dominant) =>
          resolve({ ...FALLBACK_PALETTE, key, dominant, quality: 'full' }),
        ),
      ),
  )
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  })
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({
        drawImage,
        clearRect: () => {},
        getImageData,
      }),
    }),
    addEventListener: (type: string, listener: EventListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    removeEventListener: (type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener)
    },
  })
  vi.stubGlobal(
    'Image',
    class {
      crossOrigin = ''
      decoding = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    },
  )
})
afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount())
  vi.unstubAllGlobals()
})

it('updates the closed button with the current cover color and respects custom and reset colors', async () => {
  const key = ref<string | null>('swatch-auto-a')
  mount(key)
  await settle()
  expect(palettes.has('swatch-auto-a')).toBe(true)
  palettes.get('swatch-auto-a')!({ r: 17, g: 34, b: 51 })
  await settle()
  expect(swatch().style.backgroundColor).toBe('#112233')
  expect(setAlbumColorPreference([anchor], { r: 100, g: 120, b: 140 })).toBe(true)
  await settle()
  expect(swatch().style.backgroundColor).toBe('#64788c')
  expect(setAlbumColorPreference([anchor], null)).toBe(true)
  await settle()
  expect(swatch().style.backgroundColor).toBe('#112233')
})

it('hides reset when the saved RGB matches the loaded automatic color', async () => {
  const color = { r: 18, g: 52, b: 86 }
  setAlbumColorPreference([anchor], color)
  mount(ref('reset-equal-auto'))
  await settle()
  ;(root.querySelector('.album-color-trigger')!.props.onClick as () => void)()
  await settle()
  // A fallback is not a confirmed automatic color.
  expect(root.querySelector('.album-color-reset')).not.toBeNull()
  const button = root.querySelector('.album-color-reset')!
  Object.assign(document, { activeElement: button })
  const trigger = root.querySelector('.album-color-trigger')!
  const focus = vi.spyOn(trigger, 'focus')
  palettes.get('reset-equal-auto')!(color)
  await settle()
  expect(root.querySelector('.album-color-reset')).toBeNull()
  expect(focus).toHaveBeenCalled()
  expect(String(root.querySelector('.album-color-actions')!.props.class)).not.toContain('has-reset')
  setAlbumColorPreference([anchor], { ...color, b: 87 })
  await settle()
  expect(root.querySelector('.album-color-reset')).not.toBeNull()
})

it('uses the default preference when a newly sampled RGB equals the automatic color', async () => {
  const cover = { complete: true, naturalWidth: 100, src: 'artwork://same-color' } as HTMLImageElement
  mount(ref('sample-equal-auto'), cover)
  await settle()
  palettes.get('sample-equal-auto')!({ r: 18, g: 52, b: 86 })
  await settle()
  ;(root.querySelector('.album-color-trigger')!.props.onClick as () => void)()
  await settle()
  ;(root.querySelector('.album-color-sample')!.props.onClick as () => void)()
  await settle()
  const image = overlay.querySelector('.album-cover-sampling-image')!
  Object.assign(image, {
    complete: true,
    naturalWidth: 100,
    naturalHeight: 100,
    getBoundingClientRect: () => ({ width: 100, height: 100, left: 0, top: 0 }),
  })
  ;(image.props.onLoad as () => void)()
  ;(image.props.onPointerdown as (event: unknown) => void)({
    clientX: 20, clientY: 20, preventDefault: vi.fn(),
  })
  await settle()
  expect(getAlbumColorPreference([anchor])).toBeNull()
  expect(swatch().style.backgroundColor).toBe('#123456')
  ;(root.querySelector('.album-color-trigger')!.props.onClick as () => void)()
  await settle()
  expect(root.querySelector('.album-color-reset')).toBeNull()
})

it('does not show an old cover result after switching albums', async () => {
  const key = ref<string | null>('swatch-old-b')
  mount(key)
  await settle()
  key.value = 'swatch-new-b'
  await settle()
  palettes.get('swatch-new-b')!({ r: 160, g: 176, b: 192 })
  await settle()
  expect(swatch().style.backgroundColor).toBe('#a0b0c0')
  palettes.get('swatch-old-b')!({ r: 17, g: 34, b: 51 })
  await settle()
  expect(swatch().style.backgroundColor).toBe('#a0b0c0')
})

it('samples the cover from the expanded control and restores the automatic color', async () => {
  const cover = {
    complete: true,
    src: 'artwork://cover',
    naturalWidth: 100,
    naturalHeight: 100,
    getBoundingClientRect: () => ({ width: 100, height: 100, left: 0, top: 0 }),
  } as HTMLImageElement
  const onSamplingChange = vi.fn()
  mount(ref(null), cover, onSamplingChange)
  await settle()
  const click = (selector: string) => {
    const button = root.querySelector(selector)
    if (!button) throw new Error(`Missing ${selector}`)
    ;(button.props.onClick as () => void)()
  }
  click('.album-color-trigger')
  await settle()
  expect(root.querySelector('.album-color-reset')).toBeNull()
  click('.album-color-sample')
  await settle()
  expect(onSamplingChange).toHaveBeenLastCalledWith(true)
  const image = overlay.querySelector('.album-cover-sampling-image')
  if (!image) throw new Error('Missing full cover')
  Object.assign(image, {
    complete: true,
    naturalWidth: 100,
    naturalHeight: 100,
    getBoundingClientRect: () => ({ width: 100, height: 100, left: 0, top: 0 }),
  })
  ;(image.props.onLoad as () => void)()
  ;(image.props.onPointerdown as (event: unknown) => void)({
    target: image,
    clientX: 98,
    clientY: 99,
    preventDefault: vi.fn(),
  })
  await settle()
  expect(drawImage).toHaveBeenCalledWith(image, 98, 99, 1, 1, 0, 0, 1, 1)
  expect(getAlbumColorPreference([anchor])).toEqual({ r: 18, g: 52, b: 86 })
  expect(onSamplingChange).toHaveBeenLastCalledWith(false)
  click('.album-color-trigger')
  await settle()
  click('.album-color-reset')
  await settle()
  expect(getAlbumColorPreference([anchor])).toBeNull()
})

it('closes the full-cover sampler without changing the saved color', async () => {
  const cover = { complete: true, naturalWidth: 100, src: 'artwork://cover' } as HTMLImageElement
  const onSamplingChange = vi.fn()
  mount(ref(null), cover, onSamplingChange)
  await settle()
  ;(root.querySelector('.album-color-trigger')!.props.onClick as () => void)()
  await settle()
  ;(root.querySelector('.album-color-sample')!.props.onClick as () => void)()
  await settle()
  expect(overlay.querySelector('.album-cover-sampling-image')).not.toBeNull()
  ;(overlay.querySelector('.sampling-close')!.props.onClick as () => void)()
  await settle()
  expect(overlay.querySelector('.album-cover-sampling-image')).toBeNull()
  expect(onSamplingChange).toHaveBeenLastCalledWith(false)
  expect(getAlbumColorPreference([anchor])).toBeNull()
})

it('keeps the full cover at the source position and size even beyond the window', async () => {
  const win = Object.assign(new EventTarget(), { innerWidth: 800, innerHeight: 500 })
  vi.stubGlobal('window', win)
  const cover = {
    complete: true,
    naturalWidth: 600,
    naturalHeight: 600,
    src: 'artwork://cover',
    getBoundingClientRect: () => ({ left: 500, top: 200, width: 600, height: 600 }),
  } as HTMLImageElement
  mount(ref(null), cover)
  await settle()
  ;(root.querySelector('.album-color-trigger')!.props.onClick as () => void)()
  await settle()
  ;(root.querySelector('.album-color-sample')!.props.onClick as () => void)()
  await settle()
  const dialog = overlay.querySelector('.sampling-dialog')!
  expect(dialog.style.width).toBe('600px')
  expect(dialog.style.left).toBe('500px')
  expect(dialog.style.top).toBe('200px')
  expect(dialog.style['--album-cover-sampling-height']).toBe('600px')
})

it('scrolls the original page and keeps the floating cover aligned', async () => {
  vi.stubGlobal('window', Object.assign(new EventTarget(), { innerWidth: 800, innerHeight: 500 }))
  let top = 200
  const scroll = Object.assign(new EventTarget(), { clientHeight: 400, scrollBy: vi.fn() })
  const cover = {
    complete: true,
    naturalWidth: 600,
    naturalHeight: 600,
    src: 'artwork://cover',
    closest: () => scroll,
    getBoundingClientRect: () => ({ left: 20, top, width: 600, height: 600 }),
  } as unknown as HTMLImageElement
  mount(ref(null), cover)
  await settle()
  ;(root.querySelector('.album-color-trigger')!.props.onClick as () => void)()
  await settle()
  ;(root.querySelector('.album-color-sample')!.props.onClick as () => void)()
  await settle()
  const preventDefault = vi.fn()
  for (const listener of listeners.get('wheel') ?? []) {
    listener({ deltaY: 80, deltaMode: 0, preventDefault } as unknown as Event)
  }
  expect(scroll.scrollBy).toHaveBeenCalledWith({ top: 80 })
  expect(preventDefault).toHaveBeenCalledOnce()
  top = 120
  scroll.dispatchEvent(new Event('scroll'))
  await settle()
  expect(overlay.querySelector('.sampling-dialog')!.style.top).toBe('120px')
  ;(overlay.querySelector('.sampling-close')!.props.onClick as () => void)()
  await settle()
  expect(listeners.get('wheel')?.size).toBe(0)
})

it('keeps the sampler open after clicking padding or a transparent pixel', async () => {
  const cover = {
    complete: true,
    naturalWidth: 800,
    naturalHeight: 400,
    src: 'artwork://cover',
  } as HTMLImageElement
  mount(ref(null), cover)
  await settle()
  ;(root.querySelector('.album-color-trigger')!.props.onClick as () => void)()
  await settle()
  ;(root.querySelector('.album-color-sample')!.props.onClick as () => void)()
  await settle()
  const image = overlay.querySelector('.album-cover-sampling-image')!
  Object.assign(image, {
    complete: true,
    naturalWidth: 800,
    naturalHeight: 400,
    getBoundingClientRect: () => ({ width: 200, height: 200, left: 0, top: 0 }),
  })
  ;(image.props.onLoad as () => void)()
  const sample = image.props.onPointerdown as (event: unknown) => void
  sample({ target: image, clientX: 50, clientY: 10, preventDefault: vi.fn() })
  await settle()
  expect(drawImage).not.toHaveBeenCalled()
  expect(overlay.querySelector('.album-cover-sampling-image')).not.toBeNull()
  getImageData.mockReturnValueOnce({ data: [0, 0, 0, 0] })
  sample({ target: image, clientX: 50, clientY: 100, preventDefault: vi.fn() })
  await settle()
  expect(overlay.querySelector('.album-cover-sampling-image')).not.toBeNull()
  expect(getAlbumColorPreference([anchor])).toBeNull()
  getImageData.mockReturnValueOnce({ data: [255, 0, 0, 128] })
  sample({ target: image, clientX: 52, clientY: 100, preventDefault: vi.fn() })
  await settle()
  expect(overlay.querySelector('.album-cover-sampling-image')).not.toBeNull()
  expect(getAlbumColorPreference([anchor])).toBeNull()
  sample({ target: image, clientX: 51, clientY: 100, preventDefault: vi.fn() })
  await settle()
  expect(overlay.querySelector('.album-cover-sampling-image')).toBeNull()
  expect(getAlbumColorPreference([anchor])).toEqual({ r: 18, g: 52, b: 86 })
})
