import type { RouteComponent } from 'vue-router'

export type WarmableRouteName = 'albums' | 'archive' | 'settings'

export type RouteComponentModule = RouteComponent | { default: RouteComponent }
export type RouteComponentLoader = () => Promise<RouteComponentModule>

export const PRIMARY_WARMABLE_ROUTES: readonly WarmableRouteName[] = [
  'albums',
  'archive',
  'settings',
] as const

/**
 * 集中管理的底层动态 import。
 * 绝不能在模块顶层 import 任何页面组件，保持页面级代码分割。
 */
export const rawRouteLoaders = {
  library: () => import('@renderer/features/library/pages/LibraryPage.vue'),
  albums: () => import('@renderer/features/albums/pages/AlbumsPage.vue'),
  albumDetail: () => import('@renderer/features/albums/pages/AlbumDetailPage.vue'),
  archive: () => import('@renderer/features/archive/pages/ArchivePage.vue'),
  settings: () => import('@renderer/features/settings/pages/SettingsPage.vue'),
} as const satisfies Record<string, RouteComponentLoader>

export function createRouteLoaderRegistry(
  loaders: Record<string, RouteComponentLoader> = rawRouteLoaders,
) {
  const inFlight = new Map<string, Promise<RouteComponentModule>>()

  const getOrLoad = (key: string, loader: RouteComponentLoader): Promise<RouteComponentModule> => {
    const existing = inFlight.get(key)
    if (existing) {
      return existing
    }

    const promise = loader()
      .then((mod) => {
        inFlight.delete(key)
        return mod
      })
      .catch((error) => {
        inFlight.delete(key)
        throw error
      })

    inFlight.set(key, promise)
    return promise
  }

  const routeLoaders = {
    library: () => getOrLoad('library', loaders.library),
    albums: () => getOrLoad('albums', loaders.albums),
    albumDetail: () => getOrLoad('albumDetail', loaders.albumDetail),
    archive: () => getOrLoad('archive', loaders.archive),
    settings: () => getOrLoad('settings', loaders.settings),
  }

  const warmableRouteMap: Record<WarmableRouteName, RouteComponentLoader> = {
    albums: routeLoaders.albums,
    archive: routeLoaders.archive,
    settings: routeLoaders.settings,
  }

  const isWarmableRoute = (name: unknown): name is WarmableRouteName =>
    typeof name === 'string' && name in warmableRouteMap

  const loadRoute = (name: WarmableRouteName): Promise<RouteComponentModule> => {
    return warmableRouteMap[name]()
  }

  const isInFlight = (name: WarmableRouteName): boolean => {
    return inFlight.has(name)
  }

  return {
    routeLoaders,
    warmableRouteMap,
    isWarmableRoute,
    loadRoute,
    isInFlight,
    _inFlightMap: inFlight,
  }
}

export const defaultRouteLoaderRegistry = createRouteLoaderRegistry(rawRouteLoaders)

export const {
  routeLoaders,
  isWarmableRoute,
  loadRoute: loadWarmableRoute,
} = defaultRouteLoaderRegistry
