/** Display slots only. The MVP presents the current album, not a fictional catalogue. */
export const archiveColumns = ['a', 'b', 'c', 'd', 'e']
export function columnFiles(lane: number): number[] {
  return Array.from({ length: 8 }, (_, row) => lane * 8 + row)
}
export function fileLocation(index: number) {
  const lane = Math.floor(index / 8)
  const row = 12 + (index % 8)
  return { lane, row, slot: lane * 32 + row }
}
export function fileAtSlot(slot: number) {
  return Math.floor(slot / 32) * 8 + Math.max(0, Math.min(7, (slot % 32) - 12))
}
