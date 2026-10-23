import { computed, nextTick, ref, watch } from 'vue'
import { usePageParameters, type PageParameterContext } from './usePageParameters'

/** Keep the search and parameter trigger together through pointer and focus handoffs. */
export function usePageSearchTools(kind: PageParameterContext['kind']) {
  const controller = usePageParameters()
  const focused = ref(false)
  const returningFocus = ref(false)
  const hasParameters = computed(() => controller?.context.value?.kind === kind)
  const keepVisible = computed(
    () =>
      focused.value || (hasParameters.value && (controller?.open.value || returningFocus.value)),
  )
  watch(
    () => controller?.open.value,
    async (open, wasOpen) => {
      if (open || !wasOpen) return
      returningFocus.value = true
      // close() restores focus on nextTick; release only after that handoff.
      await nextTick()
      await nextTick()
      returningFocus.value = false
    },
    { flush: 'sync' },
  )
  function onFocusIn() {
    focused.value = true
  }
  function onFocusOut(event: FocusEvent) {
    const target = event.relatedTarget
    if (target instanceof Node && (event.currentTarget as HTMLElement).contains(target)) return
    focused.value = false
  }
  return { hasParameters, keepVisible, onFocusIn, onFocusOut }
}
