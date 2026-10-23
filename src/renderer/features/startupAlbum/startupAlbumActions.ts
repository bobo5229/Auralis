import type { InjectionKey, Ref } from 'vue'

export type StartupAlbumDrawResult = 'shown' | 'empty' | 'failed' | 'cancelled'

export interface StartupAlbumActions {
  busy: Readonly<Ref<boolean>>
  draw(signal: AbortSignal, returnFocusTo?: HTMLElement): Promise<StartupAlbumDrawResult>
}

export const startupAlbumActionsKey: InjectionKey<StartupAlbumActions> = Symbol('startupAlbumActions')
