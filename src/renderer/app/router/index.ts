import { createRouter, createWebHashHistory } from 'vue-router'

const LibraryPage = () => import('@renderer/features/library/pages/LibraryPage.vue')
const AlbumsPage = () => import('@renderer/features/albums/pages/AlbumsPage.vue')
const AlbumDetailPage = () => import('@renderer/features/albums/pages/AlbumDetailPage.vue')
const ArchivePage = () => import('@renderer/features/archive/pages/ArchivePage.vue')
const SettingsPage = () => import('@renderer/features/settings/pages/SettingsPage.vue')

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
    { path: '/archive', name: 'archive', component: ArchivePage, meta: { title: 'Archive' } },
    { path: '/settings', name: 'settings', component: SettingsPage, meta: { title: 'Settings' } },
  ],
})
