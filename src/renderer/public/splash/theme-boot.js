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
  var AURALIS_DARK_ACCENT_STORAGE_KEY = 'auralis-dark-accent'
  var AURALIS_DARK_ACCENT_DEFAULT = '#F472B6'
  var AURALIS_DARK_SURFACE_HEXES = ['#121212', '#1A1A1A', '#202020', '#262626']
  var AURALIS_DARK_TINT_STRENGTHS = [0.12, 0.16, 0.28]
  var AURALIS_DARK_TEXT_TINT_STRENGTHS = [0.12, 0.16]

  function normalizeDarkAccent(value) {
    if (typeof value !== 'string') return null
    var normalized = value.trim().toUpperCase()
    return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : null
  }

  function rgbFromHex(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    }
  }

  function toLinearSrgb(channel) {
    var normalized = channel / 255
    return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
  }

  function relativeLuminance(color) {
    return (
      0.2126 * toLinearSrgb(color.r) +
      0.7152 * toLinearSrgb(color.g) +
      0.0722 * toLinearSrgb(color.b)
    )
  }

  function contrastRatio(first, second) {
    var firstLuminance = relativeLuminance(first)
    var secondLuminance = relativeLuminance(second)
    var lighter = Math.max(firstLuminance, secondLuminance)
    var darker = Math.min(firstLuminance, secondLuminance)
    return (lighter + 0.05) / (darker + 0.05)
  }

  function mixAccentOverSurface(accent, surface, strength) {
    return {
      r: Math.round(accent.r * strength + surface.r * (1 - strength)),
      g: Math.round(accent.g * strength + surface.g * (1 - strength)),
      b: Math.round(accent.b * strength + surface.b * (1 - strength)),
    }
  }

  function mixTowardWhite(source, amount) {
    return {
      r: Math.round(source.r + (255 - source.r) * amount),
      g: Math.round(source.g + (255 - source.g) * amount),
      b: Math.round(source.b + (255 - source.b) * amount),
    }
  }

  function toHex(color) {
    function channel(value) {
      return Math.round(value).toString(16).padStart(2, '0').toUpperCase()
    }
    return '#' + channel(color.r) + channel(color.g) + channel(color.b)
  }

  function isReadableAccent(candidate, surfaces) {
    for (var surfaceIndex = 0; surfaceIndex < surfaces.length; surfaceIndex += 1) {
      if (contrastRatio(candidate, surfaces[surfaceIndex]) < 4.5) return false
    }

    for (var tintIndex = 0; tintIndex < AURALIS_DARK_TINT_STRENGTHS.length; tintIndex += 1) {
      var strength = AURALIS_DARK_TINT_STRENGTHS[tintIndex]
      var contrastTarget = AURALIS_DARK_TEXT_TINT_STRENGTHS.indexOf(strength) !== -1 ? 4.5 : 3
      for (var stateSurfaceIndex = 0; stateSurfaceIndex < surfaces.length; stateSurfaceIndex += 1) {
        var composite = mixAccentOverSurface(candidate, surfaces[stateSurfaceIndex], strength)
        if (contrastRatio(candidate, composite) < contrastTarget) return false
      }
    }
    return true
  }

  function resolveDarkAccent(source) {
    var sourceRgb = rgbFromHex(source)
    var display = source
    var surfaces = AURALIS_DARK_SURFACE_HEXES.map(rgbFromHex)
    for (var step = 0; step <= 100; step += 1) {
      var candidate = mixTowardWhite(sourceRgb, step / 100)
      if (isReadableAccent(candidate, surfaces)) {
        display = toHex(candidate)
        break
      }
    }

    var displayRgb = rgbFromHex(display)
    var darkForeground = rgbFromHex('#121212')
    var lightForeground = rgbFromHex('#FFFFFF')
    var onAccent =
      contrastRatio(darkForeground, displayRgb) >= contrastRatio(lightForeground, displayRgb)
        ? '#121212'
        : '#FFFFFF'
    return { source: source, display: display, onAccent: onAccent }
  }

  var theme = AURALIS_THEME_DEFAULT
  try {
    var stored = window.localStorage.getItem(AURALIS_THEME_STORAGE_KEY)
    if (AURALIS_THEME_VALUES.indexOf(stored) !== -1) {
      theme = stored
    }
  } catch {
    // 存储不可用（受限上下文）时沿用默认深色，与 useTheme 的回退行为一致。
  }

  var darkAccent = AURALIS_DARK_ACCENT_DEFAULT
  try {
    var storedAccent = window.localStorage.getItem(AURALIS_DARK_ACCENT_STORAGE_KEY)
    darkAccent = normalizeDarkAccent(storedAccent) || AURALIS_DARK_ACCENT_DEFAULT
  } catch {
    // 强调色读取失败只影响本次显示，不覆盖无效或不可访问的存储值。
  }
  var resolvedAccent = resolveDarkAccent(darkAccent)

  var root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  root.style.setProperty('--auralis-dark-accent-source', resolvedAccent.source)
  root.style.setProperty('--auralis-dark-accent', resolvedAccent.display)
  root.style.setProperty('--auralis-dark-on-accent', resolvedAccent.onAccent)
  // 强制刷新同样属于 reload，在模块加载前隐藏开屏，避免首帧闪现。
  var navigation = window.performance.getEntriesByType('navigation')[0]
  if (navigation && navigation.type === 'reload') {
    root.dataset.splashSkipped = 'true'
  }
})()
