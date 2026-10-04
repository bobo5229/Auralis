export const UI_LOCALES = ['zh-Hans', 'en'] as const
export type UiLocale = (typeof UI_LOCALES)[number]
export const DEFAULT_UI_LOCALE: UiLocale = 'zh-Hans'
export const UI_LOCALE_STORAGE_KEY = 'auralis-locale'

export function isUiLocale(value: unknown): value is UiLocale {
  return value === 'zh-Hans' || value === 'en'
}

// Small bootstrap/native vocabulary; available before the Vue application loads.
export const nativeUiMessages = {
  'zh-Hans': {
    startupTitle: 'Auralis 启动失败',
    startupRetry: '请关闭应用后重试。',
    selectFolder: '选择音乐文件夹',
    exportBackup: '导出数据库备份',
    restoreBackup: '选择要恢复的数据库备份',
    backupFilter: 'Auralis 数据库备份',
    previous: '上一首',
    play: '播放',
    pause: '暂停',
    next: '下一首',
    newPlaylist: '新建歌单',
    recentAdded: '最近添加',
  },
  en: {
    startupTitle: 'Auralis failed to start',
    startupRetry: 'Close the app and try again.',
    selectFolder: 'Choose Music Folder',
    exportBackup: 'Export Database Backup',
    restoreBackup: 'Choose Database Backup to Restore',
    backupFilter: 'Auralis Database Backup',
    previous: 'Previous track',
    play: 'Play',
    pause: 'Pause',
    next: 'Next track',
    newPlaylist: 'New playlist',
    recentAdded: 'Recently added',
  },
} satisfies Record<UiLocale, Record<string, string>>
