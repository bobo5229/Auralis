import { createApp, nextTick } from 'vue'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import './app/styles/main.css'
import App from './App.vue'
import DesktopLyricsApp from './DesktopLyricsApp.vue'
import { router } from './app/router'
import { useTheme } from './composables/useTheme'
import { auralis } from './shared/ipc/client'

const { initTheme } = useTheme()
initTheme()

async function bootstrap(): Promise<void> {
  const isDesktopLyricsWindow = new URLSearchParams(window.location.search).has('desktopLyrics')
  const app = createApp(isDesktopLyricsWindow ? DesktopLyricsApp : App)

  if (!isDesktopLyricsWindow) {
    app.use(router)
    await router.isReady()
  }
  app.mount('#app')
  await nextTick()

  if (!isDesktopLyricsWindow) {
    auralis.app.rendererReady()
  }
}

void bootstrap()
