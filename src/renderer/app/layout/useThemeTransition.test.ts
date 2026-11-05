import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, ref, shallowRef } from 'vue'
import { useTheme } from '@renderer/features/appearance/composables/useTheme'
import { setMotionPreference } from '@renderer/shared/animation/motionPreference'
import {
  ShellTestAnimation,
  ShellTestElement,
  shellTestRenderer,
} from '@renderer/testUtils/rendererTestHost'
import { useThemeTransition } from './useThemeTransition'

describe('global theme transition', () => {
  let root: ShellTestElement
  let host: ShellTestElement
  let main: ShellTestElement
  let motion: EventTarget & { matches: boolean }
  let app: ReturnType<typeof shellTestRenderer.createApp> | undefined
  const location = ref('/albums')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(ShellTestElement.prototype, 'animate').mockImplementation(function (
      this: ShellTestElement,
      keyframes,
      options,
    ) {
      const animation = new ShellTestAnimation(keyframes, options)
      const start = Date.now()
      Object.defineProperty(animation, 'currentTime', {
        configurable: true,
        get: () => Date.now() - start,
      })
      this.animations.push(animation)
      return animation
    })
    location.value = '/albums'
    root = new ShellTestElement()
    host = new ShellTestElement()
    main = new ShellTestElement()
    main.className = 'app-main'
    Object.assign(main, { getClientRects: () => [{}] })
    host.append(main)
    host.querySelectorAll = () => [main]
    motion = Object.assign(new EventTarget(), { matches: false })
    vi.stubGlobal('window', { matchMedia: () => motion })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16),
    )
    vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id))
    vi.stubGlobal('document', {
      documentElement: root,
      createElement: (tag: string) => new ShellTestElement(tag),
    })
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    })
    vi.stubGlobal('getComputedStyle', (node: ShellTestElement) => {
      const light = root.dataset.theme === 'light'
      const color = light ? '#1e1e1e' : '#f0f0f0'
      const background = light ? 'rgb(250 250 250)' : 'rgb(26 26 26)'
      return {
        backgroundColor: background,
        getPropertyValue: (token: string) =>
          node.style.getPropertyValue(token) ||
          (token === '--auralis-main-bg'
            ? background
            : token === '--auralis-sidebar-brand-text' && !light
              ? 'rgba(255, 255, 255, 0.88)'
              : color),
      }
    })
    setMotionPreference('system')
    useTheme().initTheme()
  })
  afterEach(() => {
    app?.unmount()
    app = undefined
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  function mount() {
    app = shellTestRenderer.createApp({
      setup() {
        useThemeTransition(shallowRef(host as unknown as HTMLElement), () => location.value)
        return () => h('div')
      },
    })
    app.mount(new ShellTestElement())
  }

  it('fades a decorative background while preserving the committed theme and restoring tokens', async () => {
    main.style.setProperty('--auralis-text-muted', 'rgb(200 200 200)')
    mount()
    await useTheme().setTheme('light')
    await nextTick()
    await vi.advanceTimersByTimeAsync(32)
    const layer = main.children[0]
    expect(layer.className).toBe('theme-transition-surface')
    expect(layer.props['aria-hidden']).toBe('true')
    expect(layer.style.background).toBe('rgb(26 26 26)')
    expect(layer.animations[0].keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }])
    expect(main.style.getPropertyValue('--auralis-text')).toBe('rgb(240 240 240)')
    expect(root.dataset.theme).toBe('light')
    expect(localStorage.getItem('auralis-theme')).toBe('light')
    await vi.runAllTimersAsync()
    expect(root.dataset.themeTransition).toBeUndefined()
    expect(main.children).toHaveLength(0)
    expect(main.style.getPropertyValue('--auralis-text')).toBe('')
    expect(main.style.getPropertyValue('--auralis-text-muted')).toBe('rgb(200 200 200)')
  })

  it('keeps a translucent brand readable through the fade and restores its theme token', async () => {
    mount()
    await useTheme().setTheme('light')
    await nextTick()
    await vi.advanceTimersByTimeAsync(32)
    // 88% white over the old #1a1a1a surface, with the same initial appearance.
    expect(main.style.getPropertyValue('--auralis-sidebar-brand-text')).toBe('rgb(228 228 228)')
    await vi.advanceTimersByTimeAsync(220)
    expect(main.style.getPropertyValue('--auralis-sidebar-brand-text')).toBe('rgb(30 30 30)')
    expect(root.dataset.themeTransition).toBe('true')
    await vi.runAllTimersAsync()
    expect(main.style.getPropertyValue('--auralis-sidebar-brand-text')).toBe('')
  })

  it('follows the background timeline even when its start is delayed', async () => {
    mount()
    await useTheme().setTheme('light')
    await nextTick()
    await vi.advanceTimersByTimeAsync(32)
    const animation = main.children[0].animations[0]
    let backgroundTime = 0
    Object.defineProperty(animation, 'currentTime', {
      configurable: true,
      get: () => backgroundTime,
    })
    await vi.advanceTimersByTimeAsync(100)
    expect(main.style.getPropertyValue('--auralis-sidebar-brand-text')).toBe('rgb(228 228 228)')
    backgroundTime = 220
    await vi.advanceTimersByTimeAsync(16)
    expect(main.style.getPropertyValue('--auralis-sidebar-brand-text')).toBe('rgb(30 30 30)')
  })

  it('keeps the latest selection when switching again before Vue flushes', async () => {
    mount()
    void useTheme().setTheme('light')
    void useTheme().setTheme('dark')
    await nextTick()
    await vi.runAllTimersAsync()
    expect(root.dataset.theme).toBe('dark')
    expect(localStorage.getItem('auralis-theme')).toBe('dark')
    expect(main.children).toHaveLength(0)
    expect(root.dataset.themeTransition).toBeUndefined()
  })

  it('skips animation with reduced motion and cancels an active fade if the preference changes', async () => {
    mount()
    setMotionPreference('reduce')
    await useTheme().setTheme('light')
    await nextTick()
    expect(main.children).toHaveLength(0)
    expect(root.dataset.themeTransition).toBeUndefined()
    setMotionPreference('system')
    await useTheme().setTheme('dark')
    await nextTick()
    expect(main.children).toHaveLength(1)
    setMotionPreference('reduce')
    expect(main.children).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(root.dataset.themeTransition).toBeUndefined()
  })

  it('cleans up pending callbacks on unmount and preserves album-specific color transitions', async () => {
    mount()
    host.classList.add('has-album-detail-color')
    await useTheme().setTheme('light')
    await nextTick()
    expect(main.children).toHaveLength(0)
    expect(root.dataset.themeTransition).toBeUndefined()
    host.classList.remove('has-album-detail-color')
    void useTheme().setTheme('dark')
    app!.unmount()
    app = undefined
    await nextTick()
    expect(main.children).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(root.dataset.themeTransition).toBeUndefined()
  })

  it('releases the old page immediately when navigating during a fade', async () => {
    mount()
    await useTheme().setTheme('light')
    await nextTick()
    await vi.advanceTimersByTimeAsync(50)
    const layer = main.children[0]
    location.value = '/albums/detail'
    expect(main.children).toHaveLength(0)
    expect(layer.animations[0].cancelled).toBe(true)
    expect(main.style.getPropertyValue('--auralis-text')).toBe('')
    expect(root.dataset.themeTransition).toBeUndefined()
    expect(root.dataset.theme).toBe('light')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['is-album-detail', 'is-lyrics-floating', 'is-cd-albums'])(
    'preserves the existing surface transition for %s',
    async (mode) => {
      host.classList.add(mode)
      mount()
      await useTheme().setTheme('light')
      await nextTick()
      expect(main.children).toHaveLength(0)
      expect(main.style.getPropertyValue('--auralis-text')).toBe('')
      expect(root.dataset.themeTransition).toBeUndefined()
      expect(vi.getTimerCount()).toBe(0)
    },
  )
})
