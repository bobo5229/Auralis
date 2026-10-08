import type { AuralisApi } from '@shared/ipc/api'
import { browserPreviewApi } from './browserPreviewApi'

// The browser preview mode uses a local mock; desktop mode uses the typed preload API.
const isBrowserPreview = import.meta.env.MODE === 'browser-preview'

if (isBrowserPreview) {
  console.info(
    'Auralis browser preview: Electron APIs are mocked; local library and playback are unavailable.',
  )
}

export const auralis: AuralisApi = isBrowserPreview
  ? browserPreviewApi
  : (window.auralis as AuralisApi)
