import { describe, expect, it } from 'vitest'
import { ipcChannels } from '@shared/ipc/channels'
import type { IpcHandlerRegistrar } from './ipcHandlerRegistrar'
import { registerDomainIpcHandlers, type DomainIpcDependencies } from './registerDomainIpcHandlers'

interface RegistrationAudit {
  missing: string[]
  duplicates: string[]
  unexpected: string[]
}

function auditRegistrations(
  expected: readonly string[],
  actual: readonly string[],
): RegistrationAudit {
  const expectedSet = new Set(expected)
  const counts = new Map<string, number>()

  for (const channel of actual) {
    counts.set(channel, (counts.get(channel) ?? 0) + 1)
  }

  return {
    missing: expected.filter((channel) => !counts.has(channel)),
    duplicates: [...counts]
      .filter(([, count]) => count > 1)
      .map(([channel]) => channel)
      .sort(),
    unexpected: [...counts.keys()].filter((channel) => !expectedSet.has(channel)).sort(),
  }
}

function flattenChannels(value: object): string[] {
  return Object.values(value).flatMap((group) => Object.values(group as Record<string, string>))
}

const nonInvokeChannels = new Set<string>([
  ipcChannels.app.rendererReady,
  ipcChannels.library.scanProgress,
  ipcChannels.library.changed,
  ipcChannels.systemMedia.updateThumbarState,
  ipcChannels.systemMedia.command,
  ipcChannels.desktopLyrics.changed,
  ipcChannels.desktopLyrics.visibilityChanged,
  ipcChannels.desktopLyrics.mousePassthroughChanged,
  ipcChannels.metadata.refreshProgress,
  ipcChannels.window.miniPlayerStateChanged,
])

const externallyRegisteredInvokeChannels = new Set<string>([
  ipcChannels.desktopLyrics.toggle,
  ipcChannels.desktopLyrics.isVisible,
  ipcChannels.desktopLyrics.toggleMousePassthrough,
  ipcChannels.desktopLyrics.isMousePassthroughEnabled,
  ipcChannels.desktopLyrics.update,
])

const expectedDomainInvokeChannels = flattenChannels(ipcChannels).filter(
  (channel) => !nonInvokeChannels.has(channel) && !externallyRegisteredInvokeChannels.has(channel),
)

const inertDependencies = {
  app: {},
  database: {},
  library: {},
  playlists: {},
  playbackArchive: {},
  metadata: {},
  window: {},
} as unknown as DomainIpcDependencies

describe('domain IPC registration coverage', () => {
  it('registers every composition-root invoke channel exactly once', () => {
    const registeredChannels: string[] = []
    const registrar: IpcHandlerRegistrar = {
      handle(channel) {
        registeredChannels.push(channel)
      },
    }

    registerDomainIpcHandlers(registrar, inertDependencies)

    expect(registeredChannels).toHaveLength(56)
    expect(auditRegistrations(expectedDomainInvokeChannels, registeredChannels)).toEqual({
      missing: [],
      duplicates: [],
      unexpected: [],
    })
  })

  it('reports missing, duplicate, and unexpected registrations', () => {
    expect(
      auditRegistrations(
        ['library:get-stats', 'playlists:list'],
        ['library:get-stats', 'library:get-stats', 'archive:unknown'],
      ),
    ).toEqual({
      missing: ['playlists:list'],
      duplicates: ['library:get-stats'],
      unexpected: ['archive:unknown'],
    })
  })
})
