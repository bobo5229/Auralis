import { afterEach, expect, it, vi } from 'vitest'
import { markSplashFinished, SPLASH_FINISHED_EVENT } from '@renderer/shared/startup/startupSignals'

afterEach(() => vi.unstubAllGlobals())
it('publishes completion once and leaves state for late subscribers', () => {
  const target = { dispatchEvent: vi.fn(), __auralisSplashFinished: false }
  vi.stubGlobal('window', target)
  markSplashFinished()
  markSplashFinished()
  expect(target.__auralisSplashFinished).toBe(true)
  expect(target.dispatchEvent).toHaveBeenCalledTimes(1)
  expect(target.dispatchEvent.mock.calls[0][0].type).toBe(SPLASH_FINISHED_EVENT)
})
it('never publishes successful retirement during startup failure', () => {
  const target = { dispatchEvent: vi.fn(), __auralisAppFailed: true }
  vi.stubGlobal('window', target)
  markSplashFinished()
  expect(target.dispatchEvent).not.toHaveBeenCalled()
})
