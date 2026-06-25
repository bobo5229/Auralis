import { createRouter, createWebHashHistory } from 'vue-router'
import LibraryPage from '@renderer/features/library/pages/LibraryPage.vue'
import AlbumsPage from '@renderer/features/albums/pages/AlbumsPage.vue'
import PlaybackPage from '@renderer/features/playback/pages/PlaybackPage.vue'
import ArchivePage from '@renderer/features/archive/pages/ArchivePage.vue'
import SearchPage from '@renderer/features/search/pages/SearchPage.vue'
import SettingsPage from '@renderer/features/settings/pages/SettingsPage.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'library', component: LibraryPage, meta: { title: 'Library' } },
    { path: '/albums', name: 'albums', component: AlbumsPage, meta: { title: 'Albums' } },
    { path: '/playback', name: 'playback', component: PlaybackPage, meta: { title: 'Playback' } },
    { path: '/archive', name: 'archive', component: ArchivePage, meta: { title: 'Archive' } },
    { path: '/search', name: 'search', component: SearchPage, meta: { title: 'Search' } },
    { path: '/settings', name: 'settings', component: SettingsPage, meta: { title: 'Settings' } },
  ],
})
