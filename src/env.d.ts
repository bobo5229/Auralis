/// <reference types="vite/client" />

import type { AuralisApi } from './shared/ipc/api'

declare global {
  interface Window {
    auralis: AuralisApi
  }
}
