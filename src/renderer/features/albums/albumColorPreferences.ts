import { ref } from 'vue'
import type { RgbColor } from '@renderer/shared/color/types'

export interface AlbumColorAnchor {
  id: number
  createdAt: string
}
interface Preference {
  anchors: AlbumColorAnchor[]
  color: RgbColor
}
interface Store {
  version: 1
  preferences: Preference[]
  migrated: string[]
}
const STORAGE_KEY = 'auralis-album-color-preferences-v1'
const initial = (): Store => ({ version: 1, preferences: [], migrated: [] })
const revision = ref(0)
let cachedRaw: string | null | undefined
let cachedStore: Store | null = null

function validColor(value: unknown): value is RgbColor {
  if (!value || typeof value !== 'object') return false
  const color = value as Record<string, unknown>
  return ['r', 'g', 'b'].every(
    (key) => Number.isInteger(color[key]) && Number(color[key]) >= 0 && Number(color[key]) <= 255,
  )
}
function validAnchor(value: unknown): value is AlbumColorAnchor {
  if (!value || typeof value !== 'object') return false
  const anchor = value as Record<string, unknown>
  return (
    Number.isSafeInteger(anchor.id) &&
    Number(anchor.id) > 0 &&
    typeof anchor.createdAt === 'string' &&
    anchor.createdAt.length > 0
  )
}
function load(): Store | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === cachedRaw) return cachedStore
    cachedRaw = raw
    cachedStore = null
    if (!raw) return (cachedStore = initial())
    const data = JSON.parse(raw) as Store
    if (data.version !== 1 || !Array.isArray(data.preferences) || !Array.isArray(data.migrated))
      return null
    if (
      !data.preferences.every(
        (entry) =>
          validColor(entry.color) &&
          Array.isArray(entry.anchors) &&
          entry.anchors.length > 0 &&
          entry.anchors.every(validAnchor),
      )
    )
      return null
    if (!data.migrated.every((key) => typeof key === 'string')) return null
    return (cachedStore = data)
  } catch {
    return null
  }
}
function save(data: Store): boolean {
  try {
    const raw = JSON.stringify(data)
    localStorage.setItem(STORAGE_KEY, raw)
    cachedRaw = raw
    cachedStore = data
    revision.value++
    return true
  } catch {
    return false
  }
}
const key = (anchor: AlbumColorAnchor): string => `${anchor.id}\0${anchor.createdAt}`
function matches(stored: AlbumColorAnchor[], ids: Set<string>, currentLength: number): boolean {
  if (!stored.length || !currentLength) return false
  let overlap = 0
  for (const anchor of stored) if (ids.has(key(anchor))) overlap++
  // A majority on both sides avoids silently applying a preference to a split or merge.
  return overlap / stored.length > 0.5 && overlap / currentLength > 0.5
}
export function getAlbumColorPreference(anchors: AlbumColorAnchor[]): RgbColor | null {
  void revision.value
  const data = load()
  if (!data) return null
  const ids = new Set(anchors.map(key))
  let found: Preference | undefined
  for (const entry of data.preferences) {
    if (!matches(entry.anchors, ids, anchors.length)) continue
    if (found) return null
    found = entry
  }
  return found ? { ...found.color } : null
}
export function setAlbumColorPreference(
  anchors: AlbumColorAnchor[],
  color: RgbColor | null,
): boolean {
  if (!anchors.length || !anchors.every(validAnchor) || (color !== null && !validColor(color)))
    return false
  const data = load()
  if (!data) return false
  const ids = new Set(anchors.map(key))
  // Explicit user choices replace conflicting history; automatic reads stay conservative.
  const preferences = data.preferences.filter(
    (entry) => !matches(entry.anchors, ids, anchors.length),
  )
  if (color)
    preferences.push({ anchors: anchors.map((anchor) => ({ ...anchor })), color: { ...color } })
  // Do not mutate the cached store before persistence succeeds.
  return save({ ...data, preferences })
}
