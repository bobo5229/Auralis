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

export function consumeCdViewSwitchTransition(
  target: CdViewSwitchTarget,
): CdViewSwitchTransition | null {
  if (!pendingTransition || pendingTransition.to !== target) return null
  const transition = pendingTransition
  pendingTransition = null
  return transition
}

export function clearCdViewSwitchTransition(transition: CdViewSwitchTransition): void {
  if (pendingTransition === transition) pendingTransition = null
}
