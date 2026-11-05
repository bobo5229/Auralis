import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { h, nextTick, ssrContextKey } from 'vue'
import {
  shellTestDocument,
  shellTestRenderer,
  type ShellTestElement,
} from '@renderer/testUtils/rendererTestHost'
import DatabaseMaintenanceSettings from './DatabaseMaintenanceSettings.vue'
import AboutSettings from './AboutSettings.vue'

const api = vi.hoisted(() => ({
  getInfo: vi.fn(),
  exportBackup: vi.fn(),
  restoreBackup: vi.fn(),
  exportDiagnostics: vi.fn(),
}))
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { app: api, database: api } }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const mounted: Array<ReturnType<typeof shellTestRenderer.createApp>> = []
function text(node: ShellTestElement): string {
  return node.text + node.children.map(text).join('')
}
function findButton(label: string): ShellTestElement {
  const button = shellTestDocument.body
    .querySelectorAll('button')
    .find((node) => text(node) === label)
  if (!button) throw new Error(`missing ${label}`)
  return button
}
function statuses(): ShellTestElement[] {
  return shellTestDocument.body
    .querySelectorAll('[role]')
    .filter((node) => node.props.role === 'status')
}
async function settle() {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function click(button: ShellTestElement) {
  await (button.props.onClick as () => Promise<void>)()
  await settle()
}
function mount(component: typeof AboutSettings | typeof DatabaseMaintenanceSettings) {
  const app = shellTestRenderer.createApp({ render: () => h(component) })
  app.provide(ssrContextKey, { modules: new Set() })
  mounted.push(app)
  app.mount(shellTestDocument.body)
}
beforeEach(() => {
  vi.resetAllMocks()
  shellTestDocument.body.replaceChildren()
  api.getInfo.mockResolvedValue({ version: '1', databasePath: 'C:\\Music\\data.db' })
})
afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount())
  vi.unstubAllGlobals()
})

it('keeps backup and restore outcomes beside the action with stable button labels', async () => {
  api.exportBackup.mockResolvedValue({ status: 'saved' })
  api.restoreBackup.mockRejectedValue(new Error('failed'))
  mount(DatabaseMaintenanceSettings)
  await settle()
  const backup = findButton('settings.library.exportBackup')
  const restore = findButton('settings.library.restoreBackup')
  await click(backup)
  expect(text(backup)).toBe('settings.library.exportBackup')
  expect(statuses().some((node) => text(node) === 'settings.library.backupSaved')).toBe(true)
  await click(restore)
  const error = statuses().find((node) => text(node) === 'settings.library.restoreFailed')!
  expect(error).toBeDefined()
  expect(error.classList.contains('settings-status--error')).toBe(true)
  expect(text(restore)).toBe('settings.library.restoreBackup')
})

it('announces diagnostics results separately while leaving the action available', async () => {
  api.exportDiagnostics.mockResolvedValue({ status: 'cancelled' })
  mount(AboutSettings)
  await settle()
  const button = findButton('settings.about.exportDiagnostics')
  await click(button)
  expect(text(button)).toBe('settings.about.exportDiagnostics')
  expect(statuses().some((node) => text(node) === 'settings.about.diagnosticsCancelled')).toBe(true)
  api.exportDiagnostics.mockRejectedValue(new Error('failed'))
  await click(button)
  const error = statuses().find((node) => text(node) === 'settings.about.diagnosticsFailed')!
  expect(error.classList.contains('settings-status--error')).toBe(true)
})

it('shows copy success and a later failure without replacing the action label', async () => {
  const writeText = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('failed'))
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  mount(DatabaseMaintenanceSettings)
  await settle()
  const button = findButton('settings.library.copyPath')
  await click(button)
  expect(writeText).toHaveBeenCalledWith('C:\\Music\\data.db')
  expect(statuses().some((node) => text(node) === 'settings.library.copySuccess')).toBe(true)
  await click(button)
  const error = statuses().find((node) => text(node) === 'settings.library.copyFailed')!
  expect(error.classList.contains('settings-status--error')).toBe(true)
  expect(text(button)).toBe('settings.library.copyPath')
})
