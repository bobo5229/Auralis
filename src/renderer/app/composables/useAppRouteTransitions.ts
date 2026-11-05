import { computed, nextTick, ref, type Ref } from 'vue'
import type { Router, RouteLocationNormalizedLoaded } from 'vue-router'
import { createAlbumDetailEntryTransition } from '../layout/albumDetailEntryTransition'
import { findAlbumTransitionFocusTarget } from '@renderer/features/albums/utils/albumGridTransitionPlan'
import { albumIdentityKey } from '@shared/utils/albumIdentity'
import { hasCdViewSwitchTransition } from '@renderer/features/albums/utils/cdViewSwitchTransition'

interface AppRouteTransitionOptions {
  route: RouteLocationNormalizedLoaded
  router: Router
  mainRef: Ref<HTMLElement | null>
  beforeNavigate(): void
  syncCdViewSwitch(): void
}

export function useAppRouteTransitions({
  route,
  router,
  mainRef,
  beforeNavigate,
  syncCdViewSwitch,
}: AppRouteTransitionOptions) {
  /** 成功导航的来源；与目标路由在同一轮渲染前更新。 */
  const previousRouteName = ref(route.name)
  const cdIndexSlideDirection = ref<'enter' | 'leave' | null>(null)
  /** 仅在导航成功后锁定交互，加载失败或守卫取消不产生过渡状态。 */
  const isAlbumDetailEntering = ref(false)
  const albumDetailColorReady = ref(true)
  const isAlbumRouteTransitioning = ref(false)
  let albumRouteRevision = 0
  const enteringRevisions = new WeakMap<Element, number>()
  const leavingInertStates = new WeakMap<HTMLElement, boolean>()
  let shouldRestoreRouteFocus = false
  let albumListReturnFocus: { albumKey: string; selector: string } | null = null
  const albumDetailEntryTransition = createAlbumDetailEntryTransition(undefined, () => {
    albumDetailColorReady.value = true
  })
  const albumDetailTransitionHooks = computed(() =>
    isAlbumRouteTransitioning.value
      ? {
          onBeforeEnter: albumDetailEntryTransition.beforeEnter,
          onEnter: albumDetailEntryTransition.enter,
          onLeave: albumDetailEntryTransition.leave,
          onLeaveCancelled: albumDetailEntryTransition.cancel,
        }
      : {},
  )

  const removeBeforeEach = router.beforeEach(beforeNavigate)

  const removeAfterEach = router.afterEach((to, from, failure) => {
    if (failure) return
    albumDetailEntryTransition.cancel()
    albumRouteRevision += 1
    const focused = document.activeElement
    const mainHasFocus = focused instanceof HTMLElement && !!mainRef.value?.contains(focused)
    if (from.name === 'albums' && to.name === 'album-detail') {
      const albumKey =
        typeof to.query.artist === 'string' && typeof to.query.title === 'string'
          ? albumIdentityKey(to.query.artist, to.query.title)
          : null
      const focusedAlbumKey =
        focused instanceof HTMLElement
          ? focused.closest<HTMLElement>('.album-card[data-album-key]')?.dataset.albumKey
          : null
      albumListReturnFocus = albumKey
        ? {
            albumKey,
            selector:
              focusedAlbumKey === albumKey && focused?.matches('.album-card-play')
                ? '.album-card-play'
                : '.cover-stage',
          }
        : null
    }
    previousRouteName.value = from.name
    cdIndexSlideDirection.value =
      from.name === 'cd-albums' &&
      to.name === 'cd-album-index' &&
      hasCdViewSwitchTransition('browse', 'index')
        ? 'enter'
        : from.name === 'cd-album-index' &&
            to.name === 'cd-albums' &&
            hasCdViewSwitchTransition('index', 'browse')
          ? 'leave'
          : null
    isAlbumDetailEntering.value = to.name === 'album-detail' && from.name === 'albums'
    isAlbumRouteTransitioning.value =
      isAlbumDetailEntering.value || (to.name === 'albums' && from.name === 'album-detail')
    albumDetailColorReady.value = !isAlbumDetailEntering.value
    const albumRoute = isAlbumDetailEntering.value ? to : from
    albumDetailEntryTransition.configure(
      isAlbumRouteTransitioning.value &&
        typeof albumRoute.query.artist === 'string' &&
        typeof albumRoute.query.title === 'string'
        ? albumIdentityKey(albumRoute.query.artist, albumRoute.query.title)
        : null,
      !isAlbumDetailEntering.value,
    )
    shouldRestoreRouteFocus =
      (isAlbumRouteTransitioning.value && mainHasFocus) ||
      (shouldRestoreRouteFocus && (mainHasFocus || focused === document.body))
  })

  /**
   * 路由过渡规则：
   * 1. 列表与专辑详情之间通过 JS 动画衔接封面；不可衔接时使用短交叉淡入淡出
   * 3. CD 浏览与封面检索切换：检索页面从右侧滑入，返回时向右滑出
   * 4. 唱片室其余进入与离开：短淡入淡出，首次展开动画由页面控制
   * 5. 其余路由切换：不使用 CSS 过渡，立即完成
   */
  const transitionName = computed(() => {
    if (route.name === 'album-detail' && previousRouteName.value === 'albums') {
      return 'album-detail-enter-fade'
    }
    if (route.name === 'albums' && previousRouteName.value === 'album-detail') {
      return 'album-detail-exit-fade'
    }
    if (cdIndexSlideDirection.value === 'enter') return 'cd-index-slide'
    if (cdIndexSlideDirection.value === 'leave') return 'cd-index-slide-return'
    if (route.name === 'cd-albums' || previousRouteName.value === 'cd-albums') {
      return 'cd-canvas-fade'
    }
    return null
  })

  function onTransitionBeforeEnter(element: Element): void {
    enteringRevisions.set(element, albumRouteRevision)
  }

  function onTransitionEnter(): void {
    if (cdIndexSlideDirection.value) syncCdViewSwitch()
  }

  function onTransitionBeforeLeave(element: Element): void {
    if (!isAlbumRouteTransitioning.value) return
    const node = element as HTMLElement
    if (!leavingInertStates.has(node)) leavingInertStates.set(node, node.inert)
    node.inert = true
  }

  function restoreLeavingInteractivity(element: Element): void {
    const node = element as HTMLElement
    const previous = leavingInertStates.get(node)
    if (previous === undefined) return
    node.inert = previous
    leavingInertStates.delete(node)
  }

  async function restoreRouteFocus(revision: number): Promise<void> {
    await nextTick()
    if (revision !== albumRouteRevision || !shouldRestoreRouteFocus) return
    shouldRestoreRouteFocus = false
    const main = mainRef.value
    const focused = document.activeElement
    // Respect focus moved to the Playbar or Sidebar while the page was inert.
    if (!main?.isConnected || (focused !== document.body && !main.contains(focused))) return
    const returnTarget =
      route.name === 'albums' && albumListReturnFocus
        ? findAlbumTransitionFocusTarget(
            main.querySelectorAll<HTMLElement>('.album-card[data-album-key]'),
            albumListReturnFocus.albumKey,
            albumListReturnFocus.selector,
          )
        : null
    const target =
      returnTarget ??
      (route.name === 'album-detail' ? main.querySelector<HTMLElement>('.album-detail-back') : null)
    ;(target ?? main).focus({ preventScroll: true })
  }

  function onTransitionAfterEnter(element: Element): void {
    if (enteringRevisions.get(element) !== albumRouteRevision) return
    isAlbumDetailEntering.value = false
    albumDetailColorReady.value = true
    isAlbumRouteTransitioning.value = false
    void restoreRouteFocus(albumRouteRevision)
  }

  function onTransitionEnterCancelled(element: Element): void {
    if (enteringRevisions.get(element) !== albumRouteRevision) return
    albumDetailEntryTransition.cancel()
    isAlbumDetailEntering.value = false
    albumDetailColorReady.value = true
    isAlbumRouteTransitioning.value = false
    void restoreRouteFocus(albumRouteRevision)
  }

  // The shell calls this before disposing layout transitions, matching App's teardown order.
  function dispose(): void {
    removeBeforeEach()
    removeAfterEach()
    albumRouteRevision += 1
    shouldRestoreRouteFocus = false
    albumDetailEntryTransition.cancel()
    isAlbumDetailEntering.value = false
    albumDetailColorReady.value = true
    isAlbumRouteTransitioning.value = false
  }
  return {
    cdIndexSlideDirection,
    isAlbumDetailEntering,
    albumDetailColorReady,
    isAlbumRouteTransitioning,
    albumDetailTransitionHooks,
    transitionName,
    onTransitionBeforeEnter,
    onTransitionEnter,
    onTransitionBeforeLeave,
    restoreLeavingInteractivity,
    onTransitionAfterEnter,
    onTransitionEnterCancelled,
    dispose,
  }
}
