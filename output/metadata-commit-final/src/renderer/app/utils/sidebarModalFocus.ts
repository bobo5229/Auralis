import { resolveRestorableFocusTarget as resolveFocusTarget } from '@renderer/shared/focus/restoreFocus'

export function resolveRestorableFocusTarget(candidate: HTMLElement | null): HTMLElement | null {
  return resolveFocusTarget(candidate, '.sidebar-overlay')
}
