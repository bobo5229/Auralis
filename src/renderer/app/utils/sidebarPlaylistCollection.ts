import { readonly, ref } from 'vue'
import type { SidebarPlaylistItem } from '@shared/types/playlist'

type PlaylistIdentity = Pick<SidebarPlaylistItem, 'kind' | 'id'>
export type SidebarOrderToken = symbol

/** Owns list writes and stale-result checks; consumers retain their own UI lifecycles. */
export function createSidebarPlaylistCollection(initial: readonly SidebarPlaylistItem[] = []) {
  const copy = (items: readonly SidebarPlaylistItem[]) => items.map((item) => ({ ...item }))
  const items = ref(copy(initial))
  const externalRevision = ref(0)
  let confirmedItems = items.value
  let loadVersion = Symbol()
  let pendingOrder: { token: SidebarOrderToken; revision: number } | null = null
  let disposed = false

  function acceptExternal(next: SidebarPlaylistItem[]): void {
    items.value = next
    confirmedItems = items.value
    externalRevision.value += 1
  }

  function isLoadCurrent(version: symbol): boolean {
    return !disposed && version === loadVersion
  }

  function applyLoadedItems(next: readonly SidebarPlaylistItem[], version: symbol): boolean {
    if (!isLoadCurrent(version)) return false
    acceptExternal(copy(next))
    return true
  }

  function remove(item: PlaylistIdentity): void {
    if (disposed) return
    loadVersion = Symbol()
    const keep = (entry: SidebarPlaylistItem) => entry.kind !== item.kind || entry.id !== item.id
    // A deletion confirms membership, not an optimistic order still being saved.
    confirmedItems = confirmedItems.filter(keep)
    items.value = items.value.filter(keep)
    externalRevision.value += 1
  }

  function refreshTrackCounts(counts: ReadonlyMap<number, number>): void {
    if (disposed) return
    function merge(source: SidebarPlaylistItem[]): SidebarPlaylistItem[] {
      let changed = false
      const next = source.map((item) => {
        const count = item.kind === 'smart' ? counts.get(item.id) : undefined
        if (count === undefined || count === item.trackCount) return item
        changed = true
        return { ...item, trackCount: count }
      })
      return changed ? next : source
    }
    // Keep the confirmed order while merging independently confirmed counts.
    confirmedItems = merge(confirmedItems)
    const next = merge(items.value)
    if (next !== items.value) {
      items.value = next
      externalRevision.value += 1
    }
  }

  function beginOrder(next: readonly SidebarPlaylistItem[]): SidebarOrderToken {
    const token = Symbol()
    if (disposed) return token
    loadVersion = Symbol()
    pendingOrder = { token, revision: externalRevision.value }
    items.value = copy(next)
    return token
  }

  function commitOrder(token: SidebarOrderToken, saved: readonly SidebarPlaylistItem[]): boolean {
    if (
      disposed ||
      pendingOrder?.token !== token ||
      pendingOrder.revision !== externalRevision.value
    )
      return false
    loadVersion = Symbol()
    items.value = copy(saved)
    confirmedItems = items.value
    pendingOrder = null
    return true
  }

  function rollbackOrder(token: SidebarOrderToken): void {
    if (disposed || pendingOrder?.token !== token) return
    loadVersion = Symbol()
    items.value = confirmedItems
    pendingOrder = null
  }

  return {
    items: readonly(items),
    externalRevision: readonly(externalRevision),
    captureLoadVersion: () => loadVersion,
    isLoadCurrent,
    applyLoadedItems,
    refreshTrackCounts,
    remove,
    beginOrder,
    commitOrder,
    rollbackOrder,
    dispose: () => {
      disposed = true
      pendingOrder = null
    },
  }
}

export type SidebarPlaylistCollection = ReturnType<typeof createSidebarPlaylistCollection>
export type SidebarPlaylistCatalog = Pick<
  SidebarPlaylistCollection,
  'items' | 'captureLoadVersion' | 'isLoadCurrent' | 'applyLoadedItems' | 'refreshTrackCounts'
>
export type SidebarPlaylistOrder = Pick<
  SidebarPlaylistCollection,
  'items' | 'externalRevision' | 'beginOrder' | 'commitOrder' | 'rollbackOrder'
>
