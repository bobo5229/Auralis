import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

export const SIDEBAR_FLAVOR_MODES = [
  'simulation',
  'tips',
  'observation',
  'items',
  'effects',
  'quests',
  'lore',
  'warnings',
  'patches',
  'terminal',
] as const
export const SIDEBAR_FLAVOR_KEYS = SIDEBAR_FLAVOR_MODES.flatMap((mode) =>
  Array.from({ length: 15 }, (_, index) => `${mode}.${index + 1}`),
)
export const SIDEBAR_FLAVOR_INTERVAL = 15_000

/** Decorative copy rotates independently of the real library/scan status. */
export function useSidebarFlavor(
  enabled: Ref<boolean>,
  paused: Ref<boolean>,
  random: () => number = Math.random,
) {
  const bags = SIDEBAR_FLAVOR_MODES.map(() => [] as number[])
  const lastEntries = SIDEBAR_FLAVOR_MODES.map(() => -1)
  let previousMode = -1

  function nextKey(): string {
    const modes = SIDEBAR_FLAVOR_MODES.map((_, index) => index).filter(
      (index) => index !== previousMode,
    )
    const mode = modes[Math.floor(random() * modes.length)]!
    const bag = bags[mode]!
    if (bag.length === 0) {
      bag.push(...Array.from({ length: 15 }, (_, index) => index + 1))
      for (let index = bag.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1))
        ;[bag[index], bag[other]] = [bag[other]!, bag[index]!]
      }
      if (bag[bag.length - 1] === lastEntries[mode]) {
        ;[bag[0], bag[bag.length - 1]] = [bag[bag.length - 1]!, bag[0]!]
      }
    }
    const entry = bag.pop()!
    previousMode = mode
    lastEntries[mode] = entry
    return `${SIDEBAR_FLAVOR_MODES[mode]}.${entry}`
  }

  const key = ref(nextKey())
  const visible = ref(true)
  let mounted = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function stop(): void {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  function schedule(): void {
    stop()
    if (!mounted || !enabled.value || paused.value || !visible.value) return
    timer = setTimeout(() => {
      key.value = nextKey()
      schedule()
    }, SIDEBAR_FLAVOR_INTERVAL)
  }

  function syncVisibility(): void {
    visible.value = document.visibilityState !== 'hidden'
  }

  watch([enabled, paused, visible], schedule, { flush: 'sync' })
  onMounted(() => {
    mounted = true
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    schedule()
  })
  onBeforeUnmount(() => {
    mounted = false
    stop()
    document.removeEventListener('visibilitychange', syncVisibility)
  })

  return { key }
}
