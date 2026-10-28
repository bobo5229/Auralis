export const WINDOW_CLOSE_BEHAVIORS = ['quit', 'tray'] as const
export type WindowCloseBehavior = (typeof WINDOW_CLOSE_BEHAVIORS)[number]

export interface WindowBehaviorState {
  behavior: WindowCloseBehavior
  trayAvailable: boolean
}

export function isWindowCloseBehavior(value: unknown): value is WindowCloseBehavior {
  return WINDOW_CLOSE_BEHAVIORS.some((behavior) => behavior === value)
}
