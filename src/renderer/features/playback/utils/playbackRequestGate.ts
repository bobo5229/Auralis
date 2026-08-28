export type PlaybackRequestToken = number

export interface PlaybackRequestGate {
  begin(): PlaybackRequestToken
  isCurrent(token: PlaybackRequestToken): boolean
  finish(token: PlaybackRequestToken): boolean
  invalidate(): void
}

/**
 * Tracks the one foreground audio operation whose completion is allowed to
 * clear the playback-pending state.  A newer operation supersedes an older
 * one, so a late finally block cannot unlock the newer request.
 */
export function createPlaybackRequestGate(): PlaybackRequestGate {
  let nextToken = 0
  let activeToken: PlaybackRequestToken | null = null

  return {
    begin(): PlaybackRequestToken {
      const token = ++nextToken
      activeToken = token
      return token
    },

    isCurrent(token: PlaybackRequestToken): boolean {
      return activeToken === token
    },

    finish(token: PlaybackRequestToken): boolean {
      if (activeToken !== token) return false
      activeToken = null
      return true
    },

    invalidate(): void {
      activeToken = null
    },
  }
}
