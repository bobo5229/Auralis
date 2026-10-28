import { nextTick, ref, shallowRef, type Ref } from 'vue'
import { animateProgress } from '@renderer/shared/animation/motion'
import type { CdAlbumInfo } from '../types/cdAlbumInfo'

interface Options {
  currentAlbum: { readonly value: CdAlbumInfo | null }
  infoRef: Ref<HTMLElement | null>
  reducedMotion: () => boolean
  isDisposed: () => boolean
}

/** Owns cancellable information-panel phases; the page keeps its watch/lifecycle order. */
export function useCdInfoTransition(options: Options) {
  const displayedAlbum = shallowRef<CdAlbumInfo | null>(null)
  const infoSuppressed = ref(false)
  let cancelInfoAnimation: (() => void) | null = null
  let infoGeneration = 0

  function infoRows(): HTMLElement[] {
    return Array.from(
      options.infoRef.value?.querySelectorAll<HTMLElement>('.cd-info-title-row, .cd-info-row') ??
        [],
    )
  }

  function setInfoText(opacity: number, shift: number): void {
    options.infoRef.value
      ?.querySelectorAll<HTMLElement>('h1, .cd-info-count, dt, dd')
      .forEach((element) => {
        element.style.opacity = String(opacity)
        element.style.transform = `translateY(${shift}px)`
      })
  }

  function setInfoDividers(progress: number): void {
    options.infoRef.value?.style.setProperty('--cd-info-divider-progress', String(progress))
  }

  function clearInfoStyles(): void {
    infoRows().forEach((row) => {
      row.style.height = ''
      row.style.overflow = ''
    })
    setInfoText(1, 0)
    setInfoDividers(1)
  }

  function runInfoPhase(duration: number, update: (progress: number) => void): Promise<boolean> {
    return new Promise((resolve) => {
      const cancel = animateProgress(duration, update, () => {
        cancelInfoAnimation = null
        resolve(true)
      })
      cancelInfoAnimation = () => {
        cancel()
        resolve(false)
      }
    })
  }

  async function transitionInfo(album: CdAlbumInfo | null, entering = false): Promise<void> {
    const generation = ++infoGeneration
    cancelInfoAnimation?.()
    cancelInfoAnimation = null
    if (entering && album && !options.reducedMotion()) {
      clearInfoStyles()
      setInfoText(0, 4)
      setInfoDividers(0)
      displayedAlbum.value = album
      await nextTick()
      if (options.isDisposed() || generation !== infoGeneration || infoSuppressed.value) return
      setInfoText(0, 4)
      if (
        !(await runInfoPhase(240, (progress) => {
          setInfoText(progress, 4 * (1 - progress))
          setInfoDividers(progress)
        }))
      )
        return
      if (!options.isDisposed() && generation === infoGeneration) clearInfoStyles()
      return
    }
    const rows = infoRows()
    const oldHeights = rows.map((row) => row.getBoundingClientRect().height)
    if (!album || !displayedAlbum.value || !options.infoRef.value || options.reducedMotion()) {
      displayedAlbum.value = album
      clearInfoStyles()
      return
    }
    const opacity = Number(
      options.infoRef.value.querySelector<HTMLElement>('h1')?.style.opacity || 1,
    )
    const dividerProgress = Number(
      options.infoRef.value.style.getPropertyValue('--cd-info-divider-progress') || 1,
    )
    if (
      !(await runInfoPhase(100, (progress) => {
        setInfoText(opacity * (1 - progress), -4 * progress)
        setInfoDividers(dividerProgress * (1 - progress))
      }))
    )
      return
    if (options.isDisposed() || generation !== infoGeneration) return

    displayedAlbum.value = album
    await nextTick()
    if (options.isDisposed() || generation !== infoGeneration) return
    // Measure natural target heights while the new text is invisible, then animate
    // only the label's rows. The CD stage never participates in this layout change.
    clearInfoStyles()
    setInfoText(0, 4)
    setInfoDividers(0)
    const nextRows = infoRows()
    const nextHeights = nextRows.map((row) => row.getBoundingClientRect().height)
    nextRows.forEach((row, index) => {
      row.style.height = `${oldHeights[index] ?? nextHeights[index]}px`
      row.style.overflow = 'hidden'
    })
    if (
      !(await runInfoPhase(200, (progress) => {
        const eased = 1 - (1 - progress) ** 3
        nextRows.forEach((row, index) => {
          const from = oldHeights[index] ?? nextHeights[index]
          row.style.height = `${from + (nextHeights[index] - from) * eased}px`
        })
        const fade = Math.min(1, Math.max(0, (progress - 0.2) / 0.8))
        setInfoText(fade, 4 * (1 - fade))
        setInfoDividers(fade)
      }))
    )
      return
    if (!options.isDisposed() && generation === infoGeneration) clearInfoStyles()
  }

  function settleInfo(): void {
    ++infoGeneration
    cancelInfoAnimation?.()
    cancelInfoAnimation = null
    clearInfoStyles()
    displayedAlbum.value = options.currentAlbum.value
  }

  function setRapidBrowse(running: boolean): void {
    if (running) {
      ++infoGeneration
      cancelInfoAnimation?.()
      cancelInfoAnimation = null
      clearInfoStyles()
    }
    infoSuppressed.value = running
  }

  return { displayedAlbum, infoSuppressed, transitionInfo, settleInfo, setRapidBrowse }
}
