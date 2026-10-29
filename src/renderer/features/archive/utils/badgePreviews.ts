import manifest from '../assets/milestones/materials/manifest.json'
import type { BadgeState } from '../runtime/badgeMaterialRenderer'

// The archive overview needs only preview URLs. Full material maps belong to the gallery.
const previews = import.meta.glob<string>('../assets/milestones/materials/previews/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})
const originals = import.meta.glob<string>('../assets/milestones/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})
const badgeIds = new Map(Object.values(manifest.badges).map((entry) => [entry.catalogId, entry.id]))

export function getBadgePreview(catalogId: string, state: BadgeState = 'lit'): string {
  const id = badgeIds.get(catalogId)
  if (!id) throw new Error(`Unknown badge: ${catalogId}`)
  return (
    previews[`../assets/milestones/materials/previews/${id}-${state}.png`] ??
    originals[`../assets/milestones/${id}${state === 'unlit' ? '-unlit' : ''}.svg`]
  )
}
