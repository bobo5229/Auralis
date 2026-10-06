import { describe, expect, it, vi } from 'vitest'
import { createSettingsContentLoader } from './settingsContentLoader'

describe('settings content loading', () => {
  it('stays lazy and shares preload, open and subsequent open requests', async () => {
    const component = { name: 'SettingsContent' }
    const load = vi.fn().mockResolvedValue(component)
    const loader = createSettingsContentLoader(load)
    expect(load).not.toHaveBeenCalled()
    const preloading = loader.preload()
    expect(await loader.load()).toBe(component)
    await preloading
    expect(await loader.load()).toBe(component)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('allows a failed open to retry successfully', async () => {
    const component = { name: 'SettingsContent' }
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('chunk unavailable'))
      .mockResolvedValue(component)
    const loader = createSettingsContentLoader(load)
    await expect(loader.load()).rejects.toThrow('chunk unavailable')
    expect(await loader.load()).toBe(component)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('absorbs a preload failure while allowing a later open to retry', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('chunk unavailable'))
      .mockResolvedValue({ name: 'SettingsContent' })
    const loader = createSettingsContentLoader(load)
    await expect(loader.preload()).resolves.toBeUndefined()
    await expect(loader.load()).resolves.toEqual({ name: 'SettingsContent' })
  })
})
