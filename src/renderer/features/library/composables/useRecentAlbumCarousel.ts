import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'

/** Keep selection stable across library refreshes; restart the clock after manual navigation. */
export function useRecentAlbumCarousel(
  keys: Readonly<Ref<readonly string[]>>,
  enabled: Readonly<Ref<boolean>>,
) {
  const selected = ref<string | null>(null)
  const paused = ref(false)
  const index = computed(() => Math.max(0, keys.value.indexOf(selected.value ?? '')))
  const running = computed(() => enabled.value && !paused.value && keys.value.length > 1)
  let timer: ReturnType<typeof setTimeout> | undefined

  function schedule(): void {
    clearTimeout(timer)
    timer = undefined
    if (running.value) timer = setTimeout(() => move(1), 6000)
  }
  function move(direction: number): void {
    const count = keys.value.length
    if (!count) return
    selected.value = keys.value[(index.value + direction + count) % count]
    schedule()
  }
  watch(
    [keys, running],
    () => {
      if (!keys.value.includes(selected.value ?? '')) selected.value = keys.value[0] ?? null
      schedule()
    },
    { immediate: true },
  )
  onScopeDispose(() => clearTimeout(timer))
  return { index, paused, running, move }
}
