import { describe, expect, it, vi } from 'vitest'
import { ArtworkCacheGarbageCollector } from './artworkCacheGarbageCollector'
import { ArtworkCacheMigrationService } from './artworkCacheMigrationService'
import { ArtworkCacheMaintenanceService } from './artworkCacheMaintenanceService'

function fakeMigration(
  overrides: Partial<Record<keyof ArtworkCacheMigrationService, unknown>> = {},
) {
  return {
    hasLegacyKeys: vi.fn(() => true),
    runMigration: vi.fn(async () => ({})),
    isRunning: vi.fn(() => false),
    ...overrides,
  } as unknown as ArtworkCacheMigrationService
}

function fakeCollector(
  overrides: Partial<Record<keyof ArtworkCacheGarbageCollector, unknown>> = {},
) {
  return {
    collectGarbage: vi.fn(async () => ({})),
    isRunning: vi.fn(() => false),
    ...overrides,
  } as unknown as ArtworkCacheGarbageCollector
}

function fakeGate(overrides: Partial<{ scan: boolean; refresh: boolean; import: boolean }> = {}) {
  const { scan = false, refresh = false, import: importing = false } = overrides
  return {
    isScanActive: vi.fn(() => scan),
    isRefreshActive: vi.fn(() => refresh),
    isImportActive: vi.fn(() => importing),
  }
}

describe('ArtworkCacheMaintenanceService', () => {
  it('runs migration then garbage collection on startup when legacy keys exist', async () => {
    const migration = fakeMigration()
    const collector = fakeCollector()
    const service = new ArtworkCacheMaintenanceService(migration, collector, fakeGate())

    await service.runStartupMaintenance()

    expect(migration.hasLegacyKeys).toHaveBeenCalled()
    expect(migration.runMigration).toHaveBeenCalledTimes(1)
    expect(collector.collectGarbage).toHaveBeenCalledTimes(1)
    expect(service.getState()).toBe('idle')
  })

  it('skips migration when there are no legacy keys', async () => {
    const migration = fakeMigration({ hasLegacyKeys: vi.fn(() => false) })
    const collector = fakeCollector()
    const service = new ArtworkCacheMaintenanceService(migration, collector, fakeGate())

    await service.runStartupMaintenance()

    expect(migration.runMigration).not.toHaveBeenCalled()
    expect(collector.collectGarbage).not.toHaveBeenCalled()
  })

  it('refuses to run while a scan worker is active', async () => {
    const migration = fakeMigration()
    const collector = fakeCollector()
    const service = new ArtworkCacheMaintenanceService(
      migration,
      collector,
      fakeGate({ scan: true }),
    )

    await service.runStartupMaintenance()

    expect(migration.runMigration).not.toHaveBeenCalled()
    expect(collector.collectGarbage).not.toHaveBeenCalled()
  })

  it('skips garbage collection if a writer became active during migration', async () => {
    const migration = fakeMigration()
    const collector = fakeCollector()
    const gate = fakeGate()
    const service = new ArtworkCacheMaintenanceService(migration, collector, gate)

    // A scan starts while the migration is running.
    gate.isScanActive.mockReturnValueOnce(false).mockReturnValue(true)

    await service.runStartupMaintenance()

    expect(migration.runMigration).toHaveBeenCalledTimes(1)
    expect(collector.collectGarbage).not.toHaveBeenCalled()
    expect(service.getState()).toBe('idle')
  })

  it('serializes overlapping maintenance requests into one run', async () => {
    const migration = fakeMigration()
    const collector = fakeCollector()
    const service = new ArtworkCacheMaintenanceService(migration, collector, fakeGate())

    const first = service.runAfterScanGarbageCollection()
    const second = service.runAfterScanGarbageCollection()

    expect(second).toBe(first)
    await first
    expect(collector.collectGarbage).toHaveBeenCalledTimes(1)
  })
})
