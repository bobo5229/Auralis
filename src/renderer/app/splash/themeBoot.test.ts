import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

const script = readFileSync(new URL('../../public/splash/theme-boot.js', import.meta.url), 'utf8')

it.each(['navigate', 'reload', undefined])('sets first-frame splash visibility for %s', (type) => {
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: '' } }
  runInNewContext(script, {
    document: { documentElement: root },
    window: {
      localStorage: { getItem: () => 'light' },
      performance: { getEntriesByType: () => (type ? [{ type }] : []) },
    },
  })
  expect(root.dataset.theme).toBe('light')
  expect(root.style.colorScheme).toBe('light')
  expect(root.dataset.splashSkipped).toBe(type === 'reload' ? 'true' : undefined)
})
