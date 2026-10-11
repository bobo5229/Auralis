import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createWindowBehaviorPreference } from './windowBehaviorPreference'

const directories: string[] = []
function directory(): string {
  const dir = mkdtempSync(join(tmpdir(), 'auralis-window-preference-'))
  directories.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('window behavior persistence', () => {
  it('defaults to quit for missing, invalid and unreadable preferences', () => {
    const dir = directory()
    const report = vi.fn()
    expect(createWindowBehaviorPreference(dir, report).get()).toBe('quit')
    expect(report).not.toHaveBeenCalled()
    const file = join(dir, 'window-preferences.json')
    for (const value of ['{', '{"closeBehavior":"hide"}', 'null']) {
      writeFileSync(file, value)
      expect(createWindowBehaviorPreference(dir, report).get()).toBe('quit')
    }
    rmSync(file)
    mkdirSync(file)
    expect(createWindowBehaviorPreference(dir, report).get()).toBe('quit')
    expect(report).toHaveBeenCalled()
  })

  it('atomically saves each choice and loads it in a new instance', () => {
    const dir = directory()
    const preference = createWindowBehaviorPreference(dir, vi.fn())
    for (const behavior of ['minimize', 'tray', 'quit'] as const) {
      preference.set(behavior)
      expect(preference.get()).toBe(behavior)
      expect(JSON.parse(readFileSync(join(dir, 'window-preferences.json'), 'utf8'))).toEqual({
        closeBehavior: behavior,
      })
      expect(createWindowBehaviorPreference(dir, vi.fn()).get()).toBe(behavior)
      expect(readdirSync(dir)).toEqual(['window-preferences.json'])
    }
  })

  it('keeps the previous choice and removes the temporary file when replacing fails', () => {
    const dir = directory()
    const preference = createWindowBehaviorPreference(dir, vi.fn())
    preference.set('minimize')
    const file = join(dir, 'window-preferences.json')
    rmSync(file)
    mkdirSync(file)
    expect(() => preference.set('tray')).toThrow('Could not save')
    expect(preference.get()).toBe('minimize')
    expect(readdirSync(dir)).toEqual(['window-preferences.json'])
  })
})
