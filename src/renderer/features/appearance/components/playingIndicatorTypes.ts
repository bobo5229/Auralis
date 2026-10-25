export const PLAYING_INDICATOR_PRESETS = ['equalizer', 'blocks-wave'] as const
export type PlayingIndicatorPreset = (typeof PLAYING_INDICATOR_PRESETS)[number]
