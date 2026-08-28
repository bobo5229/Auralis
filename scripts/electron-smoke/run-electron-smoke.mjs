import { spawn, spawnSync } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import electronPath from 'electron'

const RESULT_PREFIX = 'AURALIS_SMOKE_RESULT '
const PROCESS_TIMEOUT_MS = 50_000
const MAX_CAPTURE_CHARS = 250_000
const workspaceRoot = resolve(import.meta.dirname, '..', '..')

function appendTail(current, next) {
  const combined = current + next
  return combined.length > MAX_CAPTURE_CHARS ? combined.slice(-MAX_CAPTURE_CHARS) : combined
}

function terminateProcessTree(child) {
  if (!child.pid || child.exitCode !== null) return

  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return
  }

  child.kill('SIGKILL')
}

async function removeSmokeProfile(profilePath) {
  const resolvedTemp = resolve(tmpdir())
  const resolvedProfile = resolve(profilePath)
  const expectedPrefix = `${resolvedTemp}${process.platform === 'win32' ? '\\' : '/'}`
  if (
    !resolvedProfile.startsWith(expectedPrefix) ||
    !basename(resolvedProfile).startsWith('auralis-electron-smoke-')
  ) {
    throw new Error(`Refusing to remove unexpected smoke profile: ${resolvedProfile}`)
  }
  await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

async function assertBuildOutputs() {
  const requiredOutputs = [
    'out/main/index.js',
    'out/preload/index.cjs',
    'out/preload/desktopLyrics.cjs',
    'out/renderer/index.html',
  ]
  await Promise.all(requiredOutputs.map((path) => access(join(workspaceRoot, path))))
}

async function main() {
  await assertBuildOutputs()
  const profilePath = await mkdtemp(join(tmpdir(), 'auralis-electron-smoke-'))
  let stdout = ''
  let stderr = ''
  let timedOut = false

  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.ELECTRON_RENDERER_URL
  environment.AURALIS_SMOKE_TEST = '1'
  environment.AURALIS_SMOKE_USER_DATA = profilePath
  environment.AURALIS_QUIET_GPU_LOGS = '1'

  const child = spawn(electronPath, ['.'], {
    cwd: workspaceRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout = appendTail(stdout, chunk)
    process.stdout.write(chunk)
  })
  child.stderr.on('data', (chunk) => {
    stderr = appendTail(stderr, chunk)
    process.stderr.write(chunk)
  })

  let exitCode
  let processTimeout
  try {
    const processClosed = new Promise((resolveExit, reject) => {
      child.once('error', reject)
      child.once('close', (code) => resolveExit(code))
    })
    const processTimedOut = new Promise((_resolve, reject) => {
      processTimeout = setTimeout(() => {
        timedOut = true
        terminateProcessTree(child)
        reject(new Error(`Electron smoke process exceeded ${PROCESS_TIMEOUT_MS}ms`))
      }, PROCESS_TIMEOUT_MS)
    })
    exitCode = await Promise.race([processClosed, processTimedOut])
  } finally {
    clearTimeout(processTimeout)
    terminateProcessTree(child)
    if (timedOut) {
      child.stdout.destroy()
      child.stderr.destroy()
      child.unref()
    }
    await removeSmokeProfile(profilePath)
  }

  const resultLine = stdout.split(/\r?\n/u).findLast((line) => line.startsWith(RESULT_PREFIX))
  if (!resultLine) {
    throw new Error(
      `Electron smoke process emitted no result (exit ${String(exitCode)}).\n${stderr.slice(-4000)}`,
    )
  }

  const result = JSON.parse(resultLine.slice(RESULT_PREFIX.length))
  if (exitCode !== 0 || !result.ok) {
    throw new Error(
      `Electron smoke failed (exit ${String(exitCode)}): ${JSON.stringify(result, null, 2)}`,
    )
  }

  process.stdout.write(`Electron smoke passed: ${result.checks.length} checks\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exitCode = 1
})
