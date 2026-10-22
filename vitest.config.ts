import { fileURLToPath, URL } from 'node:url'
import { availableParallelism } from 'node:os'
import vue from '@vitejs/plugin-vue'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@renderer': fileURLToPath(new URL('./src/renderer', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@main': fileURLToPath(new URL('./src/main', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Decoder integration tests spawn real mpv/FFmpeg processes; leave headroom
    // instead of multiplying decoder threads by every logical CPU on a workstation.
    minWorkers: 1,
    maxWorkers: Math.min(4, availableParallelism()),
    // Component tests mount Vue with a custom renderer in the Node environment.
    testTransformMode: {
      web: [
        '**/App.shell.test.ts',
        '**/FlatTrackColumnHeader.test.ts',
        '**/FacetsDialog.test.ts',
        '**/SongRow.test.ts',
        '**/VirtualAlbumTrackList.test.ts',
        '**/AlbumCard.test.ts',
        '**/CdAlbumIndexPage.test.ts',
        '**/CdViewSwitch.test.ts',
        '**/AlbumsPage.test.ts',
        '**/ThemeAccentSettings.test.ts',
        '**/FullscreenBackgroundControls.test.ts',
        '**/FullscreenLyricsContextMenu.test.ts',
        '**/SyncedLyricsView.test.ts',
        '**/PlayingIndicator.test.ts',
        '**/StartupAlbumOverlay.test.ts',
        '**/AppearanceSettings.lyricsScroll.test.ts',
        '**/AppearanceSettings.playingIcon.test.ts',
        '**/SettingsDialog.test.ts',
        '**/AppDialog.test.ts',
        '**/LyricsSaveMenu.test.ts',
        '**/LyricsDuetLines.test.ts',
        '**/LibraryContextMenu.test.ts',
      ],
    },
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.native.test.ts'],
  },
})
