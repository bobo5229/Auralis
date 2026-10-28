export interface AlbumLayoutTransitionParticipant {
  prepareLyricsLayoutTransition(revision: number): boolean
  commitLyricsLayoutTransition(revision: number): Promise<boolean>
  animateLyricsLayoutTransition(revision: number, duration: number): Promise<void>
  finishLyricsLayoutTransition(revision: number): Promise<void>
  cancelLyricsLayoutTransition(revision: number): void
}
