import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, createWebHashHistory: actual.createMemoryHistory }
})

vi.mock('@renderer/features/library/pages/LibraryPage.vue', () => ({
  default: { name: 'LibraryPage', render: () => null },
}))

vi.mock('@renderer/features/archive/pages/ArchivePage.vue', () => ({
  default: { name: 'ArchivePage', render: () => null },
}))

import { router } from './index'
import { routeLoaders } from './routeComponentLoaders'

describe('default route', () => {
  it('registers recently added as a fixed route using the library page loader', () => {
    const recentAdded = router.resolve('/recent-added')
    expect(recentAdded.name).toBe('recent-added')
    expect(recentAdded.matched[0]?.components?.default).toBe(routeLoaders.library)
  })

  it('redirects the root path to the songs page', async () => {
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('library')
    expect(router.currentRoute.value.fullPath).toBe('/songs')
  })

  it('redirects the retired settings page to the songs page', async () => {
    await router.push('/settings')
    expect(router.currentRoute.value.name).toBe('library')
    expect(router.currentRoute.value.fullPath).toBe('/songs')
  })

  it('keeps the archive route and redirects the legacy Mac entry to it', async () => {
    await router.push('/archive')
    expect(router.currentRoute.value.name).toBe('archive')
    expect(router.currentRoute.value.fullPath).toBe('/archive')

    await router.push('/archive/mac')
    expect(router.currentRoute.value.name).toBe('archive')
    expect(router.currentRoute.value.fullPath).toBe('/archive')
  })
})
