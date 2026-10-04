import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { getWindowVisibility, observeWindowVisibility } from './windowVisibility'

describe('window visual visibility', () => {
  it('reports minimize, restore, hide and show independently of background throttling', () => {
    let visible = true
    let minimized = false
    let destroyed = false
    const send = vi.fn()
    const window = Object.assign(new EventEmitter(), {
      isVisible: () => visible,
      isMinimized: () => minimized,
      isDestroyed: () => destroyed,
      webContents: { isDestroyed: () => destroyed, send },
    })
    const target = window as unknown as BrowserWindow
    const dispose = observeWindowVisibility(target)
    expect(getWindowVisibility(target)).toEqual({ isVisible: true })
    minimized = true
    window.emit('minimize')
    expect(send).toHaveBeenLastCalledWith('window:visibility-changed', { isVisible: false })
    minimized = false
    window.emit('restore')
    expect(send).toHaveBeenLastCalledWith('window:visibility-changed', { isVisible: true })
    visible = false
    window.emit('hide')
    expect(send).toHaveBeenLastCalledWith('window:visibility-changed', { isVisible: false })
    visible = true
    window.emit('show')
    expect(send).toHaveBeenLastCalledWith('window:visibility-changed', { isVisible: true })
    destroyed = true
    window.emit('hide')
    expect(send).toHaveBeenCalledTimes(4)
    dispose()
    expect(window.eventNames()).toEqual([])
  })
})
