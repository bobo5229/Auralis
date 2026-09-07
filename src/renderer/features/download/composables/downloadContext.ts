import { inject, provide, type InjectionKey } from 'vue'
import { useAmdlDownload, type UseAmdlDownloadOptions, type UseAmdlDownloadReturn } from './useAmdlDownload'

export const AMDL_DOWNLOAD_KEY: InjectionKey<UseAmdlDownloadReturn> = Symbol('AMDL_DOWNLOAD_KEY')

/**
 * 在顶层 (App.vue) 提供唯一的 AMDL 下载控制器，生命周期绑定 App session
 */
export function provideAmdlDownload(optionsOrInstance?: UseAmdlDownloadOptions | UseAmdlDownloadReturn): UseAmdlDownloadReturn {
  // 如果传入的已经是 UseAmdlDownloadReturn（例如测试直接注入或外部创建），则直接复用
  const instance =
    optionsOrInstance && 'currentTaskId' in optionsOrInstance
      ? optionsOrInstance
      : useAmdlDownload(optionsOrInstance)

  provide(AMDL_DOWNLOAD_KEY, instance)
  return instance
}

/**
 * 在下游页面或组件中消费 AMDL 下载控制器
 */
export function useProvidedAmdlDownload(): UseAmdlDownloadReturn {
  const context = inject(AMDL_DOWNLOAD_KEY, null)
  if (!context) {
    throw new Error('useProvidedAmdlDownload must be used within a provideAmdlDownload scope')
  }
  return context
}
