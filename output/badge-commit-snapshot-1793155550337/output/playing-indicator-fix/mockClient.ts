import { browserPreviewApi } from '@renderer/shared/ipc/browserPreviewApi'
import { track } from './mockPlayback'
export const auralis = new Proxy(browserPreviewApi, { get(target, group) { if (group === 'library') return new Proxy(target.library, { get(lib, method) { return method === 'getTracks' ? async () => [track] : lib[method] } }); return target[group] } })
