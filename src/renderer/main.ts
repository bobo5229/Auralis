import { createApp, nextTick } from 'vue'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import './app/styles/main.css'
import { useTheme } from './composables/useTheme'

const { initTheme } = useTheme()
initTheme()

async function bootstrap(): Promise<void> {
  const isDesktopLyricsWindow = new URLSearchParams(window.location.search).has('desktopLyrics')

  if (isDesktopLyricsWindow) {
    const { default: DesktopLyricsApp } = await import('./DesktopLyricsApp.vue')
    createApp(DesktopLyricsApp).mount('#app')
    return
  }

  const [{ default: App }, { router }, { auralis }] = await Promise.all([
    import('./App.vue'),
    import('./app/router'),
    import('./shared/ipc/client'),
  ])

  const app = createApp(App)
  app.use(router)
  await router.isReady()
  app.mount('#app')
  await nextTick()
  auralis.app.rendererReady()
}

void bootstrap()
