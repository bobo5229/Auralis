import { createApp, nextTick } from 'vue'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import './app/styles/main.css'
import App from './App.vue'
import { router } from './app/router'
import { useTheme } from './composables/useTheme'

const { initTheme } = useTheme()
initTheme()

async function bootstrap(): Promise<void> {
  const app = createApp(App)

  app.use(router)
  await router.isReady()
  app.mount('#app')
  await nextTick()

  window.auralis.app.rendererReady()
}

void bootstrap()
