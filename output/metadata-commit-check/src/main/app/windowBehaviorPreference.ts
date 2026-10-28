import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isWindowCloseBehavior, type WindowCloseBehavior } from '@shared/types/windowBehavior'

export function createWindowBehaviorPreference(
  userDataPath: string,
  reportError: (error: unknown) => void,
) {
  const file = join(userDataPath, 'window-preferences.json')
  let behavior: WindowCloseBehavior = 'quit'
  try {
    const saved: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (saved && typeof saved === 'object' && 'closeBehavior' in saved) {
      if (isWindowCloseBehavior(saved.closeBehavior)) behavior = saved.closeBehavior
      // Legacy minimize-on-close preferences retain their background-playback intent.
      else if (saved.closeBehavior === 'minimize') behavior = 'tray'
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') reportError(error)
  }

  return {
    get: () => behavior,
    set(value: WindowCloseBehavior): void {
      if (!isWindowCloseBehavior(value)) throw new Error('Invalid window close behavior')
      const temporary = `${file}.${process.pid}.tmp`
      try {
        mkdirSync(userDataPath, { recursive: true })
        writeFileSync(temporary, JSON.stringify({ closeBehavior: value }), {
          encoding: 'utf8',
          flag: 'w',
        })
        renameSync(temporary, file)
        behavior = value
      } catch (error) {
        try {
          rmSync(temporary, { force: true })
        } catch (cleanupError) {
          reportError(cleanupError)
        }
        reportError(error)
        throw new Error('Could not save window close behavior')
      }
    },
  }
}
