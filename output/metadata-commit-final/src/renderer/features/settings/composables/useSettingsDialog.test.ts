import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Initialize Vue before installing the minimal document used by these state tests.
import 'vue'

class FocusTarget {
  isConnected = true
  disabled = false
  inert = false
  focus = vi.fn()
  matches(): boolean {
    return this.disabled
  }
  closest(): FocusTarget | null {
    return this.inert ? this : null
  }
}

let trigger: FocusTarget
let fallback: FocusTarget
let fakeDocument: {
  activeElement: FocusTarget
  body: FocusTarget
  querySelector: () => FocusTarget
}

beforeEach(() => {
  vi.resetModules()
  trigger = new FocusTarget()
  fallback = new FocusTarget()
  fakeDocument = { activeElement: trigger, body: new FocusTarget(), querySelector: () => fallback }
  vi.stubGlobal('HTMLElement', FocusTarget)
  vi.stubGlobal('document', fakeDocument)
})

afterEach(() => vi.unstubAllGlobals())

describe('settings dialog state', () => {
  it('shares one dialog and remembers the last section until a new application session', async () => {
    const { useSettingsDialog } = await import('./useSettingsDialog')
    const sidebar = useSettingsDialog()
    const library = useSettingsDialog()
    expect(sidebar.isSettingsOpen.value).toBe(false)
    expect(sidebar.selectedSection.value).toBe('appearance')
    sidebar.openSettings()
    library.selectSettingsSection('playback')
    library.closeSettings()
    sidebar.openSettings()
    expect(library.isSettingsOpen.value).toBe(true)
    expect(sidebar.selectedSection.value).toBe('playback')
    vi.resetModules()
    const fresh = (await import('./useSettingsDialog')).useSettingsDialog()
    expect(fresh.isSettingsOpen.value).toBe(false)
    expect(fresh.selectedSection.value).toBe('appearance')
  })

  it('opens the library section explicitly without replacing the return target on repeated opens', async () => {
    const state = (await import('./useSettingsDialog')).useSettingsDialog()
    state.openSettings('library')
    expect(state.selectedSection.value).toBe('library')
    fakeDocument.activeElement = new FocusTarget()
    state.openSettings()
    state.closeSettings()
    state.restoreSettingsFocus()
    expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(fakeDocument.activeElement.focus).not.toHaveBeenCalled()
  })

  it.each(['disconnected', 'disabled', 'inert', 'body'] as const)(
    'uses the sidebar fallback when the original trigger is %s',
    async (condition) => {
      const state = (await import('./useSettingsDialog')).useSettingsDialog()
      if (condition === 'body') fakeDocument.activeElement = fakeDocument.body
      state.openSettings()
      if (condition === 'disconnected') trigger.isConnected = false
      if (condition === 'disabled') trigger.disabled = true
      if (condition === 'inert') trigger.inert = true
      state.closeSettings()
      state.restoreSettingsFocus()
      expect(fallback.focus).toHaveBeenCalledWith({ preventScroll: true })
      expect(trigger.focus).not.toHaveBeenCalled()
    },
  )

  it('does not steal focus from a fullscreen overlay when the background remains inert', async () => {
    const state = (await import('./useSettingsDialog')).useSettingsDialog()
    state.openSettings()
    trigger.inert = fallback.inert = true
    state.closeSettings()
    state.restoreSettingsFocus()
    expect(trigger.focus).not.toHaveBeenCalled()
    expect(fallback.focus).not.toHaveBeenCalled()
  })
})
