<template>
  <footer class="player-bar">
    <div class="flex min-w-0 items-center gap-3">
      <div class="h-12 w-12 shrink-0 rounded bg-linen"></div>
      <div class="min-w-0">
        <div class="truncate text-sm font-medium">No track selected</div>
        <div class="truncate text-xs text-ink/50">Auralis is ready</div>
      </div>
    </div>

    <div class="flex items-center justify-center gap-2">
      <button class="player-control" type="button" aria-label="Previous track">Prev</button>
      <button class="player-control-primary" type="button" aria-label="Play">Play</button>
      <button class="player-control" type="button" aria-label="Next track">Next</button>
    </div>

    <div class="hidden items-center justify-end gap-3 lg:flex">
      <div class="h-1 w-28 overflow-hidden rounded bg-black/10">
        <div class="h-full w-3/5 bg-dusk/70"></div>
      </div>
    </div>
  </footer>
</template>
