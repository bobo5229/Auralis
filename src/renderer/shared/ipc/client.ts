import type { AuralisApi } from '@shared/ipc/api'

// This client belongs to the main renderer entry, which receives the full preload API.
export const auralis = window.auralis as AuralisApi
