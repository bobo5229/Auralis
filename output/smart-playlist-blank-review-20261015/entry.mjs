
      import { createApp, h, nextTick, ref } from 'vue'
      import '@unocss/reset/tailwind.css'
      import 'virtual:uno.css'
      import '/app/styles/main.css'

      const tracks = Array.from({ length: 40 }, (_, i) => ({
        id: i + 1, title: `示例曲目 ${i + 1}`,
        genre: `流派 ${String(i + 1).padStart(2, '0')}`,
        artist: `艺术家 ${String(i + 1).padStart(2, '0')}`,
      }))
      let fixtureCount = 40
      window.auralis = {
        library: {
          onChanged: () => () => {},
          getTrackPage: async () => ({
            snapshotId: `layout-fixture-${fixtureCount}`,
            totalTracks: fixtureCount,
            tracks: tracks.slice(0, fixtureCount),
            nextCursor: null,
            diagnostics: { snapshotBuildMs: 0, pageSliceMs: 0 },
          }),
        },
        smartPlaylists: { create: () => { throw new Error('Creation disabled in layout review') } },
      }
      const [{ default: Builder }, { i18n }, { libraryCatalogClient }] = await Promise.all([
        import('/features/smartPlaylists/components/SmartPlaylistBuilderDialog.vue'),
        import('/i18n/index.ts'),
        import('/features/library/utils/libraryCatalogClient.ts'),
      ])
      i18n.global.locale.value = 'zh-Hans'
      const open = ref(false)
      createApp({ render: () => h(Builder, {
        open: open.value, trigger: null, onClose: () => { open.value = false },
      }) }).use(i18n).mount('#review-root')
      window.reviewSetFixture = async (count) => {
        open.value = false
        await nextTick()
        fixtureCount = count
        libraryCatalogClient.invalidate()
        open.value = true
        await nextTick()
      }
      await window.reviewSetFixture(40)
      await document.fonts.ready
      window.reviewReady = true
