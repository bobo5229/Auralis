import { describe, expect, it, vi } from 'vitest'
import { registerMetadataIpcHandlers } from './registerMetadataIpcHandlers'
import type { IpcHandlerRegistrar } from './validatedIpcRegistrar'
import { MetadataSaveError } from '../features/metadata/metadataSaveError'

const edit = {
  trackId: 1,
  title: 'Title',
  artistDisplay: null,
  albumTitle: null,
  albumArtistDisplay: null,
  genreDisplay: null,
  year: null,
  releaseDate: null,
}

describe('metadata save failure transport', () => {
  it('passes the successful public library revision through the existing save IPC', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const service = {
      updateTrackMetadata: vi.fn(async () => ({ ok: true as const, libraryRevision: '12:1' })),
    }
    registerMetadataIpcHandlers(
      {
        handle: (channel, handler) =>
          handlers.set(channel, handler as (...args: unknown[]) => unknown),
      } as IpcHandlerRegistrar,
      { metadataRefreshService: service, playbackFileCoordinator: {} } as unknown as Parameters<
        typeof registerMetadataIpcHandlers
      >[1],
    )
    expect(await handlers.get('metadata:update-track-metadata')!(null, edit)).toEqual({
      ok: true,
      libraryRevision: '12:1',
    })
    expect(service.updateTrackMetadata).toHaveBeenCalledWith(edit)
  })

  it.each([
    [
      new MetadataSaveError('tag-preservation-failed', 'Private /path/song.m4a'),
      'tag-preservation-failed',
    ],
    [new MetadataSaveError('tag-verification-failed', 'Raw tags'), 'tag-verification-failed'],
    [new MetadataSaveError('file-changed', 'Private path'), 'file-changed'],
    [
      Object.assign(new MetadataSaveError('tag-write-failed', 'Private path'), { code: 'ENOSPC' }),
      'disk-full',
    ],
    [Object.assign(new Error('Private path'), { code: 'EPERM' }), 'permission-denied'],
    [Object.assign(new Error('Private path'), { code: 'EBUSY' }), 'file-in-use'],
    [Object.assign(new Error('Private path'), { code: 'ENOENT' }), 'file-not-found'],
    [new Error('Internal SQLite or tool detail'), 'save-failed'],
  ])('returns a safe reason for %s', async (error, reason) => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const service = {
      updateTrackMetadata: vi.fn(async () => {
        throw error
      }),
    }
    registerMetadataIpcHandlers(
      {
        handle: (channel, handler) =>
          handlers.set(channel, handler as (...args: unknown[]) => unknown),
      } as IpcHandlerRegistrar,
      { metadataRefreshService: service, playbackFileCoordinator: {} } as unknown as Parameters<
        typeof registerMetadataIpcHandlers
      >[1],
    )
    expect(await handlers.get('metadata:update-track-metadata')!(null, edit)).toEqual({
      ok: false,
      reason,
    })
    expect(service.updateTrackMetadata).toHaveBeenCalledWith(edit)
  })
})
