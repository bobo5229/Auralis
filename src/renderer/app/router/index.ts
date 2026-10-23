import { createRouter, createWebHashHistory } from 'vue-router'
import { routeLoaders } from './routeComponentLoaders'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: { name: 'library' } },
    {
      path: '/songs',
      name: 'library',
      component: routeLoaders.library,
      meta: { title: 'Library' },
    },
    {
      path: '/recent-added',
      name: 'recent-added',
      component: routeLoaders.library,
      meta: { title: 'Recently Added' },
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
      redirect: { name: 'archive' },
    },
    {
      path: '/archive/summary/:year(\\d{4})',
      name: 'archive-annual-summary',
      component: routeLoaders.archiveAnnualSummary,
      props: (route) => ({ year: Number(route.params.year) }),
      beforeEnter: (to) => (Number(to.params.year) >= 1900 ? true : { name: 'archive' }),
      meta: { title: 'Year in Review' },
    },
    {
      path: '/settings',
      redirect: { name: 'library' },
    },
  ],
})
