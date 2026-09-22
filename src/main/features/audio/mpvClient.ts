import { spawn } from 'node:child_process'
import { connect, type Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

export interface MpvMessage {
  event?: string
  name?: string
  data?: unknown
  reason?: string
  error?: string
  request_id?: number
}

/** Private main-process transport. Never exposed through preload. */
export async function openMpvClient(
  executable: string,
  onEvent: (event: MpvMessage) => void,
  onFailure: (error: Error) => void,
  signal: AbortSignal,
  extraArgs: string[] = [],
) {
  const pipe = `\\\\.\\pipe\\auralis-audio-${randomUUID()}`
  const child = spawn(
    executable,
    [
      '--no-config',
      '--load-scripts=no',
      '--terminal=no',
      '--video=no',
      '--audio-display=no',
      '--idle=yes',
      '--keep-open=no',
      '--gapless-audio=yes',
      '--replaygain=no',
      '--volume=0',
      '--input-default-bindings=no',
      '--input-vo-keyboard=no',
      `--input-ipc-server=${pipe}`,
      ...extraArgs,
    ],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
  )
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString('utf8')).slice(-4096)
  })
  let spawnError: Error | undefined
  child.on('error', (error) => {
    spawnError = error
  })
  let socket: Socket | undefined
  let closed = false
  let ready = false
  const pending = new Map<
    number,
    {
      resolve: (data: unknown) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  function close() {
    if (closed) return
    closed = true
    signal.removeEventListener('abort', close)
    socket?.destroy()
    child.kill()
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.reject(new Error('mpv closed'))
    }
    pending.clear()
  }
  function fail(error: Error) {
    if (closed) return
    close()
    if (ready) onFailure(error)
  }
  signal.addEventListener('abort', close, { once: true })
  child.on('exit', (code) => fail(new Error(`mpv exited (${code}): ${stderr}`)))
  try {
    const deadline = Date.now() + 8000
    while (!socket) {
      if (signal.aborted || closed) throw new Error('mpv startup cancelled')
      if (spawnError) throw spawnError
      if (child.exitCode !== null) throw new Error(`mpv failed to start: ${stderr}`)
      try {
        socket = await new Promise<Socket>((resolve, reject) => {
          const candidate = connect(pipe)
          candidate.once('connect', () => {
            candidate.removeAllListeners('error')
            resolve(candidate)
          })
          candidate.once('error', (error) => {
            candidate.destroy()
            reject(error)
          })
        })
      } catch (error) {
        if (Date.now() >= deadline) throw error
        await delay(40)
      }
    }
    if (closed || signal.aborted) {
      socket.destroy()
      throw new Error('mpv startup cancelled')
    }
  } catch (error) {
    close()
    throw error
  }
  ready = true
  socket.setEncoding('utf8')
  socket.on('error', fail)
  socket.on('close', () => fail(new Error('mpv IPC disconnected')))
  let buffer = ''
  socket.on('data', (chunk: string) => {
    buffer += chunk
    if (buffer.length > 1_048_576) {
      fail(new Error('mpv IPC response too large'))
      return
    }
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (!line.trim()) continue
      let message: MpvMessage
      try {
        message = JSON.parse(line) as MpvMessage
      } catch {
        fail(new Error('Invalid mpv IPC response'))
        return
      }
      const item = message.request_id === undefined ? undefined : pending.get(message.request_id)
      if (item) {
        pending.delete(message.request_id!)
        clearTimeout(item.timer)
        if (message.error === 'success') item.resolve(message.data)
        else item.reject(new Error(`mpv: ${message.error}`))
      }
      if (message.event) onEvent(message)
    }
  })
  let requestId = 0
  function command(...command: unknown[]): Promise<unknown> {
    if (closed) return Promise.reject(new Error('mpv closed'))
    return new Promise((resolve, reject) => {
      const request_id = ++requestId
      const timer = setTimeout(() => {
        pending.delete(request_id)
        reject(new Error(`mpv command timed out: ${command[0]}`))
      }, 5000)
      pending.set(request_id, { resolve, reject, timer })
      socket!.write(JSON.stringify({ command, request_id }) + '\n')
    })
  }
  return { command, close }
}

export type MpvClient = Awaited<ReturnType<typeof openMpvClient>>
