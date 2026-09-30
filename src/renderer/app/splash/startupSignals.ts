/*
 * 启动壳与 Vue 入口之间的一次性启动信号。
 * 开屏控制器（splashController.ts）与 main.ts 都引用本模块，
 * 避免事件名与窗口标志在两侧各自硬编码。
 */

declare global {
  interface Window {
    /** 开屏控制器已接管本窗口的开屏生命周期。 */
    __auralisSplashActive?: boolean
    /** 主界面已就绪（路由就绪、Vue 挂载并渲染一帧之后）。 */
    __auralisAppReady?: boolean
  }
}

export const APP_READY_EVENT = 'auralis:app-ready'
export const APP_FAILED_EVENT = 'auralis:app-failed'

export const SPLASH_ELEMENT_ID = 'splash'
export const APP_HOST_ELEMENT_ID = 'app'
