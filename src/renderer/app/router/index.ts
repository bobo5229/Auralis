import { createRouter, createWebHashHistory } from 'vue-router'
import LibraryPage from '@renderer/features/library/pages/LibraryPage.vue'
import AlbumsPage from '@renderer/features/albums/pages/AlbumsPage.vue'
import PlaybackPage from '@renderer/features/playback/pages/PlaybackPage.vue'
import ArchivePage from '@renderer/features/archive/pages/ArchivePage.vue'
import SearchPage from '@renderer/features/search/pages/SearchPage.vue'
import SettingsPage from '@renderer/features/settings/pages/SettingsPage.vue'
import VirtualListPage from '@renderer/features/library/pages/VirtualListPage.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'library', component: LibraryPage },
    { path: '/albums', name: 'albums', component: AlbumsPage },
    { path: '/playback', name: 'playback', component: PlaybackPage },
    { path: '/archive', name: 'archive', component: ArchivePage },
    { path: '/search', name: 'search', component: SearchPage },
    { path: '/virtual-list', name: 'virtual-list', component: VirtualListPage },
    { path: '/settings', name: 'settings', component: SettingsPage },
  ],
})
