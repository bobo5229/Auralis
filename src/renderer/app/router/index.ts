import { createRouter, createWebHashHistory } from 'vue-router'
import { routeLoaders } from './routeComponentLoaders'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'library', component: routeLoaders.library, meta: { title: 'Library' } },
    {
      path: '/smart-playlists/:id',
      name: 'smart-playlist',
      component: routeLoaders.library,
      meta: { title: 'Smart Playlist' },
    },
    {
      path: '/playlists/:id',
      name: 'playlist',
      component: routeLoaders.library,
      meta: { title: 'Playlist' },
    },
    { path: '/albums', name: 'albums', component: routeLoaders.albums, meta: { title: 'Albums' } },
    {
      path: '/albums/detail',
      name: 'album-detail',
      component: routeLoaders.albumDetail,
      meta: { title: 'Album' },
    },
    {
      path: '/archive',
      name: 'archive',
      component: routeLoaders.archive,
      meta: { title: 'Archive' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: routeLoaders.settings,
      meta: { title: 'Settings' },
    },
    {
      path: '/download',
      name: 'download',
      component: routeLoaders.download,
      meta: { title: 'Download' },
    },
  ],
})
