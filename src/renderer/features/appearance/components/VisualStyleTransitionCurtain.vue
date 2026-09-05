<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useVisualStyle, type VisualStyle } from '../composables/useVisualStyle'

/**
 * 方案三：古典乐谱展卷 / 垂幕覆叠 (Curtain Unfurl) 过渡层
 * 遵守 docs/rules/renderer.md:
 * 1. 不 remount 主界面核心组件（AppSidebar, RouterView, PlayerBar 等）。
 * 2. 动画运行在独立的临时 Overlay 上，仅在切换发生时激活。
 * 3. 动画完成后（或卸载时）立即销毁 Overlay DOM，确保 100% 不阻挡鼠标事件。
 * 4. 遵守 prefers-reduced-motion 系统减弱动画偏好。
 */
const props = withDefaults(
  defineProps<{
    /** 慢速动画时长（毫秒），默认 1300ms */
    duration?: number
  }>(),
  {
    duration: 1300,
  },
)

const { visualStyle } = useVisualStyle()

type TransitionState = 'idle' | 'unfurl-to-manuscript' | 'reveal-to-modern'

const transitionState = ref<TransitionState>('idle')
const isActive = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

// 监听视觉风格变化
watch(
  visualStyle,
  (newStyle: VisualStyle, oldStyle: VisualStyle | undefined) => {
    // 首次挂载初始化时，不播放转场动画
    if (oldStyle === undefined || newStyle === oldStyle) return

    // 检查用户系统是否偏好减少动态效果
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    clearTimer()
    isActive.value = true

    if (newStyle === 'manuscript') {
      // Modern -> Manuscript: 羊皮纸从屏幕顶端向下滑动铺平展开
      transitionState.value = 'unfurl-to-manuscript'
    } else {
      // Manuscript -> Modern: 羊皮纸向上收卷退场，露出底层现代深色界面
      transitionState.value = 'reveal-to-modern'
    }

    // 动画结束清理
    timer = setTimeout(() => {
      transitionState.value = 'idle'
      isActive.value = false
      timer = null
    }, props.duration)
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  clearTimer()
})
</script>

<template>
  <div
    v-if="isActive"
    class="visual-style-curtain-overlay"
    :class="`is-${transitionState}`"
    :style="{ '--curtain-duration': `${duration}ms` }"
    aria-hidden="true"
  >
    <!-- 展开/收起的手稿纸质幕布 -->
    <div class="curtain-sheet">
      <!-- 羊皮纸微质感暗线与暗花纹理模拟 -->
      <div class="curtain-sheet__texture"></div>
      <!-- 纸张展开下沿的物理折痕与漫反射投影 -->
      <div class="curtain-sheet__edge"></div>
    </div>
  </div>
</template>

<style scoped>
.visual-style-curtain-overlay {
  position: absolute;
  inset: 0;
  z-index: 999;
  pointer-events: none;
  overflow: hidden;
  contain: strict;
}

/* 羊皮纸手稿幕布 */
.curtain-sheet {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  background: #f4efdf;
  transform: translateY(-100%);
  will-change: transform;
}

/* 模拟古典羊皮纸的轻微纤维微光渐变 */
.curtain-sheet__texture {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 20%, rgba(255, 255, 255, 0.45) 0%, transparent 70%),
    linear-gradient(180deg, rgba(236, 229, 211, 0.2) 0%, rgba(223, 214, 192, 0.4) 100%);
  pointer-events: none;
}

/* 展开底沿：带有羊皮纸厚度的物理受光边框与向下的立体柔和阴影 */
.curtain-sheet__edge {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(48, 43, 37, 0.25);
  box-shadow:
    0 16px 36px rgba(40, 32, 22, 0.45),
    0 6px 14px rgba(40, 32, 22, 0.25),
    0 1px 3px rgba(48, 43, 37, 0.35);
}

/* 状态 1：Modern -> Manuscript（羊皮纸从顶端垂下展开） */
.is-unfurl-to-manuscript .curtain-sheet {
  animation: curtainUnfurlDown var(--curtain-duration) cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes curtainUnfurlDown {
  0% {
    transform: translateY(-100%);
    opacity: 0.95;
  }
  15% {
    opacity: 1;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

/* 状态 2：Manuscript -> Modern（羊皮纸向上收回，露出底层现代界面） */
.is-reveal-to-modern .curtain-sheet {
  animation: curtainRollBackUp var(--curtain-duration) cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

@keyframes curtainRollBackUp {
  0% {
    transform: translateY(0);
    opacity: 1;
  }
  85% {
    opacity: 0.98;
  }
  100% {
    transform: translateY(-100%);
    opacity: 0.8;
  }
}

@media (prefers-reduced-motion: reduce) {
  .visual-style-curtain-overlay {
    display: none !important;
  }
}
</style>
