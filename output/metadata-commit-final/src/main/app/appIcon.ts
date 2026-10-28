import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function resolveAppIconPath(): string | undefined {
  return [
    join(process.resourcesPath, 'icons', 'icon.png'),
    join(app.getAppPath(), 'resources', 'icons', 'icon.png'),
    join(__dirname, '../../resources/icons/icon.png'),
  ].find((candidate) => existsSync(candidate))
}
