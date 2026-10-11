export type LyricsAlbumTransitionPhase = 'idle' | 'preparing' | 'animating'

export interface LyricsAlbumTransitionTicket {
  revision: number
  from: number
  to: number
}

export interface AlbumLayoutTransitionParticipant {
  prepareLyricsLayoutTransition(revision: number): boolean
  commitLyricsLayoutTransition(revision: number): Promise<boolean>
  animateLyricsLayoutTransition(revision: number, duration: number): Promise<void>
  finishLyricsLayoutTransition(revision: number): Promise<void>
  cancelLyricsLayoutTransition(revision: number): void
}

/** Short lived revision gate shared by App and the active AlbumsPage participant. */
export function createLyricsAlbumTransitionCoordinator() {
  let revision = 0
  let phase: LyricsAlbumTransitionPhase = 'idle'

  return {
    get phase(): LyricsAlbumTransitionPhase {
      return phase
    },
    begin(from: number, to: number): LyricsAlbumTransitionTicket {
      revision += 1
      phase = 'preparing'
      return { revision, from, to }
    },
    isCurrent(ticket: LyricsAlbumTransitionTicket): boolean {
      return revision === ticket.revision
    },
    start(ticket: LyricsAlbumTransitionTicket): boolean {
      if (revision !== ticket.revision || phase !== 'preparing') return false
      phase = 'animating'
      return true
    },
    complete(ticket: LyricsAlbumTransitionTicket): boolean {
      if (revision !== ticket.revision) return false
      phase = 'idle'
      return true
    },
    cancel(): number {
      revision += 1
      phase = 'idle'
      return revision
    },
    get revision(): number {
      return revision
    },
  }
}
