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
      'grid h-screen grid-cols-[260px_minmax(0,1fr)] overflow-hidden bg-[var(--auralis-bg)] text-ink xl:grid-cols-[260px_minmax(0,1fr)_292px]',
    'app-sidebar':
      'flex w-[232px] h-[calc(100vh-24px)] min-h-0 flex-col m-[12px_0_12px_12px] rounded-[20px] border border-[var(--auralis-border-subtle)] bg-[var(--auralis-sidebar-bg)] overflow-hidden pb-24',
    'app-main': 'min-h-0 overflow-y-auto pb-28 bg-[var(--auralis-main-bg)]',
    'now-playing-panel':
      'hidden min-h-0 flex-col border-l border-[var(--auralis-border-subtle)] bg-[var(--auralis-now-playing-bg)] pb-24 xl:flex',
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
    'track-subtitle': 'text-xs leading-4 text-ink/58 truncate',
    'track-progress': 'w-full h-[3px] rounded-full bg-black/8 overflow-hidden mt-1.5',
    'track-progress-fill': 'h-full bg-dusk/70',
    'content-frame': 'mx-auto w-full max-w-7xl px-7 py-7',
    'quiet-panel': 'border border-black/8 bg-white/55 shadow-sm',
    'sidebar-section-label':
      'px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink/42',
    'sidebar-link':
      'mb-1 block rounded px-3 py-2 text-sm text-ink/70 transition hover:bg-black/6 hover:text-ink',
    'sidebar-link-active': 'bg-white/72 text-ink shadow-sm',
    'player-control':
      'rounded px-3 py-2 text-xs font-medium text-ink/64 transition hover:bg-black/6 hover:text-ink',
    'player-control-primary':
      'rounded bg-ink px-4 py-2 text-xs font-medium text-paper transition hover:bg-ink/88',
  },
})
