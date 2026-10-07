import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import type { AuralisApi } from '@shared/ipc/api'
import {
  getSplashBrandCharFrame,
  getSplashMotionFrame,
  getSplashPlaceboCompletion,
  getSplashPlaceboProgress,
  SPLASH_FORMATION_MS,
} from './splashMotion'
import {
  APP_FAILED_EVENT,
  APP_HOST_ELEMENT_ID,
  APP_READY_EVENT,
  SPLASH_ELEMENT_ID,
} from './startupSignals'

/** 淡出时长，与 splash.css 中 `#splash.is-exiting` 的 transition 保持一致。 */
export const SPLASH_FADE_OUT_MS = 300

export type SplashTheme = 'light' | 'dark'

/**
 * 开屏生命周期的可注入环境。DOM 与浏览器设施只在这里接触，
 * 时序状态机（startSplashLifecycle）保持纯逻辑以便单元测试。
 */
export interface SplashEnvironment {
  isDocumentVisible(): boolean
  isAppReady(): boolean
  isReducedMotion(): boolean
  onVisibilityChange(listener: () => void): () => void
  onAppReady(listener: () => void): () => void
  requestFrame(callback: (now: number) => void): () => void
  now(): number
  renderMotion(elapsed: number): void
  renderProgress(progress: number): void
  startFadeOut(): void
  /** 移除开屏节点、解除主界面 inert 并交还焦点；由控制器保证只调用一次。 */
  finishSplash(): void
}

type SplashPhase = 'waiting' | 'moving' | 'formed' | 'fading' | 'finished'

/**
 * 开屏时序状态机：
 * - 计时从窗口实际可见开始（visibilitychange），不从模块加载或隐藏窗口中的动画开始。
 * - 普通模式在"Logo 成形"且"主界面就绪"后淡出；减少动态效果模式只等待就绪并直接切换。
 * - 淡出与节点移除各执行一次，退场结束取消帧回调、计时器与监听器。
 * 返回值用于外部提前终止（例如 pagehide）。
 */
export function startSplashLifecycle(env: SplashEnvironment): () => void {
  let phase: SplashPhase = 'waiting'
  const reducedMotion = env.isReducedMotion()
  const unsubscribers: Array<() => void> = []
  let startTime = 0
  let cancelFrame: (() => void) | null = null
  let fadeTimer: ReturnType<typeof setTimeout> | null = null

  const track = (unsubscribe: () => void): void => {
    unsubscribers.push(unsubscribe)
  }

  const stopFrameAndTimer = (): void => {
    cancelFrame?.()
    cancelFrame = null
    if (fadeTimer !== null) {
      clearTimeout(fadeTimer)
      fadeTimer = null
    }
  }

  const finish = (): void => {
    if (phase === 'finished') return
    phase = 'finished'
    stopFrameAndTimer()
    for (const unsubscribe of unsubscribers.splice(0)) unsubscribe()
    env.finishSplash()
  }

  const beginFade = (): void => {
    if (phase === 'fading' || phase === 'finished') return
    phase = 'fading'
    stopFrameAndTimer()
    const completionStart = env.now()
    const initialProgress = getSplashPlaceboProgress(completionStart - startTime)
    env.renderProgress(initialProgress)
    const completeProgress = (now: number): void => {
      const progress = getSplashPlaceboCompletion(now - completionStart, initialProgress)
      env.renderProgress(progress)
      cancelFrame = progress < 1 ? env.requestFrame(completeProgress) : null
    }
    cancelFrame = env.requestFrame(completeProgress)
    env.startFadeOut()
    fadeTimer = setTimeout(finish, SPLASH_FADE_OUT_MS)
  }

  const tryExit = (): void => {
    if (phase === 'fading' || phase === 'finished') return
    if (!env.isAppReady()) return
    if (reducedMotion) {
      if (!env.isDocumentVisible()) return
      // 两帧之间至少绘制一次静态 Logo；主界面可能在隐藏窗口中先就绪。
      phase = 'fading'
      cancelFrame = env.requestFrame(() => {
        cancelFrame = env.requestFrame(() => {
          cancelFrame = null
          finish()
        })
      })
      return
    }
    if (phase === 'formed') beginFade()
  }

  const step = (now: number): void => {
    if (phase !== 'moving' && phase !== 'formed') return
    const elapsed = Math.max(0, now - startTime)
    if (phase === 'moving') env.renderMotion(Math.min(SPLASH_FORMATION_MS, elapsed))
    env.renderProgress(getSplashPlaceboProgress(elapsed))
    if (phase === 'moving' && elapsed >= SPLASH_FORMATION_MS) {
      // 最后一帧使用标准品牌路径，完整 Logo 安静停留直到应用就绪。
      phase = 'formed'
      cancelFrame = null
    }
    if (phase === 'formed') tryExit()
    if (phase === 'moving' || (phase === 'formed' && elapsed < 1_200)) {
      cancelFrame = env.requestFrame(step)
    } else if (phase === 'formed') {
      // 已到等待平台，后续由就绪事件触发补满，不持续刷新静止的刻度。
      cancelFrame = null
    }
  }

  const beginMotion = (): void => {
    if (phase !== 'waiting' || reducedMotion) return
    phase = 'moving'
    startTime = env.now()
    env.renderMotion(0)
    env.renderProgress(0)
    cancelFrame = env.requestFrame(step)
  }

  track(
    env.onVisibilityChange(() => {
      if (env.isDocumentVisible()) {
        beginMotion()
        tryExit()
      }
    }),
  )
  track(env.onAppReady(tryExit))

  if (env.isDocumentVisible()) beginMotion()
  // 主界面可能在控制器就绪前已完成（__auralisAppReady 早已置位）。
  tryExit()

  return () => finish()
}

function readSplashTheme(): SplashTheme {
  const theme = document.documentElement.dataset.theme
  return theme === 'light' || theme === 'dark' ? theme : 'dark'
}

/** 启动壳就绪通知：经显式 Preload 暴露的通道发送，主进程据此对齐原生底色并显示窗口。 */
function notifySplashReady(theme: SplashTheme): void {
  try {
    const api = window.auralis as Partial<AuralisApi> | undefined
    api?.app?.splashReady?.({ theme })
  } catch {
    // Preload 不可用时由主进程的显示兜底接管。
  }
}

export function shouldPlaySplash(search: string, navigationType?: string): boolean {
  return navigationType !== 'reload' && new URLSearchParams(search).get('splash') !== '0'
}

export function initSplashController(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.__auralisSplashActive) return

  const splash = document.getElementById(SPLASH_ELEMENT_ID)
  const path = document.getElementById('splash-contour-path') as SVGPathElement | null
  const wave = document.getElementById('splash-resonance-path') as SVGPathElement | null
  const legs = ['splash-left-leg', 'splash-right-leg'].map(
    (id) => document.getElementById(id) as SVGPathElement | null,
  )
  const brand = document.getElementById('splash-brand')
  const appHost = document.getElementById(APP_HOST_ELEMENT_ID)
  if (!appHost) return
  const navigation = window.performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined
  if (!shouldPlaySplash(window.location.search, navigation?.type)) {
    splash?.remove()
    appHost.removeAttribute('inert')
    notifySplashReady(readSplashTheme())
    return
  }
  if (!splash || !path || !wave || !brand || legs.some((leg) => !leg)) return

  const reducedMotionQuery = createReducedMotionQuery()
  const reducedMotion = reducedMotionQuery.matches
  const legPaths = legs as SVGPathElement[]
  const lengths = legPaths.map((leg) => leg.getTotalLength())
  const brandChars = Array.from(brand.querySelectorAll<HTMLElement>('.splash-brand-char'))
  const progressTrack = document.getElementById('splash-progress')
  if (progressTrack) {
    const ticks = Array.from({ length: 22 }, () => document.createElement('span'))
    progressTrack.replaceChildren(...ticks)
  }
  const progressTicks = Array.from(progressTrack?.children ?? [])
  const renderProgress = (progress: number): void => {
    const activeCount = Math.round(progress * progressTicks.length)
    progressTicks.forEach((tick, index) => {
      tick.classList.toggle('is-active', index < activeCount)
      tick.classList.toggle('is-leading', index === activeCount - 1 && progress < 1)
    })
  }
  const renderMotion = (elapsed: number): void => {
    const state = getSplashMotionFrame(elapsed)
    path.style.opacity = state.joined ? '1' : '0'
    wave.setAttribute('d', state.wavePath)
    wave.style.opacity = String(state.waveOpacity)
    legPaths.forEach((leg, index) => {
      leg.style.opacity = !state.joined && elapsed > 200 ? '1' : '0'
      leg.style.strokeDasharray = String(lengths[index])
      leg.style.strokeDashoffset = String(lengths[index] * (1 - state.legProgress))
    })
    brandChars.forEach((char, index) => {
      const frame = getSplashBrandCharFrame(elapsed, index)
      char.style.opacity = String(frame.opacity)
      char.style.transform = `translateY(${frame.offset}px)`
      char.style.color = frame.accentPercent
        ? `color-mix(in srgb, var(--splash-accent) ${frame.accentPercent}%, var(--splash-text))`
        : 'var(--splash-text)'
    })
  }
  // 可见前准备首帧；减少动态效果保留 HTML 默认的完整静态 Logo。
  if (!reducedMotion) renderMotion(0)
  else renderProgress(1)
  const stop = startSplashLifecycle({
    isDocumentVisible: () => document.visibilityState === 'visible',
    isAppReady: () => window.__auralisAppReady === true,
    isReducedMotion: () => reducedMotion,
    onVisibilityChange: (listener) => {
      document.addEventListener('visibilitychange', listener)
      return () => document.removeEventListener('visibilitychange', listener)
    },
    onAppReady: (listener) => {
      window.addEventListener(APP_READY_EVENT, listener)
      return () => window.removeEventListener(APP_READY_EVENT, listener)
    },
    requestFrame: (callback) => {
      let cancelled = false
      const frameId = requestAnimationFrame((now) => {
        if (!cancelled) callback(now)
      })
      return () => {
        cancelled = true
        cancelAnimationFrame(frameId)
      }
    },
    now: () => performance.now(),
    renderMotion,
    renderProgress,
    startFadeOut: () => splash.classList.add('is-exiting'),
    finishSplash: () => {
      splash.remove()
      appHost.removeAttribute('inert')
      appHost.focus({ preventScroll: true })
    },
  })

  window.addEventListener('pagehide', () => stop(), { once: true })
  window.addEventListener(APP_FAILED_EVENT, () => stop(), { once: true })
  window.__auralisSplashActive = true
  notifySplashReady(readSplashTheme())
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  try {
    initSplashController()
  } catch {
    // 控制器未接管；main.ts 挂载成功后会移除开屏并解除 inert。
    window.__auralisSplashActive = false
  }
}
