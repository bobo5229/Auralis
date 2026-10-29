import { inject, provide, shallowRef, type InjectionKey, type ShallowRef } from 'vue'

export type TrackEditorTab = 'metadata' | 'lyrics'
export interface TrackEditorRequest {
  trackId: number
  initialTab: TrackEditorTab
  artworkCacheKey?: string | null
  returnFocusTo?: HTMLElement | null
  restoreFocus?: () => boolean | Promise<boolean>
}
export interface TrackEditorAccess {
  request: Readonly<ShallowRef<TrackEditorRequest | null>>
  open(request: TrackEditorRequest): void
  close(): void
}
const key: InjectionKey<TrackEditorAccess> = Symbol('track-editor')
export function provideTrackEditor(onOpen: () => void): TrackEditorAccess {
  const request = shallowRef<TrackEditorRequest | null>(null)
  const access: TrackEditorAccess = {
    request,
    close() {
      request.value = null
    },
    open(value) {
      if (request.value || !Number.isSafeInteger(value.trackId) || value.trackId <= 0) return
      onOpen()
      request.value = value
    },
  }
  provide(key, access)
  return access
}
export function useTrackEditor(): TrackEditorAccess | null {
  return inject(key, null)
}
