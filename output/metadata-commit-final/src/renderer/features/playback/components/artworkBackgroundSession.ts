interface ArtworkRenderer {
  setAlbum(image: HTMLImageElement): Promise<void>
  pause(): void
  dispose(): void
}

/** AMLL 的异步纹理提交不能取消：串行提交，并在最后一次提交结束后释放 GPU 资源。 */
export function createArtworkBackgroundSession(renderer: ArtworkRenderer) {
  let closed = false
  let version = 0
  let pending: Promise<void> | null = null

  return {
    setAlbum(image: HTMLImageElement): Promise<void> {
      if (closed) return Promise.resolve()
      const request = ++version
      const commit = async (): Promise<void> => {
        if (closed || request !== version) return
        await renderer.setAlbum(image)
      }
      const operation = pending ? pending.then(commit) : commit()
      const settled = operation.catch(() => undefined)
      pending = settled
      void settled.then(() => {
        if (pending === settled) pending = null
      })
      return operation
    },
    cancelPendingAlbum(): void {
      version += 1
    },
    dispose(): void {
      if (closed) return
      closed = true
      renderer.pause()
      if (pending) {
        void pending.then(() => renderer.dispose())
      } else {
        renderer.dispose()
      }
    },
  }
}
