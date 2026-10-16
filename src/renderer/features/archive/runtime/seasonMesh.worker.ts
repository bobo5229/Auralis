import { createSeasonMeshRenderer } from './seasonMeshRenderer'
import type { SeasonMeshRequest, SeasonMeshResponse } from './seasonMeshProtocol'

let runtime: ReturnType<typeof createSeasonMeshRenderer> | undefined
let failed = false

function reply(message: SeasonMeshResponse) {
  self.postMessage(message)
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
        runtime = createSeasonMeshRenderer(message.canvas, message.layout, message.wash, fail)
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
    }
  } catch (cause) {
    fail(cause)
  }
}
