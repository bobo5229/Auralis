import type { Component } from 'vue'

export function createSettingsContentLoader(loader: () => Promise<Component>) {
  let pending: Promise<Component> | undefined

  function load(): Promise<Component> {
    if (!pending) {
      pending = loader().catch((error) => {
        pending = undefined
        throw error
      })
    }
    return pending
  }

  async function preload(): Promise<void> {
    // Opening the dialog reports persistent failures and offers retry.
    await load().catch(() => {})
  }

  return { load, preload }
}

export const { load: loadSettingsContent, preload: preloadSettingsContent } =
  createSettingsContentLoader(() =>
    import('../components/SettingsContent.vue').then((mod) => mod.default),
  )
