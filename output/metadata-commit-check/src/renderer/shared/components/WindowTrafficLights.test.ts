import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, reactive } from 'vue'
import { ShellTestElement, shellTestRenderer } from '@renderer/testUtils/rendererTestHost'
import WindowTrafficLights from './WindowTrafficLights.vue'

const mocks = vi.hoisted(() => ({
  getMaximized: vi.fn(),
  onMaximizedChanged: vi.fn(),
  control: vi.fn(),
  unsubscribe: vi.fn(),
  error: vi.fn(),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: {
    window: {
      getMaximized: mocks.getMaximized,
      onMaximizedChanged: mocks.onMaximizedChanged,
      control: mocks.control,
    },
  },
}))
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { error: mocks.error },
}))

let stateChanged: (state: { isMaximized: boolean }) => void
const mounted: (() => void)[] = []
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getMaximized.mockResolvedValue({ isMaximized: false })
  mocks.control.mockResolvedValue({ isMaximized: false })
  mocks.onMaximizedChanged.mockImplementation((listener: typeof stateChanged) => {
    stateChanged = listener
    return mocks.unsubscribe
  })
})
afterEach(() => mounted.splice(0).forEach((unmount) => unmount()))

function mount() {
  const layout = reactive({ cdCanvas: false, sidebarFullHeight: false, sidebarCollapsed: false })
  const root = new ShellTestElement('root')
  const app = shellTestRenderer.createApp({ render: () => h(WindowTrafficLights, layout) })
  app.mount(root)
  const unmount = () => app.unmount()
  mounted.push(unmount)
  const controls = root.querySelector('.window-traffic-lights')!
  return { layout, controls, unmount }
}

describe('shared window controls', () => {
  it('keeps floating, full-height, collapsed and CD placement driven by caller state', async () => {
    const { layout, controls } = mount()
    expect(controls.classList.contains('window-traffic-lights--full-height')).toBe(false)
    layout.sidebarFullHeight = true
    await nextTick()
    expect(controls.classList.contains('window-traffic-lights--full-height')).toBe(true)
    layout.sidebarCollapsed = true
    await nextTick()
    expect(controls.classList.contains('window-traffic-lights--collapsed')).toBe(true)
    layout.cdCanvas = true
    await nextTick()
    expect(controls.classList.contains('window-traffic-lights--cd')).toBe(true)
    expect(controls.classList.contains('window-traffic-lights--full-height')).toBe(false)
    expect(controls.classList.contains('window-traffic-lights--collapsed')).toBe(false)
  })

  it('does not overwrite a newer state event with the initial window query', async () => {
    let resolveInitial!: (state: { isMaximized: boolean }) => void
    mocks.getMaximized.mockReturnValue(
      new Promise((resolve) => {
        resolveInitial = resolve
      }),
    )
    const { controls } = mount()
    stateChanged({ isMaximized: true })
    resolveInitial({ isMaximized: false })
    await nextTick()
    expect(controls.children[2].props['aria-label']).toBe('windowControls.restore')
    stateChanged({ isMaximized: false })
    await nextTick()
    expect(controls.children[2].props['aria-label']).toBe('windowControls.maximize')
  })

  it('sends the original actions and reflects successful control results', async () => {
    const { controls } = mount()
    await nextTick()
    for (const [index, action] of ['close', 'minimize', 'toggle-maximize'].entries()) {
      mocks.control.mockResolvedValueOnce({ isMaximized: action === 'toggle-maximize' })
      await (controls.children[index].props.onClick as () => Promise<void>)()
      expect(mocks.control).toHaveBeenLastCalledWith(action)
    }
    await nextTick()
    expect(controls.children[2].props['aria-label']).toBe('windowControls.restore')
  })

  it('reports query and control failures without rejecting a click', async () => {
    mocks.getMaximized.mockRejectedValueOnce(new Error('query failed'))
    mocks.control.mockRejectedValueOnce(new Error('control failed'))
    const { controls } = mount()
    await nextTick()
    await expect(
      (controls.children[1].props.onClick as () => Promise<void>)(),
    ).resolves.toBeUndefined()
    expect(mocks.error.mock.calls.map(([event]) => event.message)).toEqual([
      'Failed to read main window state',
      'Failed to minimize main window',
    ])
  })

  it('unsubscribes when its owner unmounts', () => {
    const { unmount } = mount()
    unmount()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })
})
