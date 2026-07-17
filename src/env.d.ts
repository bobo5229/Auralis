/// <reference types="vite/client" />

import type { RendererApi } from './shared/ipc/api'

declare global {
  interface Window {
    auralis: RendererApi
  }
}
