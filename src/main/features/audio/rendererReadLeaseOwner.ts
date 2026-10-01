import type { WebContents } from 'electron'
import type { PlaybackCoordinator } from './nativePlaybackService'

type LeaseSender = Pick<WebContents, 'id' | 'isDestroyed' | 'on' | 'removeListener'>

/** Owns both pending and granted leases for one renderer lifetime. */
export class RendererReadLeaseOwner {
  private readonly owners = new Map<
    LeaseSender,
    { controller: AbortController; leases: Set<string>; cleanup: () => void }
  >()
  private disposed = false

  constructor(private readonly coordinator: PlaybackCoordinator) {}

  private owner(sender: LeaseSender) {
    if (this.disposed || sender.isDestroyed()) throw new Error('Renderer is unavailable')
    const existing = this.owners.get(sender)
    if (existing) return existing
    const controller = new AbortController()
    const leases = new Set<string>()
    const cleanup = () => {
      controller.abort()
      for (const leaseId of leases) this.coordinator.releaseReadLease(leaseId)
      leases.clear()
      this.owners.delete(sender)
      sender.removeListener('destroyed', cleanup)
      sender.removeListener('render-process-gone', cleanup)
      sender.removeListener('did-start-navigation', onNavigation)
    }
    const onNavigation = (
      _event: unknown,
      _url: string,
      isInPlace: boolean,
      isMainFrame: boolean,
    ) => {
      if (isMainFrame && !isInPlace) cleanup()
    }
    const owner = { controller, leases, cleanup }
    this.owners.set(sender, owner)
    sender.on('destroyed', cleanup)
    sender.on('render-process-gone', cleanup)
    sender.on('did-start-navigation', onNavigation)
    return owner
  }

  async acquire(sender: LeaseSender, filePath: string): Promise<{ leaseId: string }> {
    const owner = this.owner(sender)
    const lease = await this.coordinator.acquireReadLease(
      filePath,
      `renderer-${sender.id}`,
      owner.controller.signal,
    )
    if (owner.controller.signal.aborted || sender.isDestroyed() || this.disposed) {
      this.coordinator.releaseReadLease(lease.leaseId)
      throw new Error('Renderer read request cancelled')
    }
    owner.leases.add(lease.leaseId)
    return { leaseId: lease.leaseId }
  }

  release(sender: LeaseSender, leaseId: string): void {
    const owner = this.owners.get(sender)
    if (!owner?.leases.delete(leaseId)) return
    this.coordinator.releaseReadLease(leaseId)
  }

  dispose(): void {
    this.disposed = true
    for (const owner of [...this.owners.values()]) owner.cleanup()
  }
}
