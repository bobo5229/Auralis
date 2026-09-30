/*
 * 开屏首帧主题引导：在首次绘制前按上次退出时的主题设置根节点 data-theme 与 color-scheme。
 * 有效值规则须与 src/renderer/composables/useTheme.ts 保持一致，
 * 一致性由 src/renderer/app/splash/splashContract.test.ts 检查。
 * 同步经典脚本，不得改为 type="module"（module 会延迟到解析完成后执行）。
 */
;(function () {
  var AURALIS_THEME_STORAGE_KEY = 'auralis-theme'
  var AURALIS_THEME_VALUES = ['light', 'dark']
  var AURALIS_THEME_DEFAULT = 'dark'

  var theme = AURALIS_THEME_DEFAULT
  try {
    var stored = window.localStorage.getItem(AURALIS_THEME_STORAGE_KEY)
    if (AURALIS_THEME_VALUES.indexOf(stored) !== -1) {
      theme = stored
    }
  } catch {
    // 存储不可用（受限上下文）时沿用默认深色，与 useTheme 的回退行为一致。
  }

  var root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
})()
