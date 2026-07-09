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
    'app-window':
      'grid h-screen grid-rows-[44px_minmax(0,1fr)] overflow-hidden bg-[var(--auralis-app-background)] text-[var(--auralis-text)]',
    'app-shell':
      'grid min-h-0 grid-cols-[260px_minmax(0,1fr)] overflow-hidden bg-transparent text-[var(--auralis-text)] xl:grid-cols-[260px_minmax(0,1fr)_20%]',
    'app-sidebar':
      'flex w-[232px] h-[calc(100%_-_var(--auralis-shell-vertical-gap))] min-h-0 flex-col m-[var(--auralis-shell-edge-gap)_0_var(--auralis-shell-edge-gap)_var(--auralis-shell-edge-gap)] rounded-lg border border-[var(--auralis-border-subtle)] bg-[var(--auralis-sidebar-bg)] overflow-hidden pb-24',
    'app-main': 'min-h-0 overflow-y-auto bg-transparent',
    'app-titlebar':
      'relative z-[80] flex h-11 shrink-0 items-center border-b border-[var(--auralis-titlebar-border)] bg-[var(--auralis-titlebar-bg)] px-4',
    'app-titlebar-brand':
      'flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--auralis-text)]',
    'app-titlebar-logo': 'h-4 w-4 text-[var(--auralis-text)]',
    'app-titlebar-title':
      'pointer-events-none absolute left-1/2 top-1/2 max-w-[45vw] -translate-x-1/2 -translate-y-1/2 truncate text-xs font-semibold text-[var(--auralis-titlebar-title)]',
    'app-titlebar-controls': 'ml-auto flex items-center gap-2',
    'window-dot':
      'h-3 w-3 rounded-full border border-black/10 transition opacity-90 hover:opacity-100',
    'now-playing-panel':
      'hidden h-full min-h-0 flex-col border-l border-[var(--auralis-border-subtle)] bg-[var(--auralis-now-playing-bg)] pb-4 xl:flex',
    'player-bar':
      'fixed left-1/2 bottom-[var(--auralis-player-bottom-gap)] z-50 flex h-18 w-[min(960px,calc(100vw-320px))] min-w-[720px] -translate-x-1/2 items-center gap-5 rounded-full border border-[var(--auralis-playbar-border)] bg-[var(--auralis-playbar-bg)] px-6 shadow-[var(--auralis-playbar-shadow)]',
    'transport-controls': 'flex items-center gap-2 shrink-0',
    'transport-control':
      'inline-flex items-center justify-center rounded p-2 text-[var(--auralis-text-muted)] transition hover:text-[var(--auralis-text)] shadow-none hover:shadow-none',
    'transport-control-primary':
      'inline-flex items-center justify-center rounded-full p-3 text-[var(--auralis-text)] transition hover:text-[var(--auralis-text)] shadow-none hover:shadow-none',
    'playback-actions': 'relative flex items-center gap-3 shrink-0',
    'volume-control-group': 'flex items-center gap-1.5 shrink-0',
    'track-info-card': 'flex-1 min-w-0',
    'track-info-row': 'flex items-center gap-3',
    'track-cover':
      'w-11 h-11 rounded-lg shrink-0 bg-[var(--auralis-border-subtle)] overflow-hidden',
    'track-text': 'flex flex-col justify-center min-w-0 h-11',
    'track-title': 'text-[13px] leading-[18px] font-semibold truncate',
    'track-subtitle': 'text-xs leading-4 text-[var(--auralis-text-muted)] truncate',
    'track-progress':
      'w-full h-[3px] rounded-full bg-[var(--auralis-progress-track)] overflow-hidden mt-1.5 cursor-pointer touch-none',
    'track-progress-fill': 'h-full bg-[var(--auralis-progress-fill)]',
    'content-frame': 'mx-auto w-full max-w-7xl px-7 py-7',
    'quiet-panel':
      'border border-[var(--auralis-border-subtle)] bg-[var(--auralis-sidebar-bg)]/70 shadow-sm',
    'sidebar-section-label':
      'px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--auralis-text-faint)]',
    'sidebar-link':
      'mb-1 flex items-center gap-2.5 rounded px-3 py-2 text-sm text-[var(--auralis-text-muted)] transition hover:bg-[var(--auralis-control-hover-bg)] hover:text-[var(--auralis-text)]',
    'sidebar-link-active': '',
    'player-control':
      'inline-flex items-center justify-center rounded p-2 text-[var(--auralis-text-muted)] transition shadow-none hover:text-[var(--auralis-text)] hover:shadow-none',
    'player-control-primary':
      'inline-flex items-center justify-center rounded-full p-3 text-[var(--auralis-text)] transition hover:bg-[var(--auralis-control-hover-bg)] hover:text-[var(--auralis-text)]',
    'player-control-active': 'text-[var(--auralis-sidebar-active-text)]',
    'theme-toggle-button':
      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--auralis-text-muted)] transition hover:bg-[var(--auralis-control-hover-bg)] hover:text-[var(--auralis-text)]',
    'song-row':
      'grid h-11 grid-cols-[44px_minmax(0,1fr)_300px_minmax(0,1fr)_56px] items-center gap-2.5 px-4 cursor-pointer',
    'song-cover':
      'h-11 w-11 shrink-0 rounded-md bg-[var(--auralis-border-subtle)] flex items-center justify-center',
    'song-title': 'text-sm font-bold truncate pl-1.5',
    'song-artist': 'text-xs font-semibold text-[var(--auralis-text-muted)] truncate pl-2',
    'song-album': 'text-xs font-semibold text-[var(--auralis-text-subtle)] truncate text-right',
    'song-duration': 'text-sm text-[var(--auralis-text-faint)] text-right tabular-nums',
    'metadata-input':
      'h-9 w-full min-w-0 rounded border border-[var(--auralis-border-subtle)] bg-[var(--auralis-sidebar-bg)] px-3 text-sm text-[var(--auralis-text)] transition focus:border-[var(--auralis-text-faint)]',
    'volume-slider':
      'w-20 h-1 accent-[var(--auralis-progress-fill)] cursor-pointer appearance-none rounded-full bg-[var(--auralis-progress-track)]',
    'queue-popover':
      'absolute bottom-[calc(100%+32px)] right-[calc(100%-40px)] z-[70] w-[360px] max-w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-[24px] border border-[var(--auralis-playbar-border)] bg-[var(--auralis-playbar-bg)] p-3 shadow-[var(--auralis-playbar-shadow)]',
    'queue-popover-header': 'flex items-baseline justify-between px-1 pb-2',
    'queue-popover-title': 'text-sm font-semibold text-[var(--auralis-text)]',
    'queue-popover-count': 'text-xs text-[var(--auralis-text-faint)]',
    'queue-popover-section-label':
      'px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--auralis-text-faint)]',
    'queue-popover-scroll': 'max-h-[336px] overflow-y-auto overscroll-contain',
    'queue-item':
      'flex h-14 w-full items-center gap-3 rounded-xl px-2 text-left transition hover:bg-[var(--auralis-control-hover-bg)]',
    'queue-item-active':
      'bg-[var(--auralis-song-row-now-playing-bg)] hover:bg-[var(--auralis-song-row-now-playing-bg)]',
    'queue-item-cover':
      'h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[var(--auralis-border-subtle)]',
    'queue-item-title': 'truncate text-sm font-semibold text-[var(--auralis-text)]',
    'queue-item-subtitle': 'truncate text-xs text-[var(--auralis-text-muted)]',
    'queue-empty': 'flex h-28 items-center justify-center text-sm text-[var(--auralis-text-faint)]',
    'playback-mode-menu':
      'absolute bottom-[calc(100%+30px)] right-[calc(100%-84px)] z-[70] w-52 overflow-hidden rounded-[24px] border border-[var(--auralis-playbar-border)] bg-[var(--auralis-playbar-bg)] p-2 shadow-[var(--auralis-playbar-shadow)]',
    'playback-mode-item':
      'flex h-9 w-full items-center gap-2 rounded-xl px-2 text-left text-sm text-[var(--auralis-text-muted)] transition hover:bg-[var(--auralis-control-hover-bg)] hover:text-[var(--auralis-text)]',
    'playback-mode-item-active': '',
    'playback-mode-check': 'ml-auto h-4 w-4',
    'album-cover-group':
      'grid grid-cols-[250px_minmax(0,1fr)] gap-x-12 border-b border-[var(--auralis-cover-divider)] py-7',
    'album-cover-aside': 'w-[250px]',
    'album-cover-artwork':
      'w-[250px] h-[250px] rounded-lg overflow-hidden bg-[var(--auralis-artwork-placeholder-bg)]',
    'album-cover-meta': 'mt-3',
    'album-cover-meta-title': 'truncate text-[16px] font-bold leading-5 text-[var(--auralis-text)]',
    'album-cover-meta-line': 'font-semibold text-xs text-[var(--auralis-text-muted)] leading-5',
    'album-cover-tracks': 'min-w-0',
    'cover-track-row':
      'grid grid-cols-[40px_minmax(0,1fr)_minmax(120px,220px)_48px] gap-x-3 items-center px-3 min-h-10 rounded-md cursor-pointer bg-[var(--auralis-cover-track-bg)] transition hover:bg-[var(--auralis-cover-track-hover-bg)] not-last:border-b border-[var(--auralis-cover-track-divider)]',
    'cover-track-row--playing':
      'bg-[var(--auralis-song-row-now-playing-bg)] hover:bg-[var(--auralis-song-row-now-playing-bg)]',
    'lyric-active': 'text-[var(--auralis-lyrics-active)] font-bold text-[28px] leading-12 py-1.5',
    'lyric-inactive':
      'text-[var(--auralis-lyrics-inactive)] font-bold text-[28px] leading-12 py-1.5',
    'lyric-prelude':
      'text-[var(--auralis-lyrics-inactive)] font-bold text-[28px] leading-12 py-1.5',
    'lyric-empty': 'h-3 py-0',
  },
})
