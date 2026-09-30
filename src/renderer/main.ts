import { createApp, nextTick } from 'vue'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import './app/styles/main.css'
import { useTheme } from './composables/useTheme'
import { tooltipPlugin } from './shared/tooltip/tooltip'
import {
  APP_FAILED_EVENT,
  APP_HOST_ELEMENT_ID,
  APP_READY_EVENT,
  SPLASH_ELEMENT_ID,
} from './app/splash/startupSignals'

const { initTheme } = useTheme()
initTheme()

function waitForNextFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve()
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

/**
 * 开屏控制器未接管（资源缺失或初始化失败）时的救援路径：
 * 直接移除开屏节点并解除主界面 inert，保证应用可用。
 */
function releaseOrphanedSplash(): void {
  if (window.__auralisSplashActive) return
  document.getElementById(SPLASH_ELEMENT_ID)?.remove()
  document.getElementById(APP_HOST_ELEMENT_ID)?.removeAttribute('inert')
}

function showStartupFailure(error: unknown): void {
  console.error('Auralis startup failed', error)
  window.dispatchEvent(new Event(APP_FAILED_EVENT))

  const appHost = document.getElementById(APP_HOST_ELEMENT_ID)
  appHost?.setAttribute('inert', '')

  const splash = document.getElementById(SPLASH_ELEMENT_ID) ?? document.createElement('div')
  splash.id = SPLASH_ELEMENT_ID
  splash.classList.remove('is-exiting')
  splash.setAttribute('role', 'alert')
  splash.setAttribute('tabindex', '-1')

  const message = document.createElement('div')
  message.className = 'splash-startup-error'
  const title = document.createElement('strong')
  title.textContent = 'Auralis 启动失败'
  const description = document.createElement('span')
  description.textContent = '请关闭应用后重试。'
  message.append(title, description)
  splash.replaceChildren(message)
  document.body.append(splash)
  splash.focus({ preventScroll: true })

  try {
    const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    window.auralis.app.splashReady({ theme })
    window.auralis.app.rendererReady()
  } catch {
    // Preload 故障时，主进程现有的窗口显示超时仍会展示错误画面。
  }
}

async function bootstrap(): Promise<void> {
  // 清理旧偏好属于维护操作，存储不可用时仍继续启动主界面。
  try {
    localStorage.removeItem('auralis-locale')
  } catch {
    // 受限上下文中的 localStorage 可能不可用。
  }

  const [{ default: App }, { router }, { auralis }] = await Promise.all([
    import('./App.vue'),
    import('./app/router'),
    import('./shared/ipc/client'),
  ])

  const { i18n } = await import('./i18n')

  const app = createApp(App)
  app.use(tooltipPlugin)
  app.use(i18n)
  app.use(router)
  await router.isReady()
  app.mount('#app')
  await nextTick()
  // 主界面就绪信号在路由就绪、Vue 挂载并渲染一帧后发出；
  // 兜底限时防止隐藏窗口中帧回调延迟拖延就绪通知。
  await Promise.race([waitForNextFrame(), new Promise((resolve) => setTimeout(resolve, 100))])
  releaseOrphanedSplash()
  window.__auralisAppReady = true
  window.dispatchEvent(new Event(APP_READY_EVENT))
  auralis.app.rendererReady()

  const { schedulePrimaryRouteWarmup } = await import('./app/router/routeWarmup')
  schedulePrimaryRouteWarmup()
}

void bootstrap().catch((error: unknown) => {
  if (window.__auralisAppReady) {
    console.error('Auralis post-startup warmup failed', error)
    return
  }
  showStartupFailure(error)
})
