import { createApp } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import CdAlbumsPage from '@renderer/features/albums/pages/CdAlbumsPage.vue'
import { i18n } from '@renderer/i18n'
import { tooltipPlugin } from '@renderer/shared/tooltip/tooltip'
import { state } from './mockPlayback'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import '@renderer/app/styles/main.css'
const router = createRouter({ history: createMemoryHistory(), routes: [{path: '/albums/cd', name: 'cd-albums', component: CdAlbumsPage}, {path: '/albums/cd/index', name: 'cd-album-index', component: {template: '<div>Index</div>'}}] })
await router.push({name: 'cd-albums', query: {artist: 'Preview Artist', title: 'Preview Album'}})
localStorage.setItem('auralis-cd-progress-style', 'comet')
createApp(CdAlbumsPage).use(router).use(i18n).use(tooltipPlugin).mount('#app')
window.previewPlayback = state
