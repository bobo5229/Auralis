import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { validateAppleMusicUrl } from './amdlUrlValidator'
import { parseAmdlOutputLine } from './amdlOutputParser'
import { LineBuffer } from './lineBuffer'
import { AmdlCommandRunner, buildWslAmdlArgs, DEFAULT_AMDL_CONFIG } from './amdlCommandRunner'
import { AmdlDownloadService } from './amdlDownloadService'
import type { AmdlSelectionRequest, AmdlTaskProgress } from '@shared/types/amdl'

class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  stdin = {
    writable: true,
    write: vi.fn().mockReturnValue(true),
  }
  killed = false

  kill(): boolean {
    this.killed = true
    return true
  }
}

describe('AMDL Backend Core', () => {
  describe('1. Apple Music URL semantic validation', () => {
    it('accepts valid Apple Music URLs', () => {
      const result = validateAppleMusicUrl(
        'https://music.apple.com/us/album/tunnel-vision/123456?i=789',
      )
      expect(result.valid).toBe(true)
      expect(result.normalizedUrl).toBe(
        'https://music.apple.com/us/album/tunnel-vision/123456?i=789',
      )
      expect(result.error).toBeUndefined()
    })

    it('rejects non music.apple.com URLs', () => {
      const result = validateAppleMusicUrl('https://example.com/song')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('hostname must be music.apple.com')
    })

    it('rejects non-HTTPS URLs', () => {
      const result = validateAppleMusicUrl('http://music.apple.com/us/album/foo/123')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('https protocol')
    })

    it('rejects invalid or malformed URL strings', () => {
      expect(validateAppleMusicUrl('').valid).toBe(false)
      expect(validateAppleMusicUrl('not-a-url').valid).toBe(false)
    })
  })

  describe('2. amdlOutputParser', () => {
    it('parses Downloaded signal', () => {
      const parsed = parseAmdlOutputLine('Downloaded')
      expect(parsed.stage).toBe('processing')
      expect(parsed.message).toBe('Downloaded')
    })

    it('parses Decrypted signal', () => {
      const parsed = parseAmdlOutputLine('Decrypted')
      expect(parsed.stage).toBe('finalizing')
      expect(parsed.message).toBe('Decrypted')
    })

    it('parses Track already exists locally signal', () => {
      const parsed = parseAmdlOutputLine('Track already exists locally.')
      expect(parsed.alreadyExists).toBe(true)
      expect(parsed.message).toBe('Track already exists locally.')
    })

    it('parses Queue signal as preparing even when containing Song->', () => {
      expect(parseAmdlOutputLine('Queue 1 of 1: Song->Gareth.T').stage).toBe('preparing')
      expect(parseAmdlOutputLine('Queue 1 of 1').stage).toBe('preparing')
    })

    it('parses Track and non-Queue Song signals as downloading', () => {
      expect(parseAmdlOutputLine('Track 1 of 1: songs').stage).toBe('downloading')
      expect(parseAmdlOutputLine('Song->Gareth.T').stage).toBe('downloading')
    })

    it('parses completion summary with Completed, Warnings, and Errors', () => {
      const parsed = parseAmdlOutputLine(
        '=======  [✔ ] Completed: 1/1  |  [⚠ ] Warnings: 0  |  [✖ ] Errors: 0  =======',
      )
      expect(parsed.completionSummary).toEqual({
        completed: 1,
        total: 1,
        warnings: 0,
        errors: 0,
      })
    })

    it('parses completion summary with 0/0 and non-zero warnings/errors', () => {
      const parsed = parseAmdlOutputLine(
        '=======  [✔ ] Completed: 0/0  |  [⚠ ] Warnings: 2  |  [✖ ] Errors: 1  =======',
      )
      expect(parsed.completionSummary).toEqual({
        completed: 0,
        total: 0,
        warnings: 2,
        errors: 1,
      })
    })

    it('ignores unknown or noisy lines without failing', () => {
      const parsed = parseAmdlOutputLine('Just some arbitrary log line')
      expect(parsed.stage).toBeUndefined()
      expect(parsed.alreadyExists).toBeUndefined()
      expect(parsed.completionSummary).toBeUndefined()
    })
  })

  describe('3. Line buffering across chunks', () => {
    it('handles multiple chunks splitting across lines', () => {
      const buffer = new LineBuffer()
      expect(buffer.push('Downloa')).toEqual([])
      expect(buffer.push('ded\nDecr')).toEqual(['Downloaded'])
      expect(buffer.push('ypted\n')).toEqual(['Decrypted'])
      expect(buffer.flush()).toEqual([])
    })

    it('handles remaining text on flush', () => {
      const buffer = new LineBuffer()
      expect(buffer.push('some leftover without newline')).toEqual([])
      expect(buffer.flush()).toEqual(['some leftover without newline'])
    })

    it('handles carriage return newlines', () => {
      const buffer = new LineBuffer()
      expect(buffer.push('line1\r\nline2\r\n')).toEqual(['line1', 'line2'])
    })
  })

  describe('4. Spawn argument structure and security', () => {
    it('constructs wsl args with positional parameter $1 and avoids URL shell interpolation', () => {
      const url = 'https://music.apple.com/test;rm -rf /'
      const args = buildWslAmdlArgs(url, DEFAULT_AMDL_CONFIG)
      expect(args).toEqual([
        '-d',
        'u22-amdl',
        '-u',
        'root',
        '-e',
        'bash',
        '-lic',
        'cd "/mnt/e/AMDL-WSL2 (ALL IN ONE)/AMDL-WSL/apple-music-downloader" && go run main.go --aac "$1"',
        'auralis-amdl',
        url,
      ])
      // Ensure the URL is passed as the final argument (positional $1 to bash) and not injected into script string
      expect(args[7]).not.toContain(url)
      expect(args[9]).toBe(url)
    })

    it('defaults to direct mode: contains --aac and does not contain --select', () => {
      const url = 'https://music.apple.com/us/album/test/123'
      const args = buildWslAmdlArgs(url, DEFAULT_AMDL_CONFIG)
      const bashScript = args[7]
      expect(bashScript).toContain('--aac')
      expect(bashScript).not.toContain('--select')
      expect(bashScript).not.toContain(url)
      expect(args[args.length - 1]).toBe(url)
    })

    it('direct mode: explicitly passed, contains --aac and does not contain --select', () => {
      const url = 'https://music.apple.com/us/album/test/123'
      const args = buildWslAmdlArgs(url, DEFAULT_AMDL_CONFIG, 'direct')
      const bashScript = args[7]
      expect(bashScript).toContain('--aac')
      expect(bashScript).not.toContain('--select')
      expect(bashScript).not.toContain(url)
      expect(args[args.length - 1]).toBe(url)
    })

    it('select mode: contains both --aac and --select in bash script', () => {
      const url = 'https://music.apple.com/us/album/test/123'
      const args = buildWslAmdlArgs(url, DEFAULT_AMDL_CONFIG, 'select')
      const bashScript = args[7]
      expect(bashScript).toContain('--aac --select')
      expect(bashScript).not.toContain(url)
      expect(args[args.length - 1]).toBe(url)
      expect(args).toEqual([
        '-d',
        'u22-amdl',
        '-u',
        'root',
        '-e',
        'bash',
        '-lic',
        'cd "/mnt/e/AMDL-WSL2 (ALL IN ONE)/AMDL-WSL/apple-music-downloader" && go run main.go --aac --select "$1"',
        'auralis-amdl',
        url,
      ])
    })

    it('runner passes mode to spawn command args', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)
      const url = 'https://music.apple.com/us/album/test/123'

      const runner = new AmdlCommandRunner({
        taskId: 'task-select',
        url,
        mode: 'select',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })
      runner.start()

      expect(spawnMock).toHaveBeenCalledTimes(1)
      const spawnedArgs = spawnMock.mock.calls[0][1] as string[]
      expect(spawnedArgs[7]).toContain('--aac --select')
      expect(spawnedArgs[spawnedArgs.length - 1]).toBe(url)
    })
  })

  describe('5. Process lifecycle and terminal settlements', () => {
    it('exit 0 + valid completion summary -> completed', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)
      const progressList: AmdlTaskProgress[] = []

      const runner = new AmdlCommandRunner({
        taskId: 'task-1',
        url: 'https://music.apple.com/song',
        spawnProcess: spawnMock,
        onProgress: (p) => progressList.push(p),
      })

      runner.start()
      mockChild.stdout.emit('data', 'Downloaded\n')
      mockChild.stdout.emit(
        'data',
        '=======  [✔ ] Completed: 1/1  |  [⚠ ] Warnings: 0  |  [✖ ] Errors: 0  =======\n',
      )
      mockChild.emit('close', 0)

      const finalProgress = runner.getProgress()
      expect(finalProgress.state).toBe('completed')
      expect(finalProgress.alreadyExists).toBe(false)
      expect(finalProgress.finishedAt).not.toBeNull()
    })

    it('exit 0 + alreadyExists + valid completion summary -> already-exists', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-2',
        url: 'https://music.apple.com/song',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      mockChild.stdout.emit('data', 'Track already exists locally.\n')
      mockChild.stdout.emit(
        'data',
        '=======  [✔ ] Completed: 1/1  |  [⚠ ] Warnings: 0  |  [✖ ] Errors: 0  =======\n',
      )
      mockChild.emit('close', 0)

      const finalProgress = runner.getProgress()
      expect(finalProgress.state).toBe('already-exists')
      expect(finalProgress.alreadyExists).toBe(true)
    })

    it('exit 0 + without summary -> failed', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-no-sum',
        url: 'https://music.apple.com/song',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      mockChild.stdout.emit('data', 'Downloaded\n')
      mockChild.emit('close', 0)

      const finalProgress = runner.getProgress()
      expect(finalProgress.state).toBe('failed')
      expect(finalProgress.error).toContain('without a completion summary')
    })

    it('exit 0 + summary 0/0 -> failed', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-0-0',
        url: 'https://music.apple.com/song',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      mockChild.stdout.emit('data', 'Queue 1 of 1: Invalid type\n')
      mockChild.stdout.emit(
        'data',
        '=======  [✔ ] Completed: 0/0  |  [⚠ ] Warnings: 0  |  [✖ ] Errors: 0  =======\n',
      )
      mockChild.emit('close', 0)

      const finalProgress = runner.getProgress()
      expect(finalProgress.state).toBe('failed')
      expect(finalProgress.error).toContain('without a successful download')
    })

    it('exit 0 + summary errors > 0 -> failed', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-err-sum',
        url: 'https://music.apple.com/song',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      mockChild.stdout.emit(
        'data',
        '=======  [✔ ] Completed: 1/1  |  [⚠ ] Warnings: 0  |  [✖ ] Errors: 1  =======\n',
      )
      mockChild.emit('close', 0)

      const finalProgress = runner.getProgress()
      expect(finalProgress.state).toBe('failed')
      expect(finalProgress.error).toContain('reported errors in its completion summary')
    })

    it('exit 0 + completed < total -> failed', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-partial',
        url: 'https://music.apple.com/song',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      mockChild.stdout.emit(
        'data',
        '=======  [✔ ] Completed: 1/2  |  [⚠ ] Warnings: 0  |  [✖ ] Errors: 0  =======\n',
      )
      mockChild.emit('close', 0)

      const finalProgress = runner.getProgress()
      expect(finalProgress.state).toBe('failed')
      expect(finalProgress.error).toContain('did not complete all tracks')
    })

    it('non-zero exit -> failed even if summary looked successful', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-nonzero-sum',
        url: 'https://music.apple.com/song',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      mockChild.stdout.emit(
        'data',
        '=======  [✔ ] Completed: 1/1  |  [⚠ ] Warnings: 0  |  [✖ ] Errors: 0  =======\n',
      )
      mockChild.emit('close', 1)

      const finalProgress = runner.getProgress()
      expect(finalProgress.state).toBe('failed')
      expect(finalProgress.error).toContain('Process exited with code 1')
    })

    it('non-zero exit -> failed', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-3',
        url: 'https://music.apple.com/song',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      mockChild.stderr.emit('data', 'Fatal network error\n')
      mockChild.emit('close', 1)

      const finalProgress = runner.getProgress()
      expect(finalProgress.state).toBe('failed')
      expect(finalProgress.error).toContain('Fatal network error')
    })

    it('cancel + later non-zero exit -> cancelled', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-4',
        url: 'https://music.apple.com/song',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      const cancelOk = runner.cancel()
      expect(cancelOk).toBe(true)
      expect(mockChild.killed).toBe(true)

      // Later, process exits with code 1 or killed signal
      mockChild.emit('close', 137)

      const finalProgress = runner.getProgress()
      expect(finalProgress.state).toBe('cancelled')
    })

    it('cancel + child error event + close event -> cancelled', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-4b',
        url: 'https://music.apple.com/song',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      runner.cancel()
      expect(mockChild.killed).toBe(true)

      // Emit child process error
      mockChild.emit('error', new Error('Process killed abnormally'))

      // Then process closes with non-zero
      mockChild.emit('close', 1)

      const finalProgress = runner.getProgress()
      expect(finalProgress.state).toBe('cancelled')
    })

    it('cancel takes precedence over successful summary and exit 0', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-cancel-summary',
        url: 'https://music.apple.com/song',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      mockChild.stdout.emit(
        'data',
        '=======  [✔ ] Completed: 1/1  |  [⚠ ] Warnings: 0  |  [✖ ] Errors: 0  =======\n',
      )
      runner.cancel()
      mockChild.emit('close', 0)

      const finalProgress = runner.getProgress()
      expect(finalProgress.state).toBe('cancelled')
    })

    it('terminal state cannot be overwritten by subsequent close or error events', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-5',
        url: 'https://music.apple.com/song',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      mockChild.stdout.emit(
        'data',
        '=======  [✔ ] Completed: 1/1  |  [⚠ ] Warnings: 0  |  [✖ ] Errors: 0  =======\n',
      )
      mockChild.emit('close', 0)
      expect(runner.getProgress().state).toBe('completed')

      // Emit error after completion
      mockChild.emit('error', new Error('Late error'))
      expect(runner.getProgress().state).toBe('completed')

      // Emit another close
      mockChild.emit('close', 1)
      expect(runner.getProgress().state).toBe('completed')
    })
  })

  describe('6. AmdlDownloadService concurrency and single active task guard', () => {
    it('guards against concurrent active downloads', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const service = new AmdlDownloadService({ spawnProcess: spawnMock })
      const res1 = service.startDownload('https://music.apple.com/song1')
      expect(res1.ok).toBe(true)
      expect(service.isDownloadActive()).toBe(true)

      const res2 = service.startDownload('https://music.apple.com/song2')
      expect(res2.ok).toBe(false)
      expect(res2.error).toContain('Another download task is currently active')

      // Finish task 1
      mockChild.emit('close', 0)
      expect(service.isDownloadActive()).toBe(false)

      // Now task 2 can start
      const res3 = service.startDownload('https://music.apple.com/song2')
      expect(res3.ok).toBe(true)
    })

    it('cancels active download via service', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const service = new AmdlDownloadService({ spawnProcess: spawnMock })
      const res = service.startDownload('https://music.apple.com/song1')
      expect(res.ok).toBe(true)
      const taskId = res.taskId!

      const cancelRes = service.cancelDownload(taskId)
      expect(cancelRes.ok).toBe(true)
      expect(mockChild.killed).toBe(true)
    })
  })

  describe('7. Raw log forwarding', () => {
    it('forwards complete buffered stdout and stderr lines via onLog', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)
      const logs: Array<{ stream: 'stdout' | 'stderr'; line: string }> = []

      const runner = new AmdlCommandRunner({
        taskId: 'task-log-1',
        url: 'https://music.apple.com/song',
        spawnProcess: spawnMock,
        onProgress: () => {},
        onLog: (event) => logs.push({ stream: event.stream, line: event.line }),
      })

      runner.start()

      // Chunked stdout: "Downloa" + "ded\n"
      mockChild.stdout.emit('data', 'Downloa')
      expect(logs).toHaveLength(0)

      mockChild.stdout.emit('data', 'ded\n')
      expect(logs).toEqual([{ stream: 'stdout', line: 'Downloaded' }])

      // stderr line
      mockChild.stderr.emit('data', 'Some diagnostic stderr line\n')
      expect(logs).toEqual([
        { stream: 'stdout', line: 'Downloaded' },
        { stream: 'stderr', line: 'Some diagnostic stderr line' },
      ])

      // Residual flush on close
      mockChild.stdout.emit('data', 'Residual line without newline')
      mockChild.emit('close', 0)
      expect(logs).toEqual([
        { stream: 'stdout', line: 'Downloaded' },
        { stream: 'stderr', line: 'Some diagnostic stderr line' },
        { stream: 'stdout', line: 'Residual line without newline' },
      ])
    })
  })

  describe('8. Runner interactive track selection (Phase 1C)', () => {
    const SAMPLE_TABLE = [
      'Queue 1 of 1: Album',
      'Storefront: cn',
      '+--------------+--------------------------------------------------------+-------------------+-------+',
      '| TRACK NUMBER |                       TRACK NAME                       | EXPLICIT/CLEAN/NO | TYPE  |',
      '+--------------+--------------------------------------------------------+-------------------+-------+',
      '| 1            | Track One                                              | None              | SONG  |',
      '| 2            | Track Two                                              | None              | SONG  |',
      '| 12           | Track Twelve                                           | None              | SONG  |',
      '| 14           | 03. Drums, Percussion & Horn                           | None              | SONG  |',
      '|              | Solo (Live)                                            |                   |       |',
      '| 27           | Track Twenty Seven                                     | None              | SONG  |',
      '| 32           | 04. Medley (友情歌 2014-1985)                          | None              | SONG  |',
      '|              | [Live]                                                 |                   |       |',
      '| 33           | Track Thirty Three                                     | None              | SONG  |',
      '+--------------+--------------------------------------------------------+-------------------+-------+',
    ]

    it('1. select mode + song URL without handshake -> does not enter selecting stage', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)
      const progressList: AmdlTaskProgress[] = []

      const runner = new AmdlCommandRunner({
        taskId: 'task-no-handshake',
        url: 'https://music.apple.com/song',
        mode: 'select',
        spawnProcess: spawnMock,
        onProgress: (p) => progressList.push(p),
      })

      runner.start()
      mockChild.stdout.emit('data', 'Queue 1 of 1: Song\n')
      mockChild.stdout.emit('data', 'Track 1 of 1: Song Title\n')

      expect(runner.getProgress().stage).toBe('downloading')
      expect(progressList.some((p) => p.stage === 'selecting')).toBe(false)
    })

    it('2 & 3. album handshake -> stage selecting, emits SelectionRequest with tracks', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)
      const requests: AmdlSelectionRequest[] = []

      const runner = new AmdlCommandRunner({
        taskId: 'task-select-handshake',
        url: 'https://music.apple.com/album',
        mode: 'select',
        spawnProcess: spawnMock,
        onProgress: () => {},
        onSelectionRequest: (req) => requests.push(req),
      })

      runner.start()
      for (const line of SAMPLE_TABLE) {
        mockChild.stdout.emit('data', line + '\n')
      }
      expect(runner.getProgress().stage).not.toBe('selecting')
      expect(requests).toHaveLength(0)

      // Emit handshake
      mockChild.stdout.emit('data', 'Please select from the track options above\n')

      expect(runner.getProgress().state).toBe('running')
      expect(runner.getProgress().stage).toBe('selecting')
      expect(requests).toHaveLength(1)
      expect(requests[0].taskId).toBe('task-select-handshake')
      expect(requests[0].tracks).toHaveLength(7) // 1, 2, 12, 14, 27, 32, 33
      expect(requests[0].tracks[3]).toEqual({
        index: 14,
        title: '03. Drums, Percussion & Horn Solo (Live)',
        type: 'SONG',
      })
    })

    it('4 & 5. submit [12, 27] writes 12,27\\n to stdin and deduplicates [12, 12, 27]', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-submit',
        url: 'https://music.apple.com/album',
        mode: 'select',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      for (const line of SAMPLE_TABLE) {
        mockChild.stdout.emit('data', line + '\n')
      }
      mockChild.stdout.emit('data', 'Please select from the track options above\n')

      const res = runner.submitSelection([12, 12, 27])
      expect(res.ok).toBe(true)
      expect(mockChild.stdin.write).toHaveBeenCalledWith('12,27\n')
    })

    it('6. empty array rejected', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-submit-empty',
        url: 'https://music.apple.com/album',
        mode: 'select',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      for (const line of SAMPLE_TABLE) {
        mockChild.stdout.emit('data', line + '\n')
      }
      mockChild.stdout.emit('data', 'Please select from the track options above\n')

      const res = runner.submitSelection([])
      expect(res.ok).toBe(false)
      expect(res.error).toContain('cannot be empty')
      expect(mockChild.stdin.write).not.toHaveBeenCalled()
    })

    it('7. non-existent track index 999 rejected', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-submit-999',
        url: 'https://music.apple.com/album',
        mode: 'select',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      for (const line of SAMPLE_TABLE) {
        mockChild.stdout.emit('data', line + '\n')
      }
      mockChild.stdout.emit('data', 'Please select from the track options above\n')

      const res = runner.submitSelection([12, 999])
      expect(res.ok).toBe(false)
      expect(res.error).toContain('Track index not found')
      expect(mockChild.stdin.write).not.toHaveBeenCalled()
    })

    it('8. submit before selecting rejected', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-submit-early',
        url: 'https://music.apple.com/album',
        mode: 'select',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      // Still in launching/preparing stage, no handshake yet
      const res = runner.submitSelection([1])
      expect(res.ok).toBe(false)
      expect(res.error).toContain('not waiting for track selection')
    })

    it('9. second submit rejected', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-submit-twice',
        url: 'https://music.apple.com/album',
        mode: 'select',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      for (const line of SAMPLE_TABLE) {
        mockChild.stdout.emit('data', line + '\n')
      }
      mockChild.stdout.emit('data', 'Please select from the track options above\n')

      const firstRes = runner.submitSelection([12])
      expect(firstRes.ok).toBe(true)

      const secondRes = runner.submitSelection([27])
      expect(secondRes.ok).toBe(false)
      expect(secondRes.error).toContain('not waiting for track selection')
    })

    it('10. submit after terminal rejected', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-submit-term',
        url: 'https://music.apple.com/album',
        mode: 'select',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      mockChild.emit('close', 1)

      const res = runner.submitSelection([1])
      expect(res.ok).toBe(false)
      expect(res.error).toContain('settled')
    })

    it('11. selecting -> cancel -> cancelled and subsequent submit rejected', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-select-cancel',
        url: 'https://music.apple.com/album',
        mode: 'select',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      for (const line of SAMPLE_TABLE) {
        mockChild.stdout.emit('data', line + '\n')
      }
      mockChild.stdout.emit('data', 'Please select from the track options above\n')
      expect(runner.getProgress().stage).toBe('selecting')

      const cancelOk = runner.cancel()
      expect(cancelOk).toBe(true)
      expect(mockChild.killed).toBe(true)

      mockChild.emit('close', 137)
      expect(runner.getProgress().state).toBe('cancelled')

      const submitRes = runner.submitSelection([12])
      expect(submitRes.ok).toBe(false)
      expect(submitRes.error).toContain('settled')
    })

    it('12 & 13. does not fake downloading stage immediately upon submit; enters downloading only on Track line', () => {
      const mockChild = new MockChildProcess()
      const spawnMock = vi.fn().mockReturnValue(mockChild as unknown as ChildProcess)

      const runner = new AmdlCommandRunner({
        taskId: 'task-stage-transition',
        url: 'https://music.apple.com/album',
        mode: 'select',
        spawnProcess: spawnMock,
        onProgress: () => {},
      })

      runner.start()
      for (const line of SAMPLE_TABLE) {
        mockChild.stdout.emit('data', line + '\n')
      }
      mockChild.stdout.emit('data', 'Please select from the track options above\n')

      runner.submitSelection([12])
      // Stage remains whatever it was (selecting) and is not artificially forced to downloading
      expect(runner.getProgress().stage).toBe('selecting')

      // Now AMDL outputs subsequent preparing / track download line
      mockChild.stdout.emit('data', 'Track 12 of 33: Track Twelve\n')
      expect(runner.getProgress().stage).toBe('downloading')
    })
  })
})
