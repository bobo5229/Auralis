export type LyricsConversionWarning =
  | 'inferred-line-ends'
  | 'inferred-final-end'
  | 'negative-times-clamped'
  | 'untimed-lines-ignored'
  | 'word-timing-dropped'
  | 'line-ends-dropped'
  | 'performers-dropped'
  | 'annotations-flattened'
  | 'presentation-dropped'
  | 'metadata-dropped'
  | 'submillisecond-times-rounded'

export interface TtmlToLrcOptions {
  /** Apple/AMLL music timestamps are absolute. Use relative for W3C nested syncbases. */
  timingMode?: 'absolute' | 'relative'
}

export class LyricsConversionError extends Error {
  constructor(
    readonly code:
      | 'invalid-input'
      | 'invalid-lrc'
      | 'invalid-ttml'
      | 'unsupported-timing'
      | 'invalid-option',
    message: string,
  ) {
    super(message)
    this.name = 'LyricsConversionError'
  }
}

export interface ConversionWord {
  startMs: number
  endMs?: number
  text: string
}

export interface ConversionLine extends ConversionWord {
  words?: ConversionWord[]
}

export interface ConversionDocument {
  lines: ConversionLine[]
  metadata: Array<[string, string]>
}

export type ConversionWarnings = Set<LyricsConversionWarning>
