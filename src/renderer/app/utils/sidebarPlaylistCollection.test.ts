import { isReadonly } from 'vue'
import { describe, expect, it } from 'vitest'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import { createSidebarPlaylistCollection } from './sidebarPlaylistCollection'

function item(id: number, kind: SidebarPlaylistItem['kind'] = 'playlist'): SidebarPlaylistItem {
  return {
    id,
    kind,
    name: `List ${id}`,
    viewMode: 'flat',
    sortOrder: id,
    trackCount: 0,
    createdAt: '',
    updatedAt: '',
  }
}

describe('sidebar playlist ownership', () => {
  it('owns input snapshots and exposes deeply readonly views', () => {
    const input = [item(1)]
    const collection = createSidebarPlaylistCollection(input)
    input[0].name = 'External edit'
    input.push(item(2))
    expect(collection.items.value).toEqual([item(1)])
    expect(isReadonly(collection.items)).toBe(true)
    expect(isReadonly(collection.items.value)).toBe(true)
    expect(isReadonly(collection.items.value[0])).toBe(true)
    const replacement = [item(3)]
    collection.applyLoadedItems(replacement, collection.captureLoadVersion())
    replacement[0].name = 'External edit'
    expect(collection.items.value).toEqual([item(3)])
  })

  it('does not restore a deleted item from an older load or order response', () => {
    const collection = createSidebarPlaylistCollection([item(1), item(1, 'smart'), item(2)])
    const load = collection.captureLoadVersion()
    const order = collection.beginOrder([item(2), item(1), item(1, 'smart')])
    collection.remove(item(1))
    expect(collection.applyLoadedItems([item(1)], load)).toBe(false)
    expect(collection.commitOrder(order, [item(1), item(2)])).toBe(false)
    collection.rollbackOrder(order)
    expect(collection.items.value).toEqual([item(1, 'smart'), item(2)])
  })

  it('keeps confirmed order and new counts when a stale order result cannot be reconciled', () => {
    const collection = createSidebarPlaylistCollection([item(1, 'smart'), item(2)])
    const order = collection.beginOrder([item(2), item(1, 'smart')])
    collection.refreshTrackCounts(new Map([[1, 7]]))
    expect(collection.commitOrder(order, [item(2), item(1, 'smart')])).toBe(false)
    collection.rollbackOrder(order)
    expect(collection.items.value.map((entry) => [entry.id, entry.trackCount])).toEqual([
      [1, 7],
      [2, 0],
    ])
  })

  it('ignores superseded order sessions and all writes after disposal', () => {
    const collection = createSidebarPlaylistCollection([item(1), item(2)])
    const old = collection.beginOrder([item(2), item(1)])
    const current = collection.beginOrder([item(1), item(2)])
    expect(collection.commitOrder(old, [item(2), item(1)])).toBe(false)
    collection.rollbackOrder(old)
    expect(collection.items.value).toEqual([item(1), item(2)])
    const load = collection.captureLoadVersion()
    collection.dispose()
    collection.remove(item(1))
    collection.beginOrder([item(2)])
    collection.rollbackOrder(current)
    expect(collection.commitOrder(current, [item(2)])).toBe(false)
    expect(collection.applyLoadedItems([], load)).toBe(false)
    expect(collection.items.value).toEqual([item(1), item(2)])
  })
})
