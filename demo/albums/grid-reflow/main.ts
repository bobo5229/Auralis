import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { tooltipPlugin } from '@renderer/shared/tooltip/tooltip'
import { initAlbumListParameters } from '@renderer/features/appearance/composables/useAlbumListParameters'
import zh from '@renderer/locales/zh-Hans.json'
import App from './App.vue'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import '@renderer/app/styles/main.css'

document.documentElement.dataset.theme = 'dark'
initAlbumListParameters()
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', name: 'albums', component: App }],
})
await router.push('/')
const app = createApp(App)
app.use(createI18n({ legacy: false, locale: 'zh-Hans', messages: { 'zh-Hans': zh } }))
app.use(router).use(tooltipPlugin)
app.config.errorHandler = (error) => {
  console.error(error)
  ;(window as any).demoError = String(error)
}
app.mount('#app')
