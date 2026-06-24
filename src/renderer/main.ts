import { createApp } from 'vue'
import { nextTick } from 'vue'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import './app/styles/main.css'
import App from './App.vue'
import { router } from './app/router'
import { useTheme } from './composables/useTheme'

const { initTheme } = useTheme()
initTheme()

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

async function bootstrap(): Promise<void> {
  const app = createApp(App)

  app.use(router)
  await router.isReady()
  app.mount('#app')

  await nextTick()
  await waitForNextFrame()
  await waitForNextFrame()

  window.auralis.app.rendererReady()
}

void bootstrap()
