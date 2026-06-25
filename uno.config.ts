import { defineConfig, presetIcons, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno(), presetIcons()],
  theme: {
    colors: {
      ink: '#1f2528',
      paper: '#f6f2ea',
      linen: '#ebe3d3',
      moss: '#6f7d63',
      brass: '#a47c48',
      dusk: '#5d6773',
    },
  },
  shortcuts: {
    'app-shell':
      'grid h-screen grid-cols-[260px_minmax(0,1fr)] overflow-hidden bg-[var(--auralis-bg)] text-[var(--auralis-text)] xl:grid-cols-[260px_minmax(0,1fr)_20%]',
    'app-sidebar':
      'flex w-[232px] h-[calc(100vh-24px)] min-h-0 flex-col m-[12px_0_12px_12px] rounded-[20px] border border-[var(--auralis-border-subtle)] bg-[var(--auralis-sidebar-bg)] overflow-hidden pb-24',
    'app-main': 'min-h-0 overflow-y-auto bg-[var(--auralis-main-bg)]',
    'now-playing-panel':
      'hidden h-full min-h-0 flex-col border-l border-[var(--auralis-border-subtle)] bg-[var(--auralis-now-playing-bg)] pb-4 xl:flex',
    'player-bar':
      'fixed left-1/2 bottom-6 z-50 flex h-18 w-[min(960px,calc(100vw-320px))] min-w-[720px] -translate-x-1/2 items-center gap-5 rounded-full border border-[var(--auralis-border-subtle)] bg-[var(--auralis-sidebar-bg)]/95 px-6 shadow-[0_18px_48px_rgba(31,35,40,0.12)] backdrop-blur-sm',
    'transport-controls': 'flex items-center gap-2 shrink-0',
    'playback-actions': 'flex items-center gap-3 shrink-0',
    'track-info-card': 'flex-1 min-w-0',
    'track-info-row': 'flex items-center gap-3',
    'track-cover':
      'w-11 h-11 rounded-lg shrink-0 bg-[var(--auralis-border-subtle)] overflow-hidden',
    'track-text': 'flex flex-col justify-center min-w-0 h-11',
    'track-title': 'text-[13px] leading-[18px] font-semibold truncate',
    'track-subtitle': 'text-xs leading-4 text-[var(--auralis-text-muted)] truncate',
    'track-progress':
      'w-full h-[3px] rounded-full bg-[var(--auralis-progress-track)] overflow-hidden mt-1.5',
    'track-progress-fill': 'h-full bg-[var(--auralis-progress-fill)]',
    'content-frame': 'mx-auto w-full max-w-7xl px-7 py-7',
    'quiet-panel':
      'border border-[var(--auralis-border-subtle)] bg-[var(--auralis-sidebar-bg)]/70 shadow-sm',
    'sidebar-section-label':
      'px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--auralis-text-faint)]',
    'sidebar-link':
      'mb-1 block rounded px-3 py-2 text-sm text-[var(--auralis-text-muted)] transition hover:bg-[var(--auralis-control-hover-bg)] hover:text-[var(--auralis-text)]',
    'sidebar-link-active':
      'bg-[var(--auralis-control-active-bg)] text-[var(--auralis-text)] shadow-sm',
    'player-control':
      'rounded px-3 py-2 text-xs font-medium text-[var(--auralis-text-muted)] transition hover:bg-[var(--auralis-control-hover-bg)] hover:text-[var(--auralis-text)]',
    'player-control-primary':
      'rounded bg-[var(--auralis-control-primary-bg)] px-4 py-2 text-xs font-medium text-[var(--auralis-control-primary-text)] transition opacity-92 hover:opacity-100',
    'theme-toggle-button':
      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--auralis-text-muted)] transition hover:bg-[var(--auralis-control-hover-bg)] hover:text-[var(--auralis-text)]',
    'song-row':
      'grid h-11 grid-cols-[44px_minmax(0,1fr)_140px_minmax(0,1fr)_56px] items-center gap-2.5 px-4 cursor-pointer',
    'song-cover':
      'h-11 w-11 shrink-0 rounded-md bg-[var(--auralis-border-subtle)] flex items-center justify-center',
    'song-title': 'text-sm font-bold truncate',
    'song-artist': 'text-sm font-medium text-[var(--auralis-text-muted)] truncate',
    'song-album': 'text-sm font-medium text-[var(--auralis-text-subtle)] truncate',
    'song-duration': 'text-sm text-[var(--auralis-text-faint)] text-right tabular-nums',
    'metadata-input':
      'h-9 w-full min-w-0 rounded border border-[var(--auralis-border-subtle)] bg-[var(--auralis-sidebar-bg)] px-3 text-sm text-[var(--auralis-text)] transition focus:border-[var(--auralis-text-faint)]',
    'volume-slider':
      'w-20 h-1 accent-[var(--auralis-progress-fill)] cursor-pointer appearance-none rounded-full bg-[var(--auralis-progress-track)]',
    'lyric-active': 'text-[var(--auralis-lyrics-active)] font-bold text-[24px] leading-10 py-1.5',
    'lyric-inactive':
      'text-[var(--auralis-lyrics-inactive)] font-bold text-[24px] leading-10 py-1.5',
    'lyric-prelude':
      'text-[var(--auralis-lyrics-inactive)] font-bold text-[24px] leading-10 py-1.5',
    'lyric-empty': 'h-3 py-0',
  },
})
