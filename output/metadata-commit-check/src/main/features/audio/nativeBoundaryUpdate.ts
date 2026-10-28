import type { MpvClient } from './mpvClient'
import type { DigitalBoundary } from './digitalSilence'
import type { SoftTransition } from './softTransition'
import { softTransitionContinuationOptions } from './softTransitionContinuation'

const BOUNDARY_UPDATE_MARGIN_SECONDS = 2

type BoundaryUpdateStatus = 'applied' | 'too-late' | 'cancelled'

interface InterruptedTransition {
  readonly bridge: string
  readonly original: string
}

interface BoundaryUpdateOperation {
  readonly installation: InterruptedTransition | null
}

interface BoundaryUpdateDependencies {
  enqueue<T>(work: () => Promise<T>): Promise<T>
  isCurrent(session: number, client: MpvClient): boolean
  read(): {
    readonly loaded: boolean
    readonly duration: number
    readonly decodeOffset: number
    readonly enteringNext: boolean
    readonly hasTransition: boolean
  }
  // Publish before setting end: start-file may arrive before that command replies.
  // Withdrawal only clears this publication; file ownership stays with the caller.
  publishTransition(plan: SoftTransition, continuationPath: string): () => void
}

/** Owns in-flight playlist mutations and their compensation, never audio files or leases. */
export class NativeBoundaryUpdater {
  private operation: BoundaryUpdateOperation | null = null
  private interruptedTransition: InterruptedTransition | null = null

  constructor(private readonly dependencies: BoundaryUpdateDependencies) {}

  get isUpdating(): boolean {
    return this.operation !== null
  }

  get isInstalling(): boolean {
    return this.operation?.installation != null
  }

  get hasInterruptedLoad(): boolean {
    return this.interruptedTransition !== null
  }

  reset(): void {
    this.interruptedTransition = null
    // The shared queue still owns an outstanding command. Only its operation's
    // finally may mark it idle, even when the playback session has been reset.
  }

  private beginUpdate(installation: InterruptedTransition | null = null): BoundaryUpdateOperation {
    const operation = { installation }
    this.operation = operation
    return operation
  }

  private finishUpdate(operation: BoundaryUpdateOperation): void {
    if (this.operation === operation) this.operation = null
  }

  /** Called after the scheduler records enteringNext and aborts its scan. */
  onStartFile(session: number, client: MpvClient): Promise<void> | null {
    if (this.operation?.installation && !this.dependencies.read().hasTransition)
      this.interruptedTransition = this.operation.installation
    if (!this.isUpdating || this.dependencies.read().hasTransition) return null
    return this.dependencies.enqueue(async () => {
      // The refinement request is now stale, but the current decoder still needs
      // compensation. Validate the playback session, not the aborted request.
      if (this.dependencies.isCurrent(session, client)) {
        await client.command('playlist-clear')
        if (this.dependencies.isCurrent(session, client))
          await client.command('set_property', 'file-local-options/end', 'none')
      }
    })
  }

  async recoverInterruptedLoad(session: number, client: MpvClient): Promise<boolean> {
    const interrupted = this.interruptedTransition
    if (!interrupted) return false
    const actualPath = await client.command('get_property', 'path')
    if (!this.dependencies.isCurrent(session, client)) return true
    if (this.interruptedTransition === interrupted) this.interruptedTransition = null
    if (actualPath !== interrupted.bridge) return false
    await client.command('loadfile', interrupted.original, 'replace', -1, {})
    return true
  }

  updateBoundary(
    client: MpvClient,
    nextPath: string,
    boundary: DigitalBoundary,
    isCurrent: () => boolean,
  ): Promise<BoundaryUpdateStatus> {
    return this.dependencies.enqueue(() =>
      this.applyBoundary(client, nextPath, boundary, isCurrent),
    )
  }

  installSoftTransition(
    client: MpvClient,
    nextPath: string,
    prepared: SoftTransition,
    isCurrent: () => boolean,
  ): Promise<boolean> {
    return this.dependencies.enqueue(async () => {
      const owns = () =>
        isCurrent() && this.dependencies.read().loaded && !this.dependencies.read().enteringNext
      const ready = async () => {
        if (!owns()) return false
        const time = await client.command('get_property', 'time-pos')
        return (
          owns() &&
          typeof time === 'number' &&
          prepared.outgoingEnd - time - this.dependencies.read().decodeOffset >=
            BOUNDARY_UPDATE_MARGIN_SECONDS
        )
      }
      if (!(await ready())) return false
      const position = await client.command('get_property', 'playlist-pos')
      if (typeof position !== 'number' || !Number.isInteger(position) || position < 0) return false
      let installed = false
      const operation = this.beginUpdate({ bridge: prepared.path, original: nextPath })
      let withdraw: (() => void) | undefined
      try {
        // Keep the original B first until both replacements are available.
        await client.command('loadfile', prepared.path, 'append', -1, {})
        await client.command(
          'loadfile',
          nextPath,
          'append',
          -1,
          softTransitionContinuationOptions(prepared.incomingResume),
        )
        if (!(await ready())) return false
        await client.command('playlist-move', position + 2, position + 1)
        await client.command('playlist-move', position + 3, position + 2)
        if (!(await ready())) return false
        await client.command('playlist-remove', position + 3)
        if (!(await ready())) return false
        withdraw = this.dependencies.publishTransition(prepared, nextPath)
        await client.command(
          'set_property',
          'file-local-options/end',
          String(prepared.outgoingEnd - this.dependencies.read().decodeOffset),
        )
        installed = true
        return true
      } finally {
        try {
          if (!installed && owns()) {
            withdraw?.()
            await client.command('playlist-clear')
            await client.command('set_property', 'file-local-options/end', 'none')
            await client.command('loadfile', nextPath, 'append', -1, {})
          }
        } finally {
          this.finishUpdate(operation)
        }
      }
    })
  }

  private async applyBoundary(
    client: MpvClient,
    nextPath: string,
    boundary: DigitalBoundary,
    isCurrent: () => boolean,
  ): Promise<'applied' | 'too-late' | 'cancelled'> {
    const ownsBoundary = () =>
      isCurrent() && this.dependencies.read().loaded && !this.dependencies.read().enteringNext
    const end = boundary.end ?? this.dependencies.read().duration
    if (!ownsBoundary()) return 'cancelled'
    const position = await client.command('get_property', 'playlist-pos')
    if (!ownsBoundary()) return 'cancelled'
    if (typeof position !== 'number' || !Number.isInteger(position) || position < 0)
      throw new Error('Invalid mpv playlist position during boundary update')
    const canUpdate = async () => {
      if (!ownsBoundary()) return false
      // Query mpv instead of relying on a possibly delayed time-pos event.
      const time = await client.command('get_property', 'time-pos')
      if (!ownsBoundary()) return false
      const currentPosition = await client.command('get_property', 'playlist-pos')
      return (
        ownsBoundary() &&
        currentPosition === position &&
        typeof time === 'number' &&
        end - time - this.dependencies.read().decodeOffset >= BOUNDARY_UPDATE_MARGIN_SECONDS
      )
    }
    const skipped = () => (ownsBoundary() ? ('too-late' as const) : ('cancelled' as const))
    if (!(await canUpdate())) return skipped()
    const nextIndex = position + 1
    let appended = false
    let moved = false
    let replaced = false
    const operation = this.beginUpdate()
    try {
      // Preserve the ordinary next item until its replacement is accepted by mpv.
      await client.command(
        'loadfile',
        nextPath,
        'append',
        -1,
        softTransitionContinuationOptions(boundary.start),
      )
      appended = true
      if (!(await canUpdate())) return skipped()
      // Move the replacement ahead first: removing the original directly could
      // stop it if a delayed command arrives just after natural advancement.
      await client.command('playlist-move', nextIndex + 1, nextIndex)
      moved = true
      if (!(await canUpdate())) return skipped()
      await client.command('playlist-remove', nextIndex + 1)
      replaced = true
      if (!(await canUpdate())) return skipped()
      if (boundary.end !== null)
        await client.command(
          'set_property',
          'file-local-options/end',
          String(boundary.end - this.dependencies.read().decodeOffset),
        )
      if (!ownsBoundary()) return skipped()
      appended = false
      return 'applied'
    } finally {
      try {
        if (appended && ownsBoundary()) {
          if (moved) {
            // Put the ordinary head first before dropping the trimmed replacement.
            if (replaced) await client.command('loadfile', nextPath, 'append', -1, {})
            if (ownsBoundary()) {
              await client.command('playlist-move', nextIndex + 1, nextIndex)
              if (ownsBoundary()) await client.command('playlist-remove', nextIndex + 1)
              if (ownsBoundary())
                await client.command('set_property', 'file-local-options/end', 'none')
            }
          } else {
            await client.command('playlist-remove', nextIndex + 1)
          }
        }
      } finally {
        this.finishUpdate(operation)
      }
    }
  }
}
