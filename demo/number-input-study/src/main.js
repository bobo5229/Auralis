import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import 'element-plus/dist/index.css'
import App from './App.vue'
import './style.css'
createApp(App).use(PrimeVue, { theme: { preset: Aura } }).mount('#app')
