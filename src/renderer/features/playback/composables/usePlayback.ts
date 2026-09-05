import {
  createPlaybackController,
  type PlaybackController,
  type PlaybackPublicApi,
} from '../runtime/playbackController'
import { createBrowserPlaybackDependencies } from '../runtime/playbackDependencies'

let globalController: PlaybackController | null = null

function getOrCreateController(): PlaybackController {
  if (!globalController) {
    globalController = createPlaybackController(createBrowserPlaybackDependencies())
    if (typeof window !== 'undefined') {
      window.addEventListener(
        'beforeunload',
        () => {
          globalController?.dispose()
        },
        { once: true },
      )
    }
  }
  return globalController
}

export type { PlaybackPublicApi }

export function usePlayback(): PlaybackPublicApi {
  return getOrCreateController().api
}
