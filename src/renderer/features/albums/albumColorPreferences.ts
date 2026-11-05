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
    if (!raw) return initial()
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
    return data
  } catch {
    return null
  }
}
function save(data: Store): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    revision.value++
    return true
  } catch {
    return false
  }
}
const key = (anchor: AlbumColorAnchor): string => `${anchor.id}\0${anchor.createdAt}`
function matches(stored: AlbumColorAnchor[], current: AlbumColorAnchor[]): boolean {
  if (!stored.length || !current.length) return false
  const ids = new Set(current.map(key))
  const overlap = stored.filter((anchor) => ids.has(key(anchor))).length
  // A majority on both sides avoids silently applying a preference to a split or merge.
  return overlap / stored.length > 0.5 && overlap / current.length > 0.5
}
export function getAlbumColorPreference(anchors: AlbumColorAnchor[]): RgbColor | null {
  void revision.value
  const data = load()
  if (!data) return null
  const found = data.preferences.filter((entry) => matches(entry.anchors, anchors))
  return found.length === 1 ? found[0].color : null
}
export function setAlbumColorPreference(
  anchors: AlbumColorAnchor[],
  color: RgbColor | null,
): boolean {
  if (!anchors.length || !anchors.every(validAnchor) || (color !== null && !validColor(color)))
    return false
  const data = load()
  if (!data) return false
  const found = data.preferences.filter((entry) => matches(entry.anchors, anchors))
  if (found.length > 1) return false
  data.preferences = data.preferences.filter((entry) => entry !== found[0])
  if (color) data.preferences.push({ anchors, color })
  return save(data)
}

export function migrateAlbumColorPreference(
  anchors: AlbumColorAnchor[],
  migrationKey: string,
  color: RgbColor,
): boolean {
  if (!anchors.length || !anchors.every(validAnchor) || !validColor(color)) return false
  const data = load()
  if (!data) return false
  if (data.migrated.includes(migrationKey)) return true
  if (!data.preferences.some((entry) => matches(entry.anchors, anchors))) {
    data.preferences.push({ anchors, color })
  }
  data.migrated.push(migrationKey)
  return save(data)
}
