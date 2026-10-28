import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, shallowRef } from 'vue'
import type { LyricsStatus } from './useTrackLyrics'
import { useFullscreenLyricsMenu } from './useFullscreenLyricsMenu'
const setScript = vi.hoisted(() => vi.fn())
vi.mock('@renderer/features/appearance/composables/useChineseTextDisplay', async () => {
  const { ref } = await import('vue')
  return {
    useChineseTextDisplay: () => ({
      lyricsScript: ref('simplified'),
      lyricsPersistFailed: ref(false),
      setLyricsScript: setScript,
    }),
  }
})
const cleanups: (() => void)[] = []
function fixture() {
  vi.useFakeTimers()
  setScript.mockClear()
  const isOpen = ref(true),
    currentTrackId = ref<number | null>(1),
    lyricsStatus = ref<LyricsStatus>('lrc')
  const lines = shallowRef([{ id: 'one', timeSeconds: 3, text: '歌词' }])
  const element = {
    focus: vi.fn(),
    getBoundingClientRect: () => ({ left: 20, top: 30, width: 201, height: 101 }),
  }
  const closeOtherMenus = vi.fn(),
    onKeydown = vi.fn(),
    onWheel = vi.fn(),
    pauseAutoFollow = vi.fn()
  const scope = effectScope()
  const session = scope.run(() =>
    useFullscreenLyricsMenu({
      isOpen,
      currentTrackId,
      lyricsStatus,
      lines,
      scrollRef: shallowRef(element as unknown as HTMLElement),
      closeOtherMenus,
      onKeydown,
      onWheel,
      pauseAutoFollow,
    }),
  )!
  cleanups.push(() => {
    session.dispose()
    scope.stop()
  })
  const mouse = (x = 50, y = 60) =>
    ({
      clientX: x,
      clientY: y,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }) as unknown as MouseEvent
  const key = (key = 'ContextMenu', shiftKey = false) =>
    ({
      key,
      shiftKey,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }) as unknown as KeyboardEvent
  return {
    session,
    isOpen,
    currentTrackId,
    lyricsStatus,
    lines,
    element,
    closeOtherMenus,
    onKeydown,
    onWheel,
    pauseAutoFollow,
    mouse,
    key,
  }
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.useRealTimers()
})
describe('useFullscreenLyricsMenu', () => {
  it('uses pointer coordinates and closes competing menus without taking their focus', () => {
    const f = fixture(),
      event = f.mouse()
    f.session.handleLyricsContextMenu(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(f.session.lyricsContextMenuAnchor.value).toEqual({ clientX: 50, clientY: 60 })
    expect(f.session.lyricsContextMenuOpen.value).toBe(true)
    expect(f.closeOtherMenus).toHaveBeenCalledOnce()
  })
  it.each([
    ['ContextMenu', false],
    ['F10', true],
  ])('deduplicates the native event after %s', (key, shift) => {
    const f = fixture()
    f.session.handleLyricsContainerKeydown(f.key(key as string, shift as boolean))
    expect(f.session.lyricsContextMenuAnchor.value).toEqual({ clientX: 121, clientY: 81 })
    f.session.handleLyricsContextMenu(f.mouse(0, 0))
    expect(f.closeOtherMenus).toHaveBeenCalledOnce()
    f.session.handleLyricsContainerKeydown(f.key())
    vi.advanceTimersByTime(750)
    f.session.handleLyricsContextMenu(f.mouse(0, 0))
    expect(f.closeOtherMenus).toHaveBeenCalledTimes(3)
    f.session.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['escape', 'position-error', 'outside', 'tab', 'focusout', 'scroll'] as const)(
    'preserves focus policy on %s',
    async (reason) => {
      const f = fixture()
      f.session.handleLyricsContextMenu(f.mouse())
      f.session.closeLyricsContextMenu(reason)
      await nextTick()
      expect(f.session.lyricsContextMenuOpen.value).toBe(false)
      expect(f.element.focus).toHaveBeenCalledTimes(
        reason === 'escape' || reason === 'position-error' ? 1 : 0,
      )
    },
  )
  it('applies script selection, closes and returns focus to the lyrics', async () => {
    const f = fixture()
    f.session.handleLyricsContextMenu(f.mouse())
    f.session.selectLyricsScript('traditional')
    await nextTick()
    expect(setScript).toHaveBeenCalledWith('traditional')
    expect(f.session.lyricsContextMenuOpen.value).toBe(false)
    expect(f.element.focus).toHaveBeenCalledWith({ preventScroll: true })
  })
  it('closes on wheel, touch, track/content changes and fullscreen exit', async () => {
    const f = fixture()
    f.session.handleLyricsContextMenu(f.mouse())
    const wheel = {} as WheelEvent
    f.session.handleLyricsWheel(wheel)
    expect(f.onWheel).toHaveBeenCalledWith(wheel)
    expect(f.session.lyricsContextMenuOpen.value).toBe(false)
    f.session.handleLyricsContextMenu(f.mouse())
    f.session.handleLyricsTouchMove()
    expect(f.pauseAutoFollow).toHaveBeenCalledOnce()
    for (const change of [
      () => (f.currentTrackId.value = 2),
      () => (f.lines.value = [{ id: 'two', timeSeconds: 4, text: '新歌词' }]),
      () => (f.lyricsStatus.value = 'plain'),
    ]) {
      f.session.handleLyricsContextMenu(f.mouse())
      change()
      await nextTick()
      expect(f.session.lyricsContextMenuOpen.value).toBe(false)
    }
    f.session.handleLyricsContainerKeydown(f.key())
    f.isOpen.value = false
    expect(f.session.lyricsContextMenuOpen.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(f.element.focus).not.toHaveBeenCalled()
  })
  it('does not intercept unavailable lyrics and forwards ordinary viewport keys', () => {
    const f = fixture(),
      key = f.key('ArrowDown')
    f.session.handleLyricsContainerKeydown(key)
    expect(f.onKeydown).toHaveBeenCalledWith(key)
    f.lyricsStatus.value = 'loading'
    const context = f.mouse()
    f.session.handleLyricsContextMenu(context)
    expect(context.preventDefault).not.toHaveBeenCalled()
    expect(f.session.lyricsContextMenuEnabled.value).toBe(false)
  })
})
