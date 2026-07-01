import type { ArtworkPalette } from '../types'

export interface FluidRenderer {
  resize(width: number, height: number, dpr: number): void
  setPalette(palette: ArtworkPalette, startedAt: number): void
  render(time: number, motionScale: number): void
  dispose(): void
}
