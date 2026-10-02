import { describe, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref } from 'vue'
import { SketchPicker, tinycolor } from 'vue-color'
import { DEFAULT_DARK_ACCENT } from '../constants/darkAccent'
import {
  getDarkAccentContrastRatios,
  normalizeDarkAccent,
  resolveDarkAccent,
} from './resolveDarkAccent'
import { parseOpaquePickerAccent, type PickerAccentResult } from './parsePickerAccent'

describe('dark accent color rules', () => {
  it('normalizes only opaque six-digit hex values', () => {
    expect(normalizeDarkAccent('  #aBcD09 ')).toBe('#ABCD09')
    expect(normalizeDarkAccent('#abc')).toBeNull()
    expect(normalizeDarkAccent('#ABCDEF80')).toBeNull()
    expect(normalizeDarkAccent('rgb(1, 2, 3)')).toBeNull()
  })

  it('minimally lightens default pink for tinted active text and chooses a button foreground', () => {
    const result = resolveDarkAccent(DEFAULT_DARK_ACCENT)
    expect(result.source).toBe('#F472B6')
    expect(result.display).toBe('#F478B9')
    expect(result.onAccent).toBe('#121212')
    expect(result.lightened).toBe(true)
    expect(
      getDarkAccentContrastRatios(result.display).surfaces.every((ratio) => ratio >= 4.5),
    ).toBe(true)
    expect(
      getDarkAccentContrastRatios(result.display).textTintedSurfaces.every((ratio) => ratio >= 4.5),
    ).toBe(true)
    expect(
      getDarkAccentContrastRatios(result.display).surfaces.every((ratio) => ratio >= 4.5),
    ).toBe(true)
  })

  it('lightens low-contrast colors minimally while preserving neutral black as neutral gray', () => {
    const black = resolveDarkAccent('#000000')
    expect(black.source).toBe('#000000')
    expect(black.lightened).toBe(true)
    expect(black.display).toMatch(/^#([0-9A-F]{2})\1\1$/u)

    for (const source of ['#000000', '#050505', '#0000FF', '#777777', '#FFFFFF']) {
      const result = resolveDarkAccent(source)
      const ratios = getDarkAccentContrastRatios(result.display)
      expect(Math.min(...ratios.surfaces)).toBeGreaterThanOrEqual(4.5)
      expect(Math.min(...ratios.tintedSurfaces)).toBeGreaterThanOrEqual(3)
      expect(Math.min(...ratios.textTintedSurfaces)).toBeGreaterThanOrEqual(4.5)
      expect(['#121212', '#FFFFFF']).toContain(result.onAccent)
    }
  })

  it('uses the published tinycolor event object and rejects transparency', () => {
    expect(parseOpaquePickerAccent(tinycolor('#60a5fa'))).toEqual({
      valid: true,
      color: '#60A5FA',
    })
    expect(parseOpaquePickerAccent(tinycolor('#60A5FAFF'))).toEqual({
      valid: true,
      color: '#60A5FA',
    })
    expect(parseOpaquePickerAccent(tinycolor('#60A5FA80'))).toEqual({
      valid: false,
      reason: 'alpha',
    })
    expect(parseOpaquePickerAccent(tinycolor('not-a-color'))).toEqual({
      valid: false,
      reason: 'invalid',
    })
  })

  it('receives and rejects alpha from the actual SketchPicker HEX input event', async () => {
    interface PickerNode {
      type: string
      props: Record<string, unknown>
      children: PickerNode[]
      parent: PickerNode | null
      text?: string
    }

    const renderer = createRenderer<PickerNode, PickerNode>({
      patchProp(element, key, _previous, next) {
        element.props[key] = next
      },
      insert(element, parent, anchor) {
        element.parent = parent
        const anchorIndex = anchor ? parent.children.indexOf(anchor) : -1
        if (anchorIndex < 0) parent.children.push(element)
        else parent.children.splice(anchorIndex, 0, element)
      },
      remove(element) {
        if (element.parent) {
          element.parent.children = element.parent.children.filter((child) => child !== element)
        }
      },
      createElement(type) {
        return { type, props: {}, children: [], parent: null }
      },
      createText(text) {
        return { type: '#text', text, props: {}, children: [], parent: null }
      },
      createComment(text) {
        return { type: '#comment', text, props: {}, children: [], parent: null }
      },
      setText(node, text) {
        node.text = text
      },
      setElementText(node, text) {
        node.text = text
        node.children = []
      },
      parentNode(node) {
        return node.parent
      },
      nextSibling(node) {
        if (!node.parent) return null
        return node.parent.children[node.parent.children.indexOf(node) + 1] ?? null
      },
    })
    const root: PickerNode = { type: 'root', props: {}, children: [], parent: null }
    const color = ref(tinycolor(DEFAULT_DARK_ACCENT))
    let pickerResult: PickerAccentResult | null = null
    let emittedAlpha: number | undefined
    const app = renderer.createApp({
      setup() {
        return () =>
          h(SketchPicker, {
            tinyColor: color.value,
            'onUpdate:tinyColor': (value: unknown) => {
              pickerResult = parseOpaquePickerAccent(value)
              emittedAlpha = (value as { getAlpha(): number }).getAlpha()
              if (pickerResult.valid) color.value = tinycolor(pickerResult.color)
            },
            disableAlpha: true,
          })
      },
    })

    vi.stubGlobal('window', new EventTarget())
    try {
      app.mount(root)
      const pending: PickerNode[] = [...root.children]
      let hexInput: PickerNode | undefined
      while (pending.length > 0) {
        const node = pending.pop()!
        if (node.props.class === 'vc-input-input' && node.props['aria-label'] === 'Hex') {
          hexInput = node
          break
        }
        pending.push(...node.children)
      }
      expect(hexInput).toBeDefined()
      ;(hexInput!.props.onInput as (event: { target: { value: string } }) => void)({
        target: { value: '34D39980' },
      })
      await nextTick()

      expect(emittedAlpha).toBeCloseTo(0.5, 2)
      expect(pickerResult).toEqual({ valid: false, reason: 'alpha' })
      expect(color.value.toHexString()).toBe('#f472b6')
      ;(hexInput!.props.onBlur as (event: object) => void)({})
      await nextTick()
      expect(hexInput!.props.value).toBe('f472b6')
    } finally {
      app.unmount()
      vi.unstubAllGlobals()
    }
  })
})
