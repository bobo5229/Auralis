export type AmdlTaskState =
  | 'starting'
  | 'running'
  | 'completed'
  | 'already-exists'
  | 'failed'
  | 'cancelled'

export type AmdlDownloadMode = 'direct' | 'select'

export interface AmdlSelectableTrack {
  index: number
  title: string
  type: string
}

export interface AmdlSelectionRequest {
  taskId: string
  tracks: AmdlSelectableTrack[]
}

export type AmdlStage =
  | 'launching'
  | 'selecting'
  | 'preparing'
  | 'downloading'
  | 'processing'
  | 'finalizing'
  | null

export interface AmdlTaskProgress {
  taskId: string
  url: string
  state: AmdlTaskState
  stage: AmdlStage
  alreadyExists: boolean
  message: string | null
  error: string | null
  startedAt: string
  finishedAt: string | null
}

export interface AmdlLogEvent {
  taskId: string
  stream: 'stdout' | 'stderr'
  line: string
}
