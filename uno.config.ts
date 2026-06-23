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
      'grid h-screen grid-cols-[232px_minmax(0,1fr)] overflow-hidden bg-paper text-ink xl:grid-cols-[232px_minmax(0,1fr)_292px]',
    'app-sidebar': 'flex min-h-0 flex-col border-r border-black/8 bg-linen/68 pb-24',
    'app-main': 'min-h-0 overflow-y-auto pb-28',
    'now-playing-panel':
      'hidden min-h-0 flex-col border-l border-black/8 bg-white/40 pb-24 xl:flex',
    'player-bar':
      'fixed bottom-0 left-0 right-0 z-20 grid h-20 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-t border-black/10 bg-paper/94 px-5 shadow-[0_-8px_28px_rgba(31,37,40,0.08)] backdrop-blur',
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
