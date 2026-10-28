import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

/** Standalone experiment: no Electron, database, or application player state. */
export async function openMpv(executable, args = []) {
  const pipe = `\\\\.\\pipe\\auralis-probe-${randomUUID()}`
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
      `--input-ipc-server=${pipe}`,
      ...args,
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const diagnostics = []
  child.stdout.on('data', (chunk) => diagnostics.push(chunk.toString('utf8')))
  child.stderr.on('data', (chunk) => diagnostics.push(chunk.toString('utf8')))
  let spawnError
  child.on('error', (error) => {
    spawnError = error
  })
  let socket
  try {
    const deadline = Date.now() + 10000
    while (!socket) {
      if (spawnError) throw spawnError
      if (child.exitCode !== null) throw new Error(`mpv exited: ${diagnostics.join('')}`)
      try {
        socket = await new Promise((resolve, reject) => {
          const candidate = connect(pipe)
          candidate.once('connect', () => {
            candidate.removeListener('error', reject)
            resolve(candidate)
          })
          candidate.once('error', (error) => {
            candidate.destroy()
            reject(error)
          })
        })
      } catch (error) {
        if (Date.now() >= deadline) throw error
        await delay(50)
      }
    }
  } catch (error) {
    child.kill()
    throw error
  }
  const pending = new Map()
  const events = []
  let id = 0,
    buffer = ''
  function rejectPending(error) {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
  }
  socket.setEncoding('utf8')
  socket.on('error', rejectPending)
  socket.on('close', () => rejectPending(new Error('mpv IPC closed')))
  socket.on('data', (chunk) => {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (!line.trim()) continue
      let message
      try {
        message = JSON.parse(line)
      } catch (error) {
        rejectPending(error)
        socket.destroy()
        return
      }
      if (message.event) events.push({ ...message, receivedAt: performance.now() })
      const entry = pending.get(message.request_id)
      if (entry) {
        clearTimeout(entry.timer)
        pending.delete(message.request_id)
        if (message.error !== 'success')
          entry.reject(new Error(`${entry.command}: ${message.error}`))
        else entry.resolve(message.data)
      }
    }
  })
  function command(...command) {
    return new Promise((resolve, reject) => {
      const request_id = ++id
      const timer = setTimeout(() => {
        pending.delete(request_id)
        reject(new Error(`IPC timeout: ${command[0]}`))
      }, 5000)
      pending.set(request_id, { resolve, reject, timer, command: command[0] })
      socket.write(JSON.stringify({ command, request_id }) + '\n')
    })
  }
  return {
    command,
    events,
    diagnostics,
    async waitForEvent(name, after = 0, timeout = 10000) {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        const event = events.slice(after).find((event) => event.event === name)
        if (event) return event
        if (socket.destroyed) throw new Error('IPC closed while waiting for event')
        await delay(20)
      }
      throw new Error(`Event timeout: ${name}`)
    },
    async close() {
      if (!socket.destroyed) socket.write(JSON.stringify({ command: ['quit'] }) + '\n')
      for (let attempt = 0; attempt < 40 && child.exitCode === null; attempt++) await delay(25)
      if (child.exitCode === null) child.kill()
      socket.destroy()
      rejectPending(new Error('Probe closed'))
    },
  }
}
