export type SeasonMeshWash = readonly [red: number, green: number, blue: number, alpha: number]

export interface SeasonMeshLayout {
  width: number
  height: number
  pixelRatio: number
}

export type SeasonMeshRequest =
  | {
      type: 'init'
      canvas: OffscreenCanvas
      layout: SeasonMeshLayout
      wash: SeasonMeshWash
      elapsed: number
    }
  | { type: 'layout'; layout: SeasonMeshLayout }
  | { type: 'appearance'; wash: SeasonMeshWash }
  | { type: 'playing'; value: boolean }
  | { type: 'snapshot' }

export type SeasonMeshResponse =
  | { type: 'ready' }
  | { type: 'snapshot'; bitmap: ImageBitmap; elapsed: number }
  | { type: 'error'; message: string }
