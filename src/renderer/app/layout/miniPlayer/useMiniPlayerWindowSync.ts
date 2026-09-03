import { onScopeDispose, ref } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import { getDefaultMiniPlayerBodySize } from '@shared/constants/miniPlayer'
import type { AuralisApi } from '@shared/ipc/api'
import type {
  MiniPlayerBodySize,
  MiniPlayerPopoverDirection,
  MiniPlayerWindowState,
} from '@shared/ipc/contracts'

type MiniPlayerWindowApi = Pick<
  AuralisApi['window'],
  | 'getMiniPlayerState'
  | 'onMiniPlayerStateChanged'
  | 'restoreFromMiniPlayer'
  | 'setMiniPlayerPopover'
>

export function isValidMiniPlayerBodySize(
  body: MiniPlayerBodySize | undefined,
): body is MiniPlayerBodySize {
  return Boolean(body?.coverSize && body.width && body.height)
}

export function useMiniPlayerWindowSync(windowApi: MiniPlayerWindowApi = auralis.window) {
  const bodySize = ref<MiniPlayerBodySize>(getDefaultMiniPlayerBodySize())
  const popoverDirection = ref<MiniPlayerPopoverDirection>('below')
  const popoverRegionHeight = ref(0)
  let unsubscribe: (() => void) | null = null
  let generation = 0
  let started = false

  function applyWindowState(state: MiniPlayerWindowState): void {
    popoverDirection.value = state.popover.direction
    popoverRegionHeight.value = state.popover.height
    if (isValidMiniPlayerBodySize(state.body)) {
      bodySize.value = {
        coverSize: state.body.coverSize,
        width: state.body.width,
        height: state.body.height,
      }
    }
  }

  function start(): void {
    if (started) return
    started = true
    const currentGeneration = ++generation

    void windowApi.getMiniPlayerState().then((state) => {
      if (started && generation === currentGeneration) applyWindowState(state)
    })
    unsubscribe = windowApi.onMiniPlayerStateChanged((state) => {
      if (started) applyWindowState(state)
    })
  }

  function stop(): void {
    if (!started) return
    started = false
    generation += 1
    unsubscribe?.()
    unsubscribe = null
  }

  async function setPopover(open: boolean, height: number): Promise<void> {
    const currentGeneration = generation
    const state = await windowApi.setMiniPlayerPopover({
      open,
      direction: popoverDirection.value,
      height,
    })
    if (started && generation === currentGeneration) applyWindowState(state)
  }

  function restoreMainWindow(): void {
    void windowApi.restoreFromMiniPlayer()
  }

  onScopeDispose(stop)

  return {
    bodySize,
    popoverDirection,
    popoverRegionHeight,
    start,
    stop,
    setPopover,
    restoreMainWindow,
  }
}
