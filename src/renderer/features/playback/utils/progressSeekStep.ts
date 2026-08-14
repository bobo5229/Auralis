/** Arrow-key seek step on the PlayerBar progress rail (seconds). */
export function resolveProgressSeekStepSeconds(shiftKey: boolean): number {
  return shiftKey ? 15 : 5
}
