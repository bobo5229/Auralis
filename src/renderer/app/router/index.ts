import { createRouter, createWebHashHistory } from 'vue-router'
import LibraryPage from '@renderer/features/library/pages/LibraryPage.vue'
import AlbumsPage from '@renderer/features/albums/pages/AlbumsPage.vue'
import AlbumDetailPage from '@renderer/features/albums/pages/AlbumDetailPage.vue'
import RoamPage from '@renderer/features/roam/pages/RoamPage.vue'
import ArchivePage from '@renderer/features/archive/pages/ArchivePage.vue'
import SettingsPage from '@renderer/features/settings/pages/SettingsPage.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'library', component: LibraryPage, meta: { title: 'Library' } },
    {
      path: '/smart-playlists/:id',
      name: 'smart-playlist',
      component: LibraryPage,
      meta: { title: 'Smart Playlist' },
    },
    {
      path: '/playlists/:id',
      name: 'playlist',
      component: LibraryPage,
      meta: { title: 'Playlist' },
    },
    { path: '/albums', name: 'albums', component: AlbumsPage, meta: { title: 'Albums' } },
    {
      path: '/albums/detail',
      name: 'album-detail',
      component: AlbumDetailPage,
      meta: { title: 'Album' },
    },
    { path: '/roam', name: 'roam', component: RoamPage, meta: { title: 'Roam' } },
    { path: '/archive', name: 'archive', component: ArchivePage, meta: { title: 'Archive' } },
    { path: '/settings', name: 'settings', component: SettingsPage, meta: { title: 'Settings' } },
  ],
})
