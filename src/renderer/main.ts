import { createApp } from 'vue'
import 'virtual:uno.css'
import '@unocss/reset/tailwind.css'
import './app/styles/main.css'
import App from './App.vue'
import { router } from './app/router'
import { useTheme } from './composables/useTheme'

const { initTheme } = useTheme()
initTheme()

createApp(App).use(router).mount('#app')
