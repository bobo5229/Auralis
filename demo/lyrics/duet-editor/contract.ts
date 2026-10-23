import type { LyricsConversionWarning } from '../../../src/main/features/lyrics/conversionTypes'
import type {
  AssignDuetLinesRequest,
  ConfigureDuetRequest,
  DuetLyricsSnapshot,
} from '../../../src/main/features/lyrics/duetTypes'

/** Demo-only transport. No application IPC or filesystem capability is exposed. */
export type DemoRequest =
  | { action: 'open'; text: string; format: 'lrc' | 'ttml' }
  | { action: 'configure'; text: string; request: ConfigureDuetRequest }
  | { action: 'assign'; text: string; request: AssignDuetLinesRequest }
  | { action: 'export'; text: string; format: 'lrc' | 'ttml' }

export interface DemoResponse {
  text: string
  snapshot: DuetLyricsSnapshot
  warnings: LyricsConversionWarning[]
}
