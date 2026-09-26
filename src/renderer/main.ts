import { createApp, nextTick } from 'vue'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import './app/styles/main.css'
import { useTheme } from './composables/useTheme'
import { tooltipPlugin } from './shared/tooltip/tooltip'

const { initTheme } = useTheme()
initTheme()

async function bootstrap(): Promise<void> {
  const [{ default: App }, { router }, { auralis }] = await Promise.all([
    import('./App.vue'),
    import('./app/router'),
    import('./shared/ipc/client'),
  ])

  const { i18n } = await import('./i18n')
  // 界面固定使用简体中文，清理历史版本的语言偏好。
  localStorage.removeItem('auralis-locale')

  const app = createApp(App)
  app.use(tooltipPlugin)
  app.use(i18n)
  app.use(router)
  await router.isReady()
  app.mount('#app')
  await nextTick()
  auralis.app.rendererReady()

  const { schedulePrimaryRouteWarmup } = await import('./app/router/routeWarmup')
  schedulePrimaryRouteWarmup()
}

void bootstrap()
