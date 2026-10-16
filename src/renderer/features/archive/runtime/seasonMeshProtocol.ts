export type SeasonMeshWash = readonly [red: number, green: number, blue: number, alpha: number]

export interface SeasonMeshLayout {
  width: number
  height: number
  pixelRatio: number
}

export type SeasonMeshRequest =
  | { type: 'init'; canvas: OffscreenCanvas; layout: SeasonMeshLayout; wash: SeasonMeshWash }
  | { type: 'layout'; layout: SeasonMeshLayout }
  | { type: 'appearance'; wash: SeasonMeshWash }
  | { type: 'playing'; value: boolean }

export type SeasonMeshResponse = { type: 'ready' } | { type: 'error'; message: string }
