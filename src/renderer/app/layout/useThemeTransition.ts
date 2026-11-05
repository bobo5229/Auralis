import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'
import { useTheme } from '@renderer/features/appearance/composables/useTheme'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { parseSurfaceColor, planAlbumForeground } from './albumForegroundPlan'
import type { SurfaceColor } from '@renderer/shared/color/surfaceColor'

function opaqueForeground(color: SurfaceColor, background: SurfaceColor) {
  return {
    r: Math.round(color.r * color.a + background.r * (1 - color.a)),
    g: Math.round(color.g * color.a + background.g * (1 - color.a)),
    b: Math.round(color.b * color.a + background.b * (1 - color.a)),
  }
}

const DURATION = 220
const TOKENS = [
  '--auralis-text',
  '--auralis-text-muted',
  '--auralis-text-faint',
  '--auralis-text-subtle',
  '--auralis-sidebar-active-text',
  '--auralis-sidebar-brand-text',
  '--auralis-lyrics-active',
  '--auralis-lyrics-inactive',
]

/** Theme fades use composited paint layers; album color transitions retain their timeline. */
export function useThemeTransition(
  shell: Ref<HTMLElement | null>,
  location: () => string = () => '',
): void {
  const { theme } = useTheme()
  const motion = createReducedMotionQuery()
  let clear: (() => void) | undefined
  let generation = 0

  watch(
    theme,
    () => {
      const current = ++generation
      clear?.()
      const host = shell.value
      if (
        !host ||
        host.classList.contains('is-cd-albums') ||
        host.classList.contains('is-album-detail') ||
        host.classList.contains('is-lyrics-floating') ||
        host.classList.contains('has-album-detail-color')
      )
        return
      const root = document.documentElement
      const surfaces = [
        ...host.querySelectorAll<HTMLElement>(
          ':scope > .app-main, :scope > .app-sidebar, :scope > .now-playing-panel',
        ),
      ].filter((node) => node.getClientRects().length > 0)
      const snapshots = surfaces.map((node) => {
        const style = getComputedStyle(node)
        const background = style.backgroundColor
        const surface = parseSurfaceColor(background)
        return {
          node,
          background,
          foreground: Object.fromEntries(
            TOKENS.map((token) => {
              const value = style.getPropertyValue(token)
              const parsed = parseSurfaceColor(value)
              const color = parsed && surface ? opaqueForeground(parsed, surface) : null
              // Match the planner's serialization so an unchanged first step
              // does not invalidate the entire subtree (#hex -> rgb()).
              return [token, color ? `rgb(${color.r} ${color.g} ${color.b})` : value]
            }),
          ),
          saved: TOKENS.map((token) => ({
            token,
            value: node.style.getPropertyValue(token),
            priority: node.style.getPropertyPriority(token),
          })),
        }
      })
      // Hold the current foreground before the palette commit. Its replacement is
      // read from the shell, so sampling the new background does not require a
      // second full descendant invalidation just to restore readable text.
      for (const { node, foreground } of snapshots) {
        for (const [token, value] of Object.entries(foreground)) {
          if (value) node.style.setProperty(token, value)
        }
      }
      const timers: ReturnType<typeof setTimeout>[] = []
      const layers: HTMLElement[] = []
      const animations: Animation[] = []
      let frame: number | undefined
      root.dataset.themeTransition = 'true'
      for (const snapshot of snapshots) {
        const layer = document.createElement('span')
        layer.className = 'theme-transition-surface'
        layer.setAttribute('aria-hidden', 'true')
        layer.style.background = snapshot.background
        snapshot.node.append(layer)
        layers.push(layer)
      }
      const cleanup = () => {
        if (frame !== undefined) cancelAnimationFrame(frame)
        for (const timer of timers) clearTimeout(timer)
        for (const animation of animations) animation.cancel()
        for (const layer of layers) layer.remove()
        for (const { node, saved } of snapshots)
          for (const { token, value, priority } of saved) {
            if (value) node.style.setProperty(token, value, priority)
            else node.style.removeProperty(token)
          }
        delete root.dataset.themeTransition
        motion.removeEventListener('change', onMotionChange)
        if (clear === cleanup) clear = undefined
      }
      const onMotionChange = () => {
        if (motion.matches) cleanup()
      }
      clear = cleanup
      motion.addEventListener('change', onMotionChange)
      // The synchronous watcher runs before commitTheme updates the DOM palette.
      // Vue's next tick includes the theme commit and any dependent component updates.
      const start = () => {
        if (generation !== current || clear !== cleanup) return
        if (motion.matches) {
          // Resolve the new palette while transitions are disabled before removing the guard.
          void getComputedStyle(host).backgroundColor
          cleanup()
          return
        }
        const palette = getComputedStyle(host)
        const targetForeground = Object.fromEntries(
          TOKENS.map((token) => [token, palette.getPropertyValue(token)]),
        )
        const backdropColor = parseSurfaceColor(palette.getPropertyValue('--auralis-main-bg'))
        // Read all new colors before inserting layers or changing foreground tokens.
        const transitions = snapshots.map(({ node, background, foreground }) => {
          const style = getComputedStyle(node)
          const from = parseSurfaceColor(background)
          const to = parseSurfaceColor(style.backgroundColor)
          if (!from || !to || background === style.backgroundColor) return null
          const choices = Object.fromEntries(
            TOKENS.flatMap((token) => {
              const parsed = parseSurfaceColor(targetForeground[token])
              const target = parsed ? opaqueForeground(parsed, to) : null
              const preferred = parseSurfaceColor(foreground[token])
              return target && preferred ? [[token, { target, preferred }]] : []
            }),
          )
          const backdrop = backdropColor ?? to
          const steps = planAlbumForeground(from, to, backdrop, choices)
          return { node, steps }
        })
        const timelines: {
          node: HTMLElement
          steps: ReturnType<typeof planAlbumForeground>
          animation: Animation
          step: number
        }[] = []
        for (const [index, entry] of transitions.entries()) {
          if (!entry) continue
          const { node, steps } = entry
          const layer = layers[index]
          const animation = layer.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: DURATION,
            easing: 'ease',
            fill: 'forwards',
          })
          animations.push(animation)
          timelines.push({ node, steps, animation, step: -1 })
        }
        // Use the background animation's clock. Independent timers can fire on
        // either side of a painted frame and select text for the wrong surface.
        const updateForeground = () => {
          if (generation !== current || clear !== cleanup) return
          let running = false
          for (const timeline of timelines) {
            const time =
              typeof timeline.animation.currentTime === 'number'
                ? timeline.animation.currentTime
                : 0
            let step = Math.max(0, timeline.step)
            while (
              step + 1 < timeline.steps.length &&
              timeline.steps[step + 1].offset * DURATION <= time
            )
              step++
            if (step !== timeline.step) {
              for (const [token, value] of Object.entries(timeline.steps[step].colors)) {
                if (timeline.node.style.getPropertyValue(token) !== value)
                  timeline.node.style.setProperty(token, value)
              }
              timeline.step = step
            }
            if (time < DURATION) running = true
          }
          frame = running ? requestAnimationFrame(updateForeground) : undefined
        }
        updateForeground()
        timers.push(setTimeout(cleanup, DURATION + 32))
      }
      void nextTick(() => {
        if (generation !== current || clear !== cleanup) return
        if (motion.matches || document.hidden) return start()
        // Let Blink resolve the new palette and prepare the old-color layers in
        // one paint before reading it. A forced read in the commit microtask would
        // otherwise produce two full style passes in the click's first frame.
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(start)
        })
      })
    },
    { flush: 'sync' },
  )

  watch(
    location,
    () => {
      generation++
      clear?.()
    },
    { flush: 'sync' },
  )

  onBeforeUnmount(() => {
    generation++
    clear?.()
  })
}
