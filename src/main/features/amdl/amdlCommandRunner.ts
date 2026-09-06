import { spawn, type ChildProcess } from 'node:child_process'
import type { AmdlLogEvent, AmdlStage, AmdlTaskProgress, AmdlTaskState } from '@shared/types/amdl'
import { parseAmdlOutputLine } from './amdlOutputParser'
import { LineBuffer } from './lineBuffer'

export interface AmdlCommandConfig {
  distro?: string
  user?: string
  workingDirectory?: string
  command?: string
}

export const DEFAULT_AMDL_CONFIG: Required<AmdlCommandConfig> = {
  distro: 'u22-amdl',
  user: 'root',
  workingDirectory: '/mnt/e/AMDL-WSL2 (ALL IN ONE)/AMDL-WSL/apple-music-downloader',
  command: 'wsl.exe',
}

export type SpawnFactory = (command: string, args: readonly string[]) => ChildProcess

export function buildWslAmdlArgs(
  url: string,
  config: Required<AmdlCommandConfig> = DEFAULT_AMDL_CONFIG,
): string[] {
  const bashScript = 'cd "' + config.workingDirectory + '" && go run main.go --aac "$1"'
  return [
    '-d',
    config.distro,
    '-u',
    config.user,
    '--',
    'bash',
    '-lic',
    bashScript,
    'auralis-amdl',
    url,
  ]
}

export interface AmdlRunnerOptions {
  taskId: string
  url: string
  config?: AmdlCommandConfig
  spawnProcess?: SpawnFactory
  onProgress: (progress: AmdlTaskProgress) => void
  onLog?: (event: AmdlLogEvent) => void
}

export class AmdlCommandRunner {
  private readonly taskId: string
  private readonly url: string
  private readonly config: Required<AmdlCommandConfig>
  private readonly spawnProcess: SpawnFactory
  private readonly onProgress: (progress: AmdlTaskProgress) => void
  private readonly onLog?: (event: AmdlLogEvent) => void

  private childProcess: ChildProcess | null = null
  private cancelRequested = false
  private terminalSettled = false
  private alreadyExistsObserved = false
  private currentState: AmdlTaskState = 'starting'
  private currentStage: AmdlStage = 'launching'
  private lastMessage: string | null = null
  private lastError: string | null = null
  private startedAtIso: string
  private finishedAtIso: string | null = null

  private stdoutBuffer = new LineBuffer()
  private stderrBuffer = new LineBuffer()

  constructor(options: AmdlRunnerOptions) {
    this.taskId = options.taskId
    this.url = options.url
    this.config = { ...DEFAULT_AMDL_CONFIG, ...options.config }
    this.spawnProcess = options.spawnProcess ?? ((cmd, args) => spawn(cmd, args))
    this.onProgress = options.onProgress
    this.onLog = options.onLog
    this.startedAtIso = new Date().toISOString()
  }

  getProgress(): AmdlTaskProgress {
    return {
      taskId: this.taskId,
      url: this.url,
      state: this.currentState,
      stage: this.currentStage,
      alreadyExists: this.alreadyExistsObserved,
      message: this.lastMessage,
      error: this.lastError,
      startedAt: this.startedAtIso,
      finishedAt: this.finishedAtIso,
    }
  }

  start(): void {
    if (this.childProcess !== null || this.terminalSettled) {
      return
    }

    const args = buildWslAmdlArgs(this.url, this.config)
    let child: ChildProcess
    try {
      child = this.spawnProcess(this.config.command, args)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.settleTerminal('failed', null, msg)
      return
    }

    this.childProcess = child
    this.currentState = 'running'
    this.currentStage = 'launching'
    this.emitProgress()

    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer | string) => {
        const lines = this.stdoutBuffer.push(chunk)
        for (const line of lines) {
          this.handleStdoutLine(line)
        }
      })
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer | string) => {
        const lines = this.stderrBuffer.push(chunk)
        for (const line of lines) {
          this.handleStderrLine(line)
        }
      })
    }

    child.on('error', (err: Error) => {
      if (this.terminalSettled) return
      if (this.cancelRequested) {
        this.settleTerminal('cancelled', null, err.message)
      } else {
        this.settleTerminal('failed', null, err.message)
      }
    })

    child.on('close', (code: number | null) => {
      // Flush residual lines
      const flushedStdout = this.stdoutBuffer.flush()
      for (const line of flushedStdout) {
        this.handleStdoutLine(line)
      }
      const flushedStderr = this.stderrBuffer.flush()
      for (const line of flushedStderr) {
        this.handleStderrLine(line)
      }

      if (this.terminalSettled) {
        return
      }

      if (this.cancelRequested) {
        this.settleTerminal('cancelled', null, this.lastError)
        return
      }

      if (code === 0) {
        if (this.alreadyExistsObserved) {
          this.settleTerminal('already-exists', null, null)
        } else {
          this.settleTerminal('completed', null, null)
        }
      } else {
        const exitMsg = 'Process exited with code ' + (code ?? 'unknown')
        this.settleTerminal('failed', null, this.lastError ?? exitMsg)
      }
    })
  }

  cancel(): boolean {
    if (this.terminalSettled || this.cancelRequested) {
      return false
    }

    this.cancelRequested = true
    this.lastMessage = 'Cancellation requested'
    this.emitProgress()

    if (this.childProcess) {
      try {
        this.childProcess.kill()
      } catch {
        // Kill failed or already dead
      }
    }

    return true
  }

  private handleStdoutLine(line: string): void {
    if (this.terminalSettled) return

    const trimmed = line.trim()
    if (trimmed) {
      this.onLog?.({
        taskId: this.taskId,
        stream: 'stdout',
        line: trimmed,
      })
    }

    const parsed = parseAmdlOutputLine(line)

    let changed = false
    if (parsed.alreadyExists) {
      this.alreadyExistsObserved = true
      changed = true
    }
    if (parsed.stage) {
      this.currentStage = parsed.stage
      changed = true
    }
    if (parsed.message) {
      this.lastMessage = parsed.message
      changed = true
    }

    if (changed) {
      this.emitProgress()
    }
  }

  private handleStderrLine(line: string): void {
    if (this.terminalSettled) return
    const trimmed = line.trim()
    if (!trimmed) return

    this.onLog?.({
      taskId: this.taskId,
      stream: 'stderr',
      line: trimmed,
    })

    // Record as lastError if significant, but don't fail immediately until exit
    this.lastError = trimmed
  }

  private settleTerminal(
    state: 'completed' | 'already-exists' | 'failed' | 'cancelled',
    stage: AmdlStage,
    error: string | null,
  ): void {
    if (this.terminalSettled) {
      return
    }

    this.terminalSettled = true
    this.currentState = state
    this.currentStage = stage
    if (error !== null) {
      this.lastError = error
    }
    this.finishedAtIso = new Date().toISOString()
    this.emitProgress()
  }

  private emitProgress(): void {
    this.onProgress(this.getProgress())
  }
}
