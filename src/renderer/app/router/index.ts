import { createRouter, createWebHashHistory } from 'vue-router'
import { routeLoaders } from './routeComponentLoaders'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: routeLoaders.home, meta: { title: 'Home' } },
    {
      path: '/songs',
      name: 'library',
      component: routeLoaders.library,
      meta: { title: 'Library' },
    },
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
      path: '/albums/cd/index',
      name: 'cd-album-index',
      component: routeLoaders.cdAlbumIndex,
      meta: { title: 'CD Album Index' },
    },
    {
      path: '/albums/cd',
      name: 'cd-albums',
      component: routeLoaders.cdAlbums,
      meta: { title: 'CD Albums' },
    },
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
      path: '/archive/mac',
      name: 'archive-mac',
      component: routeLoaders.archiveMac,
      meta: { title: 'Mac Archive' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: routeLoaders.settings,
      meta: { title: 'Settings' },
    },
  ],
})
