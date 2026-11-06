import { parentPort, workerData } from 'node:worker_threads'
import { settleLibraryScan } from './libraryScanSettlement'
import type { ScanSettlementInput, ScanSettlementReply } from './libraryScanSettlementTypes'

let reply: ScanSettlementReply
try {
  settleLibraryScan(workerData as ScanSettlementInput, (events) =>
    parentPort?.postMessage({ type: 'prepared', events } satisfies ScanSettlementReply),
  )
  reply = { type: 'finished' }
} catch (error) {
  reply = {
    type: 'finished',
    error: error instanceof Error ? error.message : 'Scan settlement failed',
  }
}
// settleLibraryScan closes the connection before publishing this acknowledgement.
parentPort?.postMessage(reply)
