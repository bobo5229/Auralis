import {
  computed,
  inject,
  onScopeDispose,
  provide,
  shallowRef,
  type ComputedRef,
  type InjectionKey,
} from 'vue'

export function createCdViewSwitchVisibility() {
  const source = shallowRef<ComputedRef<boolean> | null>(null)
  return {
    visible: computed(() => source.value?.value ?? false),
    register(visible: ComputedRef<boolean>): () => void {
      source.value = visible
      return () => {
        // An outgoing route must not clear a newer browse page's registration.
        if (source.value === visible) source.value = null
      }
    },
  }
}

const visibilityKey: InjectionKey<ReturnType<typeof createCdViewSwitchVisibility>> = Symbol(
  'cd-view-switch-visibility',
)

export function provideCdViewSwitchVisibility() {
  const context = createCdViewSwitchVisibility()
  provide(visibilityKey, context)
  return context.visible
}

export function useCdViewSwitchVisibility(visible: ComputedRef<boolean>): void {
  const context = inject(visibilityKey, null)
  if (context) onScopeDispose(context.register(visible))
}
