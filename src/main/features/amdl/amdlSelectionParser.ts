import type { AmdlSelectableTrack } from '@shared/types/amdl'

export interface AmdlSelectionParserResult {
  trackAdded?: AmdlSelectableTrack
  selectionRequested: boolean
  tracks: readonly AmdlSelectableTrack[]
}

const SELECTION_PROMPT_LINE = 'Please select from the track options above'

export class AmdlSelectionParser {
  private tracks: AmdlSelectableTrack[] = []
  private selectionRequested = false

  getTracks(): readonly AmdlSelectableTrack[] {
    return this.tracks
  }

  isSelectionRequested(): boolean {
    return this.selectionRequested
  }

  feedLine(line: string): AmdlSelectionParserResult {
    const trimmed = line.trim()

    // 1. Check handshake prompt
    if (trimmed.includes(SELECTION_PROMPT_LINE)) {
      this.selectionRequested = true
      return {
        selectionRequested: true,
        tracks: this.tracks,
      }
    }

    // 2. Ignore lines that are not table rows
    if (!line.includes('|')) {
      return {
        selectionRequested: this.selectionRequested,
        tracks: this.tracks,
      }
    }

    // Split columns by '|'
    const parts = line.split('|')
    // A table row with columns | col1 | col2 | col3 | col4 | has at least 5 segments
    if (parts.length < 5) {
      return {
        selectionRequested: this.selectionRequested,
        tracks: this.tracks,
      }
    }

    const colIndex = parts[1].trim()
    const colTitle = parts[2].trim()
    const colType = parts[4] ? parts[4].trim() : ''

    // 3. Ignore header rows or separator-like text
    if (
      colIndex.toUpperCase() === 'TRACK NUMBER' ||
      colTitle.toUpperCase().includes('TRACK NAME') ||
      colTitle.toUpperCase() === 'TRACK NAME'
    ) {
      return {
        selectionRequested: this.selectionRequested,
        tracks: this.tracks,
      }
    }

    // 4. Check if colIndex is a valid positive integer: e.g.  14
    if (/^\d+$/.test(colIndex)) {
      const indexNum = parseInt(colIndex, 10)
      if (indexNum > 0) {
        const newTrack: AmdlSelectableTrack = {
          index: indexNum,
          title: colTitle,
          type: colType || 'SONG',
        }
        this.tracks.push(newTrack)
        return {
          trackAdded: newTrack,
          selectionRequested: this.selectionRequested,
          tracks: this.tracks,
        }
      }
    }

    // 5. Continuation row: colIndex is empty, colTitle is non-empty
    if (colIndex === '' && colTitle !== '' && this.tracks.length > 0) {
      const lastTrack = this.tracks[this.tracks.length - 1]
      lastTrack.title = lastTrack.title + ' ' + colTitle
      return {
        selectionRequested: this.selectionRequested,
        tracks: this.tracks,
      }
    }

    return {
      selectionRequested: this.selectionRequested,
      tracks: this.tracks,
    }
  }

  reset(): void {
    this.tracks = []
    this.selectionRequested = false
  }
}
