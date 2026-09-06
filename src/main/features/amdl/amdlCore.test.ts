import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { validateAppleMusicUrl } from './amdlUrlValidator'
import { parseAmdlOutputLine } from './amdlOutputParser'
import { LineBuffer } from './lineBuffer'
import { AmdlCommandRunner, buildWslAmdlArgs, DEFAULT_AMDL_CONFIG } from './amdlCommandRunner'
import { AmdlDownloadService } from './amdlDownloadService'
import type { AmdlTaskProgress } from '@shared/types/amdl'

class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
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

    it('ignores unknown or noisy lines without failing', () => {
      const parsed = parseAmdlOutputLine(
        '=======  [✔ ] Completed: 1/1  |  [⚠ ] Warnings: 0  =======',
      )
      expect(parsed.stage).toBeUndefined()
      expect(parsed.alreadyExists).toBeUndefined()
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
        '--',
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
  })

  describe('5. Process lifecycle and terminal settlements', () => {
    it('exit 0 -> completed', () => {
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
      mockChild.emit('close', 0)

      const finalProgress = runner.getProgress()
      expect(finalProgress.state).toBe('completed')
      expect(finalProgress.alreadyExists).toBe(false)
      expect(finalProgress.finishedAt).not.toBeNull()
    })

    it('exit 0 + alreadyExists -> already-exists', () => {
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
      mockChild.emit('close', 0)

      const finalProgress = runner.getProgress()
      expect(finalProgress.state).toBe('already-exists')
      expect(finalProgress.alreadyExists).toBe(true)
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
})
