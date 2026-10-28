export function randomPatternSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0
}

// A small deterministic integer generator, used only for decorative geometry.
// Recreate it from the card's seed for every draw; never advance shared state.
function patternRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

export function createBackgroundVariation(seed: number) {
  const random = patternRandom(seed)
  const range = (min: number, max: number) => min + random() * (max - min)
  const flip = () => random() < 0.5
  return {
    glass: {
      flipX: flip(),
      tilt: range(-0.1, 0.1),
      glowX: range(540, 760),
      glowY: range(880, 1080),
      planes: Array.from({ length: 4 }, () => ({
        x: range(-85, 85),
        y: range(-140, 140),
        shear: range(-0.12, 0.12),
      })),
    },
    metal: {
      flipX: flip(),
      flipY: flip(),
      offsetY: range(-85, 75),
      bend: range(0.78, 1.2),
      width: range(0.84, 1.18),
      spacing: range(0.85, 1.15),
    },
    tunnel: {
      x: flip() ? range(40, 150) : range(570, 680),
      y: flip() ? range(70, 170) : range(862, 962),
      rotation: range(-0.25, 0.25),
      spacing: range(0.14, 0.2),
      stretch: range(0.86, 1.12),
      corner: range(245, 330),
    },
    aurora: {
      flipX: flip(),
      flipY: flip(),
      offsetY: range(-100, 70),
      firstBend: range(-90, 110),
      secondBend: range(-110, 90),
      width: range(0.8, 1.12),
      cloudX: range(-80, 120),
    },
    paper: {
      flipX: flip(),
      flipY: flip(),
      origin: range(210, 340),
      spacing: range(82, 110),
      amplitude: range(95, 155),
      frequency: range(205, 290),
      phase: range(-0.65, 0.65),
      layerPhase: range(0.22, 0.4),
      detail: range(18, 38),
      slope: range(-0.28, -0.08),
    },
    terrain: {
      x: flip() ? range(-30, 100) : range(620, 750),
      y: flip() ? range(-20, 100) : range(940, 1070),
      radius: range(570, 700),
      spacing: range(57, 70),
      stretch: range(0.68, 0.86),
      rotation: range(-0.55, 0.55),
      phase: range(0, Math.PI * 2),
      relief: range(0.09, 0.15),
      detail: range(0.04, 0.065),
    },
    flow: {
      flipX: flip(),
      flipY: flip(),
      origin: range(560, 720),
      spacing: range(140, 195),
      lineGap: range(3.2, 4.8),
      bias: range(-0.42, -0.22),
      waveX: range(0.45, 0.65),
      waveY: range(0.24, 0.38),
      frequencyX: range(220, 300),
      frequencyY: range(260, 340),
      phaseX: range(-0.8, 0.8),
      phaseY: range(-0.7, 0.7),
    },
  }
}

export type BackgroundVariation = ReturnType<typeof createBackgroundVariation>

// Transform motifs only, after painting a full, opaque base. This keeps the
// whole card covered while moving characteristic marks to different edges.
export function orientPattern(c: CanvasRenderingContext2D, flipX: boolean, flipY = false) {
  c.translate(flipX ? 720 : 0, flipY ? 1032 : 0)
  c.scale(flipX ? -1 : 1, flipY ? -1 : 1)
}
