import { BrowserWindow, dialog } from 'electron'
import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { ipcChannels } from '@shared/ipc/channels'
import type {
  LibraryRoot,
  LibraryScanProgress,
  LibraryScanStatus,
  SelectLibraryRootResult,
} from '@shared/types/libraryScan'
import { logger } from '@main/logging/logger'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { ScanFailureRepository } from '@main/repositories/scanFailureRepository'
import { ScanJobRepository } from '@main/repositories/scanJobRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import type { LibraryScanWorkerInput, LibraryScanWorkerMessage } from './libraryScanTypes'

export class LibraryScanService {
  private readonly libraryRootRepository: LibraryRootRepository
  private readonly scanJobRepository: ScanJobRepository
  private readonly scanFailureRepository: ScanFailureRepository
  private readonly trackRepository: TrackRepository
  private activeWorker: Worker | null = null
  private activeJobId: number | null = null

  constructor(db: Database.Database) {
    this.libraryRootRepository = new LibraryRootRepository(db)
    this.scanJobRepository = new ScanJobRepository(db)
    this.scanFailureRepository = new ScanFailureRepository(db)
    this.trackRepository = new TrackRepository(db)
    this.scanJobRepository.markInterruptedJobs()
  }

  async selectRoot(): Promise<SelectLibraryRootResult> {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: 'Choose Music Library Folder',
    })

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true }
    }

    const root = this.libraryRootRepository.upsertByPath(result.filePaths[0])

    return { canceled: false, root }
  }

  getRoots(): LibraryRoot[] {
    return this.libraryRootRepository.list()
  }

  getScanStatus(jobId?: number): LibraryScanStatus | null {
    return jobId ? this.scanJobRepository.getById(jobId) : this.scanJobRepository.getLatest()
  }

  startScan(rootId: number): { jobId: number } {
    const activeJob = this.scanJobRepository.getActive()

    if (activeJob) {
      return { jobId: activeJob.jobId }
    }

    const root = this.libraryRootRepository.getById(rootId)

    if (!root) {
      throw new Error(`Library root not found: ${rootId}`)
    }

    const job = this.scanJobRepository.create(root.id)
    this.activeJobId = job.jobId
    this.startWorker(job.jobId, root.path)

    return { jobId: job.jobId }
  }

  async cancelScan(jobId: number): Promise<{ ok: boolean }> {
    if (!this.activeWorker || this.activeJobId !== jobId) {
      return { ok: false }
    }

    await this.activeWorker.terminate()
    this.activeWorker = null
    this.activeJobId = null
    this.scanJobRepository.finish(jobId, 'canceled')
    const status = this.scanJobRepository.getById(jobId)

    if (status) {
      this.publishProgress({
        jobId,
        status: 'canceled',
        totalFiles: status.totalFiles,
        scannedFiles: status.scannedFiles,
        failedFiles: status.failedFiles,
        currentFile: null,
        message: 'Scan canceled',
      })
    }

    return { ok: true }
  }

  private startWorker(jobId: number, rootPath: string): void {
    const workerInput: LibraryScanWorkerInput = {
      jobId,
      rootPath,
      knownFiles: this.trackRepository.getKnownFiles(),
    }
    const workerPath = join(__dirname, 'features/libraryScan/libraryScanWorker.js')
    const worker = new Worker(workerPath, {
      workerData: workerInput,
    })

    this.activeWorker = worker

    worker.on('message', (message: LibraryScanWorkerMessage) => {
      this.handleWorkerMessage(message)
    })

    worker.on('error', (error) => {
      logger.error({ error, jobId }, 'Library scan worker failed')
      this.scanJobRepository.fail(jobId, error.message)
      this.activeWorker = null
      this.activeJobId = null
    })

    worker.on('exit', (code) => {
      if (code !== 0 && this.activeJobId === jobId) {
        this.scanJobRepository.fail(jobId, `Worker exited with code ${code}`)
        this.activeWorker = null
        this.activeJobId = null
      }
    })
  }

  private handleWorkerMessage(message: LibraryScanWorkerMessage): void {
    if (message.type === 'progress') {
      const progress = message.payload
      this.scanJobRepository.updateProgress(
        progress.jobId,
        progress.totalFiles,
        progress.scannedFiles,
        progress.failedFiles,
      )
      this.publishProgress(progress)
      return
    }

    if (message.type === 'tracks') {
      this.trackRepository.upsertMany(message.payload)
      return
    }

    if (message.type === 'failure') {
      this.scanFailureRepository.insertMany([message.payload])
      return
    }

    if (message.type === 'fatal') {
      this.scanJobRepository.fail(message.payload.jobId, message.payload.reason)
      this.publishProgress({
        jobId: message.payload.jobId,
        status: 'failed',
        totalFiles: 0,
        scannedFiles: 0,
        failedFiles: 1,
        currentFile: null,
        message: message.payload.reason,
      })
      this.activeWorker = null
      this.activeJobId = null
      return
    }

    if (message.type === 'complete') {
      const jobId = this.activeJobId

      if (!jobId) {
        return
      }

      const status = this.scanJobRepository.getById(jobId)

      if (status) {
        this.libraryRootRepository.markScanned(status.rootId)
        this.scanJobRepository.finish(jobId, 'completed')
        this.publishProgress({
          jobId,
          status: 'completed',
          totalFiles: status.totalFiles,
          scannedFiles: status.scannedFiles,
          failedFiles: status.failedFiles,
          currentFile: null,
          message: 'Scan completed',
        })
      }

      this.activeWorker = null
      this.activeJobId = null
    }
  }

  private publishProgress(progress: LibraryScanProgress): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(ipcChannels.library.scanProgress, progress)
    }
  }
}
