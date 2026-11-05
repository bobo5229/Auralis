import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import messages from '../../../src/renderer/locales/zh-Hans.json'
import App from './App.vue'
import './style.css'
createApp(App).use(createI18n({ legacy: false, locale: 'zh-Hans', messages: { 'zh-Hans': messages } })).mount('#app')
