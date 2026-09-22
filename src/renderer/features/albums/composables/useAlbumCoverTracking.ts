import { nextTick, onScopeDispose, watch, type Ref } from 'vue'

export function useAlbumCoverTracking(
  detailRootRef: Ref<HTMLElement | null>,
  coverStageRef: Ref<HTMLElement | null>,
  isEffectsActive: Readonly<Ref<boolean>>,
): void {
  let trackingFrame: number | null = null
  let pointerPosition: { x: number; y: number } | null = null
  let detailScrollTarget: HTMLElement | null = null
  let effectsBound = false
  let activationGenerationId = 0
  let disposed = false
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  const MAX_COVER_TILT_DEGREES = 12

  function resetCoverTracking(): void {
    pointerPosition = null
    if (trackingFrame !== null) {
      window.cancelAnimationFrame(trackingFrame)
      trackingFrame = null
    }

    const stage = coverStageRef.value
    if (!stage) return
    stage.style.removeProperty('--detail-cover-rotate-x')
    stage.style.removeProperty('--detail-cover-rotate-y')
    stage.style.removeProperty('--detail-cover-shift-x')
    stage.style.removeProperty('--detail-cover-shift-y')
    stage.style.removeProperty('--detail-cover-shadow-x')
    stage.style.removeProperty('--detail-cover-shadow-y')
  }

  function renderCoverTracking(): void {
    trackingFrame = null
    const stage = coverStageRef.value
    const pointer = pointerPosition
    if (!stage || !pointer || reducedMotionQuery.matches || disposed || !isEffectsActive.value) {
      return
    }

    const rect = stage.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const horizontalRange = Math.max(centerX, window.innerWidth - centerX, 1)
    const verticalRange = Math.max(centerY, window.innerHeight - centerY, 1)
    const xRatio = Math.min(1, Math.max(-1, (pointer.x - centerX) / horizontalRange))
    const yRatio = Math.min(1, Math.max(-1, (pointer.y - centerY) / verticalRange))

    stage.style.setProperty('--detail-cover-rotate-x', `${-yRatio * MAX_COVER_TILT_DEGREES}deg`)
    stage.style.setProperty('--detail-cover-rotate-y', `${xRatio * MAX_COVER_TILT_DEGREES}deg`)
    stage.style.setProperty('--detail-cover-shift-x', `${xRatio * 5}px`)
    stage.style.setProperty('--detail-cover-shift-y', `${yRatio * 5}px`)
    stage.style.setProperty('--detail-cover-shadow-x', `${-xRatio * 12}px`)
    stage.style.setProperty('--detail-cover-shadow-y', `${18 - yRatio * 10}px`)
  }

  function scheduleCoverTracking(): void {
    if (trackingFrame === null) {
      trackingFrame = window.requestAnimationFrame(renderCoverTracking)
    }
  }

  function onDocumentPointerMove(event: PointerEvent): void {
    if (event.pointerType === 'touch' || reducedMotionQuery.matches || !isEffectsActive.value) {
      return
    }
    pointerPosition = { x: event.clientX, y: event.clientY }
    scheduleCoverTracking()
  }

  function onDocumentPointerOut(event: PointerEvent): void {
    if (event.relatedTarget === null) {
      resetCoverTracking()
    }
  }

  function onReducedMotionChange(): void {
    if (reducedMotionQuery.matches) {
      resetCoverTracking()
    }
  }

  function bindDetailScrollListener(): void {
    const nextTarget = detailRootRef.value
    if (detailScrollTarget === nextTarget) return
    detailScrollTarget?.removeEventListener('scroll', scheduleCoverTracking)
    detailScrollTarget = nextTarget
    detailScrollTarget?.addEventListener('scroll', scheduleCoverTracking, { passive: true })
  }

  function unbindDetailScrollListener(): void {
    detailScrollTarget?.removeEventListener('scroll', scheduleCoverTracking)
    detailScrollTarget = null
  }

  async function enableCoverEffects(): Promise<void> {
    if (disposed || !isEffectsActive.value) return
    const activationGeneration = ++activationGenerationId

    if (!effectsBound) {
      effectsBound = true
      document.addEventListener('pointermove', onDocumentPointerMove, { passive: true })
      document.addEventListener('pointerout', onDocumentPointerOut)
      window.addEventListener('blur', resetCoverTracking)
      reducedMotionQuery.addEventListener('change', onReducedMotionChange)
    }

    await nextTick()
    if (
      disposed ||
      !isEffectsActive.value ||
      !effectsBound ||
      activationGeneration !== activationGenerationId
    ) {
      return
    }
    bindDetailScrollListener()
  }

  function disableCoverEffects(): void {
    activationGenerationId += 1
    resetCoverTracking()
    unbindDetailScrollListener()

    if (!effectsBound) return
    effectsBound = false
    document.removeEventListener('pointermove', onDocumentPointerMove)
    document.removeEventListener('pointerout', onDocumentPointerOut)
    window.removeEventListener('blur', resetCoverTracking)
    reducedMotionQuery.removeEventListener('change', onReducedMotionChange)
  }

  watch(
    [isEffectsActive, detailRootRef, coverStageRef],
    ([active]) => {
      if (active) void enableCoverEffects()
      else disableCoverEffects()
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    disposed = true
    disableCoverEffects()
  })
}
