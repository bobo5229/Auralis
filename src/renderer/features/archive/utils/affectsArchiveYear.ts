import type { LibraryChangedEvent } from '@shared/types/libraryEvents'
import { isListeningArchiveDate } from '@shared/listeningArchiveDate'

/** Unknown dates and live metadata changes retain conservative refresh semantics. */
export function affectsArchiveYear(event: LibraryChangedEvent, year: number): boolean {
  return (
    event.reason !== 'play-stats-updated' ||
    !event.playDate ||
    !isListeningArchiveDate(event.playDate) ||
    Number(event.playDate.slice(0, 4)) === year
  )
}
