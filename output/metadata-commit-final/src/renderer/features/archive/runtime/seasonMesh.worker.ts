import { createSeasonMeshRenderer } from './seasonMeshRenderer'
import type { SeasonMeshRequest, SeasonMeshResponse } from './seasonMeshProtocol'

let runtime: ReturnType<typeof createSeasonMeshRenderer> | undefined
let failed = false

function reply(message: SeasonMeshResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer })
}
function fail(cause: unknown) {
  if (failed) return
  failed = true
  runtime?.dispose()
  runtime = undefined
  reply({ type: 'error', message: cause instanceof Error ? cause.message : String(cause) })
}

self.onmessage = (event: MessageEvent<SeasonMeshRequest>) => {
  if (failed) return
  const message = event.data
  try {
    switch (message.type) {
      case 'init':
        runtime = createSeasonMeshRenderer(
          message.canvas,
          message.layout,
          message.wash,
          fail,
          message.elapsed,
        )
        reply({ type: 'ready' })
        break
      case 'layout':
        runtime?.resize(message.layout)
        break
      case 'appearance':
        runtime?.setAppearance(message.wash)
        break
      case 'playing':
        runtime?.setPlaying(message.value)
        break
      case 'snapshot': {
        const frame = runtime?.snapshot()
        if (frame) reply({ type: 'snapshot', ...frame }, [frame.bitmap])
        runtime?.dispose()
        runtime = undefined
        self.close()
        break
      }
    }
  } catch (cause) {
    fail(cause)
  }
}
