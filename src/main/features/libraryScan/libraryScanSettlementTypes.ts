import type { LibraryChangedEvent } from '@shared/types/libraryEvents'
import type { LibraryScanProgress } from '@shared/types/libraryScan'
import type { LibraryScanWorkerMessage } from './libraryScanTypes'

export interface ScanSettlementSnapshot {
  hadFailures: boolean
}

export type ScanSettlementEvent =
  | { type: 'changed'; payload: LibraryChangedEvent }
  | { type: 'progress'; payload: LibraryScanProgress }

export interface ScanSettlementInput {
  databasePath: string
  jobId: number
  snapshot: ScanSettlementSnapshot
  complete: Extract<LibraryScanWorkerMessage, { type: 'complete' }>['payload']
  state: SharedArrayBuffer
}

export type ScanSettlementReply =
  | { type: 'prepared'; events: ScanSettlementEvent[] }
  | { type: 'finished'; error?: string }

export const SCAN_SETTLEMENT_ACTIVE = 0
export const SCAN_SETTLEMENT_CANCEL = 1
export const SCAN_SETTLEMENT_COMMITTING = 2
