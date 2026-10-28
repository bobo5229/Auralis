type FrameCallback = (time: number) => void

const callbacks = new Set<FrameCallback>()
let animationFrameId: number | null = null

function tick(time: number): void {
  animationFrameId = null
  for (const callback of [...callbacks]) callback(time)
  if (callbacks.size > 0) animationFrameId = requestAnimationFrame(tick)
}

export function subscribeVisualFrame(callback: FrameCallback): () => void {
  callbacks.add(callback)
  if (animationFrameId === null) animationFrameId = requestAnimationFrame(tick)

  return () => {
    callbacks.delete(callback)
    if (callbacks.size === 0 && animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
  }
}
