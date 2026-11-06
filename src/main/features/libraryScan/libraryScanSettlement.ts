import Database from 'better-sqlite3'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { ScanJobRepository } from '@main/repositories/scanJobRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { LibraryScanPersistence } from './libraryScanPersistence'
import {
  SCAN_SETTLEMENT_ACTIVE,
  SCAN_SETTLEMENT_CANCEL,
  SCAN_SETTLEMENT_COMMITTING,
  type ScanSettlementEvent,
  type ScanSettlementInput,
} from './libraryScanSettlementTypes'

/** Same final transaction as the main-process path, on a thread-owned connection. */
export function settleLibraryScan(
  input: ScanSettlementInput,
  onPrepared: (events: ScanSettlementEvent[]) => void,
  onCommitting: () => void = () => {},
): void {
  const state = new Int32Array(input.state)
  const checkCanceled = () => {
    if (Atomics.load(state, 0) === SCAN_SETTLEMENT_CANCEL)
      throw new Error('Scan settlement canceled')
  }
  checkCanceled()
  const db = new Database(input.databasePath, { fileMustExist: true, timeout: 250 })
  try {
    if (db.pragma('journal_mode', { simple: true }) !== 'wal')
      throw new Error('Scan settlement requires the initialized WAL database')
    db.pragma('foreign_keys = ON')
    const jobs = new ScanJobRepository(db)
    const persistence = new LibraryScanPersistence(
      db,
      new LibraryRootRepository(db),
      jobs,
      new TrackRepository(db),
      { changed: () => {}, progress: () => {} },
      {
        checkCanceled,
        beforeCommit(events) {
          checkCanceled()
          // Deliver the exact event draft before the commit decision. The host only
          // publishes it after exit and a DB status check, including a lost final ACK.
          onPrepared(events)
          if (
            Atomics.compareExchange(
              state,
              0,
              SCAN_SETTLEMENT_ACTIVE,
              SCAN_SETTLEMENT_COMMITTING,
            ) !== SCAN_SETTLEMENT_ACTIVE
          )
            throw new Error('Scan settlement canceled')
          onCommitting()
        },
      },
    )
    persistence.restoreSettlement(input.snapshot)
    persistence.handleMessage({ type: 'complete', payload: input.complete }, input.jobId)
    if (jobs.getById(input.jobId)?.status !== 'completed')
      throw new Error('Scan job was not completed by settlement')
  } finally {
    db.close()
  }
}
