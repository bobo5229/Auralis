import { afterEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  connections: [] as Array<{ pragma: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }>,
  migrate: vi.fn(),
}))

vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => 'isolated' } }))
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
  copyFileSync: vi.fn(),
}))
vi.mock('better-sqlite3', () => ({
  default: class {
    pragma = vi.fn((name: string) => (name === 'quick_check(1)' ? 'ok' : undefined))
    close = vi.fn()
    constructor() {
      harness.connections.push(this)
    }
  },
}))
vi.mock('./schema', () => ({ migrateDatabase: harness.migrate }))
vi.mock('./databaseBackupService', () => ({ applyStagedRestoreIfExists: vi.fn() }))
vi.mock('@main/logging/logger', () => ({ logger: { info: vi.fn(), fatal: vi.fn() } }))

import { closeDatabase, initializeDatabase } from './connection'

afterEach(() => {
  closeDatabase()
  harness.connections.length = 0
  harness.migrate.mockReset()
})

describe('database initialization', () => {
  it('closes a failed migration and opens a fresh connection on retry', () => {
    harness.migrate.mockImplementationOnce(() => {
      throw new Error('backup failed')
    })
    expect(() => initializeDatabase()).toThrow('backup failed')
    expect(harness.connections[0]!.close).toHaveBeenCalledOnce()
    expect(initializeDatabase()).toBe(harness.connections[1])
    expect(harness.migrate).toHaveBeenCalledTimes(2)
  })
})
