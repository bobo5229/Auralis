import { ipcChannels } from '@shared/ipc/channels'
import type { BadgeAchievementRepository } from '../repositories/badgeAchievementRepository'
import type { IpcHandlerRegistrar } from './validatedIpcRegistrar'

export function registerBadgeAchievementIpcHandlers(
  registrar: IpcHandlerRegistrar,
  repository: Pick<BadgeAchievementRepository, 'getAchievements' | 'getEpoch' | 'record'>,
  changed: () => void,
) {
  registrar.handle(ipcChannels.archive.getBadgeAchievements, () => repository.getAchievements())
  registrar.handle(ipcChannels.playback.getListeningEpoch, () => repository.getEpoch())
  registrar.handle(ipcChannels.playback.recordListeningProgress, (_event, payload) => {
    const result = repository.record(payload)
    if (result.ok) changed()
    return result
  })
}
