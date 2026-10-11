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

describe('default route', () => {
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
