import manifest from '../assets/milestones/materials/manifest.json'

export type MilestoneGroup = 'hours' | 'days' | 'albums'
export interface MilestoneBadge {
  id: string
  name: string
  group: MilestoneGroup
  amount?: number
}

// The generated registry drives the catalogue; these are designs, not earned achievements.
export const milestoneBadges: readonly MilestoneBadge[] = Object.values(manifest.badges).map(
  (entry) => ({
    id: entry.catalogId,
    name: entry.name,
    group: entry.series as MilestoneGroup,
    amount: entry.amount ?? undefined,
  }),
)

export const featuredMilestoneBadges = ['hours100', 'days30', 'albums1'].map(
  (id) => milestoneBadges.find((badge) => badge.id === id)!,
)
export const milestoneGroups: readonly MilestoneGroup[] = ['hours', 'days', 'albums']
