import manifest from '../assets/milestones/materials/manifest.json'
import type {
  BadgeMaterialDescriptor,
  BadgeMaterialMaps,
  BadgeState,
} from '../runtime/badgeMaterialRenderer'

const files = import.meta.glob<string>(
  [
    '../assets/milestones/materials/**/*-{base,material,normal,ao,finish}.png',
    '../assets/milestones/materials/previews/*.png',
  ],
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
)
const originals = import.meta.glob<string>('../assets/milestones/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})
const asset = (path: string) => {
  const value = files[`../assets/milestones/materials/${path}`]
  if (!value) throw new Error(`Missing badge material asset: ${path}`)
  return value
}

export const badgeMaterialDescriptors: Record<string, BadgeMaterialDescriptor> = Object.fromEntries(
  Object.values(manifest.badges).map((entry) => [
    entry.catalogId,
    {
      id: entry.id,
      baseline: entry.baseline,
      roughness: entry.roughness,
      states: Object.fromEntries(
        Object.entries(entry.states).map(([state, paths]) => [
          state,
          Object.fromEntries(
            ['base', 'material', 'normal', 'ao', 'finish'].map((key) => [
              key,
              asset(paths[key as keyof typeof paths]),
            ]),
          ) as unknown as BadgeMaterialMaps,
        ]),
      ) as Record<BadgeState, BadgeMaterialMaps>,
    },
  ]),
)

export function getBadgePreview(catalogId: string, state: BadgeState = 'lit'): string {
  const entry = badgeMaterialDescriptors[catalogId]
  if (!entry) throw new Error(`Unknown badge: ${catalogId}`)
  return (
    files[`../assets/milestones/materials/previews/${entry.id}-${state}.png`] ??
    originals[`../assets/milestones/${entry.id}${state === 'unlit' ? '-unlit' : ''}.svg`]
  )
}

export const badgeContours: Record<string, string> = Object.fromEntries(
  Object.values(manifest.badges).map((entry) => [entry.catalogId, entry.contour]),
)
