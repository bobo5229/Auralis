import type { TrackListItem } from '@shared/types/libraryScan'
import type { SmartPlaylistExpressionRule } from '@shared/types/smartPlaylist'
import { normalizeDelimitedValue, splitDelimitedValues } from '@shared/utils/delimitedValues'

export type BuilderField = 'genre' | 'artist'
export type BuilderRelation = 'and' | 'or'
export interface BuilderState {
  fields: BuilderField[]
  relation: BuilderRelation
  groups: Record<BuilderField, { relation: BuilderRelation; values: string[] }>
}
export function newBuilderState(): BuilderState {
  return {
    fields: [],
    relation: 'and',
    groups: {
      genre: { relation: 'or', values: [] },
      artist: { relation: 'or', values: [] },
    },
  }
}
export interface BuilderOption {
  value: string
  label: string
  ids: Set<number>
}
export function indexBuilderTracks(
  tracks: readonly TrackListItem[],
): Record<BuilderField, BuilderOption[]> {
  const options: Record<BuilderField, Map<string, BuilderOption>> = {
    genre: new Map(),
    artist: new Map(),
  }
  for (const track of tracks) {
    for (const field of ['genre', 'artist'] as const) {
      for (const label of splitDelimitedValues(track[field])) {
        const value = normalizeDelimitedValue(label)
        let option = options[field].get(value)
        if (!option) {
          option = { value, label, ids: new Set() }
          options[field].set(value, option)
        }
        option.ids.add(track.id)
      }
    }
  }
  const sort = (field: BuilderField): BuilderOption[] =>
    [...options[field].values()].sort((a, b) =>
      a.label.localeCompare(b.label, 'zh-Hans-u-co-pinyin', { numeric: true }),
    )
  return { genre: sort('genre'), artist: sort('artist') }
}
function combine(sets: Set<number>[], relation: BuilderRelation): Set<number> {
  if (!sets.length) return new Set()
  if (relation === 'or') return new Set(sets.flatMap((set) => [...set]))
  const ordered = [...sets].sort((a, b) => a.size - b.size)
  return new Set([...ordered[0]].filter((id) => ordered.every((set) => set.has(id))))
}
export function evaluateBuilder(
  state: BuilderState,
  options: Record<BuilderField, BuilderOption[]>,
) {
  const groups = state.fields.map((field) => {
    const lookup = new Map(options[field].map((option) => [option.value, option.ids]))
    const group = state.groups[field]
    return {
      field,
      ids: combine(
        group.values.map((value) => lookup.get(value) ?? new Set()),
        group.relation,
      ),
    }
  })
  const complete =
    !!groups.length && state.fields.every((field) => state.groups[field].values.length > 0)
  return {
    groups,
    complete,
    ids: complete
      ? combine(
          groups.map((group) => group.ids),
          state.relation,
        )
      : new Set<number>(),
  }
}
export function buildPlaylistRule(state: BuilderState): SmartPlaylistExpressionRule {
  if (!state.fields.length || state.fields.some((field) => !state.groups[field].values.length))
    throw new Error('请选择每个条件组的具体值')
  return {
    expression: {
      type: state.relation,
      operands: state.fields.map((field) => ({
        type: state.groups[field].relation,
        operands: state.groups[field].values.map((value) => ({
          type: 'predicate',
          field,
          operator: 'has',
          value,
        })),
      })),
    },
  }
}
