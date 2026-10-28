import {
  computed,
  inject,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  provide,
  readonly,
  ref,
  shallowRef,
  watch,
  type InjectionKey,
  type Ref,
} from 'vue'
import { useRoute } from 'vue-router'
import type { SongFontWeightView } from '../constants/songFontWeights'

export type PageParameterContext = { kind: 'songs'; view: SongFontWeightView } | { kind: 'albums' }

const routeFor = (kind: PageParameterContext['kind']) => (kind === 'songs' ? 'library' : 'albums')

/** The shell owns visibility; pages publish their actual view without duplicating it. */
export function createPageParameters(
  routeName: Readonly<Ref<unknown>>,
  blocked: Readonly<Ref<boolean>>,
) {
  const open = ref(false)
  const source = shallowRef<{ owner: symbol; context: PageParameterContext } | null>(null)
  let trigger: HTMLElement | null = null
  const supported = computed(
    () => !blocked.value && ['library', 'albums'].includes(String(routeName.value)),
  )
  const context = computed(() => {
    const current = source.value?.context
    return current && routeName.value === routeFor(current.kind) ? current : null
  })
  function close(restoreFocus = true) {
    if (!open.value) return
    open.value = false
    if (restoreFocus)
      void nextTick(() => {
        if (
          !open.value &&
          trigger?.isConnected &&
          !trigger.matches(':disabled, [aria-disabled="true"]') &&
          !trigger.closest('[inert]')
        ) {
          trigger.focus({ preventScroll: true })
        }
      })
  }
  watch(
    supported,
    (available) => {
      if (!available) close(false)
    },
    { flush: 'sync' },
  )
  return {
    open: readonly(open),
    supported,
    context,
    toggle(element: HTMLElement) {
      trigger = element
      if (open.value) close()
      else if (supported.value && context.value) open.value = true
    },
    close,
    publish(owner: symbol, value: PageParameterContext) {
      if (routeName.value === routeFor(value.kind)) source.value = { owner, context: value }
    },
    release(owner: symbol) {
      if (source.value?.owner === owner) source.value = null
    },
  }
}

export type PageParameters = ReturnType<typeof createPageParameters>
const key: InjectionKey<PageParameters> = Symbol('page-parameters')
export function providePageParameters(controller: PageParameters) {
  provide(key, controller)
}
export function usePageParameters() {
  return inject(key, null)
}

export function usePageParameterSource(
  kind: PageParameterContext['kind'],
  view?: Readonly<Ref<SongFontWeightView>>,
) {
  const controller = usePageParameters()
  if (!controller) return
  const route = useRoute()
  const owner = Symbol(kind)
  const active = ref(false)
  const release = () => {
    active.value = false
    controller.release(owner)
  }
  onMounted(() => {
    active.value = true
  })
  onActivated(() => {
    active.value = true
  })
  onDeactivated(release)
  onBeforeUnmount(release)
  // Outgoing transition instances must never publish again on a later return.
  watch(
    () => route.name,
    (name) => {
      if (name !== routeFor(kind)) release()
    },
    { flush: 'sync' },
  )
  watch(
    [active, () => view?.value],
    () => {
      if (active.value)
        controller.publish(
          owner,
          kind === 'albums' ? { kind } : { kind, view: view?.value ?? 'list' },
        )
    },
    { flush: 'sync' },
  )
}
