import { LIBRARY_LAYOUT_METRICS } from '../constants/libraryLayoutMetrics'

export const LIBRARY_FLAT_COLUMN_IDS = [
  'artwork',
  'title',
  'artist',
  'album',
  'play-count',
  'duration',
] as const

export type LibraryFlatColumnId = (typeof LIBRARY_FLAT_COLUMN_IDS)[number]
export type LibraryFlatColumnWidths = Record<LibraryFlatColumnId, number>
export type LibraryFlatColumnWidthPreferences = Partial<LibraryFlatColumnWidths>

export const LIBRARY_FLAT_COLUMN_PREFERENCE_VERSION = 1
export const LIBRARY_FLAT_COLUMN_PREFERENCE_STORAGE_KEY = 'auralis-library-flat-columns'

export const LIBRARY_FLAT_COLUMN_MIN_WIDTHS: Readonly<LibraryFlatColumnWidths> = {
  artwork: 44,
  title: 64,
  artist: 64,
  album: 64,
  'play-count': 48,
  duration: 40,
}

export const LIBRARY_FLAT_COLUMN_MAX_WIDTHS: Readonly<LibraryFlatColumnWidths> = {
  artwork: 120,
  title: 1200,
  artist: 1200,
  album: 1200,
  'play-count': 240,
  duration: 180,
}

const REFERENCE_WIDTHS: Readonly<LibraryFlatColumnWidths> = {
  artwork: LIBRARY_LAYOUT_METRICS.flatArtworkSize,
  title: 240,
  artist: 300,
  album: 240,
  'play-count': 80,
  duration: 56,
}

const FLAT_ROW_ARTWORK_INSET =
  LIBRARY_LAYOUT_METRICS.flatRowHeight - LIBRARY_LAYOUT_METRICS.flatArtworkSize

export interface LibraryFlatColumnLayout {
  visibleColumnIds: LibraryFlatColumnId[]
  widths: LibraryFlatColumnWidths
  gap: number
  paddingInline: number
  availableWidth: number
  gridTemplateColumns: string
  rowHeight: number
}

export function getVisibleLibraryFlatColumnIds(
  containerWidth: number,
  showPlayCount: boolean,
): LibraryFlatColumnId[] {
  const width = Number.isFinite(containerWidth) ? Math.max(0, containerWidth) : 0
  const columns: LibraryFlatColumnId[] = ['artwork', 'title', 'artist', 'album']
  if (showPlayCount) columns.push('play-count')
  columns.push('duration')

  if (width <= 560) columns.splice(columns.indexOf('album'), 1)
  if (width <= 440) columns.splice(columns.indexOf('artist'), 1)
  return columns
}

function distributeByWeights(
  columns: readonly LibraryFlatColumnId[],
  weights: Partial<Record<LibraryFlatColumnId, number>>,
  amount: number,
  widths: LibraryFlatColumnWidths,
): void {
  const validColumns = columns.filter((column) => (weights[column] ?? 0) > 0)
  const totalWeight = validColumns.reduce((sum, column) => sum + (weights[column] ?? 0), 0)
  if (totalWeight <= 0 || amount <= 0) return
  for (const column of validColumns) {
    widths[column] += (amount * (weights[column] ?? 0)) / totalWeight
  }
}

function defaultFlexWeights(
  isCompact: boolean,
  showPlayCount: boolean,
): Partial<Record<LibraryFlatColumnId, number>> {
  if (showPlayCount) {
    return {
      title: 1.6,
      artist: isCompact ? 0.8 : 0.85,
      album: isCompact ? 0.6 : 1,
    }
  }
  if (!isCompact) return { title: 1, album: 1 }
  return { title: 1.5, artist: 0.9, album: 0.8 }
}

function fitWidthsToBudget(
  visibleColumnIds: readonly LibraryFlatColumnId[],
  widths: LibraryFlatColumnWidths,
  budget: number,
  expansionWeights: Partial<Record<LibraryFlatColumnId, number>>,
): void {
  const safeBudget = Number.isFinite(budget) ? Math.max(0, budget) : 0
  const totalWidth = () => visibleColumnIds.reduce((sum, column) => sum + widths[column], 0)
  let total = totalWidth()

  if (total > safeBudget) {
    let excess = total - safeBudget
    const shrinkGroup = (columns: readonly LibraryFlatColumnId[]) => {
      const reducible = columns.reduce(
        (sum, column) => sum + Math.max(0, widths[column] - LIBRARY_FLAT_COLUMN_MIN_WIDTHS[column]),
        0,
      )
      if (reducible <= 0 || excess <= 0) return
      const reduction = Math.min(excess, reducible)
      for (const column of columns) {
        const capacity = Math.max(0, widths[column] - LIBRARY_FLAT_COLUMN_MIN_WIDTHS[column])
        widths[column] -= (reduction * capacity) / reducible
      }
      excess -= reduction
    }

    // Keep artwork preferences shared by normal and play-count playlists whenever
    // text columns can absorb the extra fixed play-count column.
    shrinkGroup(
      visibleColumnIds.filter((column) => !['artwork', 'duration', 'play-count'].includes(column)),
    )
    shrinkGroup(
      visibleColumnIds.filter((column) => column === 'duration' || column === 'play-count'),
    )
    shrinkGroup(visibleColumnIds.filter((column) => column === 'artwork'))

    if (excess > 0) {
      // At pathological window widths even the configured minima cannot fit.
      // Compress proportionally as the final fallback to avoid horizontal scroll.
      total = totalWidth()
      const scale = total > 0 ? safeBudget / total : 0
      for (const column of visibleColumnIds) widths[column] *= scale
    }
    return
  }

  const distributable = visibleColumnIds.filter(
    (column) => column !== 'artwork' && column !== 'duration' && column !== 'play-count',
  )
  distributeByWeights(distributable, expansionWeights, safeBudget - total, widths)
}

export function resolveLibraryFlatColumnLayout(input: {
  containerWidth: number
  showPlayCount: boolean
  preferredWidths?: LibraryFlatColumnWidthPreferences
}): LibraryFlatColumnLayout {
  const measuredWidth = Number.isFinite(input.containerWidth)
    ? Math.max(0, input.containerWidth)
    : 0
  // During initial mount ResizeObserver may not have delivered a width yet.
  const containerWidth = measuredWidth > 0 ? measuredWidth : 960
  const isCompact = containerWidth <= 720
  const gap = isCompact ? 8 : 10
  const paddingInline = isCompact ? 12 : 16
  const visibleColumnIds = getVisibleLibraryFlatColumnIds(containerWidth, input.showPlayCount)
  const availableWidth = Math.max(
    0,
    containerWidth - paddingInline * 2 - gap * Math.max(visibleColumnIds.length - 1, 0),
  )
  const widths: LibraryFlatColumnWidths = { ...REFERENCE_WIDTHS }
  const weights = defaultFlexWeights(isCompact, input.showPlayCount)

  if (!input.showPlayCount && !isCompact && visibleColumnIds.includes('artist')) {
    widths.artist = 300
  } else {
    widths.artist = LIBRARY_FLAT_COLUMN_MIN_WIDTHS.artist
  }
  widths.duration = isCompact && input.showPlayCount ? 48 : 56
  widths['play-count'] = 80

  const fixedColumns = visibleColumnIds.filter((column) => (weights[column] ?? 0) <= 0)
  const fixedWidth = fixedColumns.reduce((sum, column) => sum + widths[column], 0)
  for (const column of visibleColumnIds) {
    if ((weights[column] ?? 0) > 0) widths[column] = 0
  }
  distributeByWeights(visibleColumnIds, weights, Math.max(0, availableWidth - fixedWidth), widths)

  for (const column of visibleColumnIds) {
    const preferred = input.preferredWidths?.[column]
    if (preferred === undefined) continue
    const min = LIBRARY_FLAT_COLUMN_MIN_WIDTHS[column]
    const max = LIBRARY_FLAT_COLUMN_MAX_WIDTHS[column]
    widths[column] = Math.min(max, Math.max(min, preferred))
  }

  fitWidthsToBudget(visibleColumnIds, widths, availableWidth, weights)

  const artworkWidth = widths.artwork
  return {
    visibleColumnIds,
    widths,
    gap,
    paddingInline,
    availableWidth,
    gridTemplateColumns: visibleColumnIds.map((column) => `${widths[column]}px`).join(' '),
    rowHeight: Math.max(
      LIBRARY_LAYOUT_METRICS.flatRowHeight,
      artworkWidth + FLAT_ROW_ARTWORK_INSET,
    ),
  }
}

export function resizeAdjacentLibraryColumns(input: {
  widths: LibraryFlatColumnWidths
  visibleColumnIds: readonly LibraryFlatColumnId[]
  leftColumn: LibraryFlatColumnId
  rightColumn: LibraryFlatColumnId
  delta: number
}): LibraryFlatColumnWidths {
  const leftIndex = input.visibleColumnIds.indexOf(input.leftColumn)
  if (
    leftIndex < 0 ||
    input.visibleColumnIds[leftIndex + 1] !== input.rightColumn ||
    !Number.isFinite(input.delta)
  ) {
    return { ...input.widths }
  }

  const pairWidth = input.widths[input.leftColumn] + input.widths[input.rightColumn]
  const minLeft =
    input.widths[input.leftColumn] < LIBRARY_FLAT_COLUMN_MIN_WIDTHS[input.leftColumn]
      ? input.widths[input.leftColumn]
      : LIBRARY_FLAT_COLUMN_MIN_WIDTHS[input.leftColumn]
  const minRight =
    input.widths[input.rightColumn] < LIBRARY_FLAT_COLUMN_MIN_WIDTHS[input.rightColumn]
      ? input.widths[input.rightColumn]
      : LIBRARY_FLAT_COLUMN_MIN_WIDTHS[input.rightColumn]
  const maxLeft = Math.max(
    LIBRARY_FLAT_COLUMN_MAX_WIDTHS[input.leftColumn],
    input.widths[input.leftColumn],
  )
  const maxRight = Math.max(
    LIBRARY_FLAT_COLUMN_MAX_WIDTHS[input.rightColumn],
    input.widths[input.rightColumn],
  )
  const lower = Math.max(minLeft, pairWidth - maxRight)
  const upper = Math.min(maxLeft, pairWidth - minRight)
  if (lower > upper) return { ...input.widths }

  const nextLeft = Math.min(upper, Math.max(lower, input.widths[input.leftColumn] + input.delta))
  return {
    ...input.widths,
    [input.leftColumn]: nextLeft,
    [input.rightColumn]: pairWidth - nextLeft,
  }
}

export function parseLibraryFlatColumnPreferences(
  stored: string | null,
): LibraryFlatColumnWidthPreferences {
  if (!stored) return {}
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const record = parsed as { version?: unknown; widths?: unknown }
    if (
      record.version !== LIBRARY_FLAT_COLUMN_PREFERENCE_VERSION ||
      !record.widths ||
      typeof record.widths !== 'object' ||
      Array.isArray(record.widths)
    ) {
      return {}
    }

    const storedWidths = record.widths as Record<string, unknown>
    const validWidths: LibraryFlatColumnWidthPreferences = {}
    for (const column of LIBRARY_FLAT_COLUMN_IDS) {
      const width = storedWidths[column]
      if (
        typeof width === 'number' &&
        Number.isFinite(width) &&
        width >= LIBRARY_FLAT_COLUMN_MIN_WIDTHS[column] &&
        width <= LIBRARY_FLAT_COLUMN_MAX_WIDTHS[column]
      ) {
        validWidths[column] = width
      }
    }
    return validWidths
  } catch {
    return {}
  }
}
