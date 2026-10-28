export type CdViewSwitchTarget = 'browse' | 'index'

export interface CdViewSwitchTransition {
  from: CdViewSwitchTarget
  to: CdViewSwitchTarget
}

let pendingTransition: CdViewSwitchTransition | null = null

export function beginCdViewSwitchTransition(
  from: CdViewSwitchTarget,
  to: CdViewSwitchTarget,
): CdViewSwitchTransition {
  const transition = { from, to }
  pendingTransition = transition
  return transition
}

/** Identify a controller click so the route can choose its page transition. */
export function hasCdViewSwitchTransition(
  from: CdViewSwitchTarget,
  to: CdViewSwitchTarget,
): boolean {
  return pendingTransition?.from === from && pendingTransition.to === to
}

export function clearCdViewSwitchTransition(transition: CdViewSwitchTransition): void {
  if (pendingTransition === transition) pendingTransition = null
}
