import type { AppInfo, LibraryStats } from '@shared/types/app'
import type {
  LibraryRoot,
  LibraryScanStatus,
  SelectLibraryRootResult,
} from '@shared/types/libraryScan'

export interface IpcInvokeContract {
  'app:get-info': {
    request: void
    response: AppInfo
  }
  'library:get-stats': {
    request: void
    response: LibraryStats
  }
  'library:select-root': {
    request: void
    response: SelectLibraryRootResult
  }
  'library:get-roots': {
    request: void
    response: LibraryRoot[]
  }
  'library:start-scan': {
    request: { rootId: number }
    response: { jobId: number }
  }
  'library:cancel-scan': {
    request: { jobId: number }
    response: { ok: boolean }
  }
  'library:get-scan-status': {
    request: { jobId?: number } | void
    response: LibraryScanStatus | null
  }
}

export type IpcInvokeChannel = keyof IpcInvokeContract

export type IpcRequest<TChannel extends IpcInvokeChannel> = IpcInvokeContract[TChannel]['request']

export type IpcResponse<TChannel extends IpcInvokeChannel> = IpcInvokeContract[TChannel]['response']
