type ColorStop = readonly [position: number, color: string]
interface RadialWash {
  x: number
  y: number
  color: string
  solid: number
  end: number
}
interface SeasonArtwork {
  id: string
  character: string
  ink: string
  base: readonly ColorStop[]
  washes: readonly RadialWash[]
}

export const seasonArtworks = [
  {
    id: 'spring',
    character: '春',
    ink: '#274c3c',
    base: [
      [0, '#c1dfc0'],
      [1, '#e8dfb5'],
    ],
    washes: [
      { x: 0.06, y: 0.96, color: '#72b99b', solid: 0, end: 0.66 },
      { x: 0.6, y: 1.06, color: '#eac2c8', solid: 0, end: 0.58 },
      { x: 1, y: 0, color: '#edf1cf', solid: 0.12, end: 0.72 },
    ],
  },
  {
    id: 'summer',
    character: '夏',
    ink: '#143f50',
    base: [
      [0, '#65b4ce'],
      [0.68, '#b6e2cf'],
      [1, '#d5e2b1'],
    ],
    washes: [
      { x: 0, y: 0.16, color: '#3ca7bb', solid: 0, end: 0.64 },
      { x: 0.4, y: 1.12, color: '#1d899c', solid: 0, end: 0.65 },
      { x: 1.08, y: 0.8, color: '#efd593', solid: 0, end: 0.64 },
    ],
  },
  {
    id: 'autumn',
    character: '秋',
    ink: '#5a2c22',
    base: [
      [0, '#d9a982'],
      [1, '#e8b76e'],
    ],
    washes: [
      { x: 0, y: 1.06, color: '#9f4550', solid: 0, end: 0.68 },
      { x: 0.74, y: 1.1, color: '#d98340', solid: 0, end: 0.64 },
      { x: 1, y: 0, color: '#f0d599', solid: 0.1, end: 0.74 },
    ],
  },
  {
    id: 'winter',
    character: '冬',
    ink: '#38485f',
    base: [
      [0, '#c3d8e2'],
      [1, '#dce3e8'],
    ],
    washes: [
      { x: 0, y: 0.72, color: '#889abf', solid: 0, end: 0.65 },
      { x: 0.75, y: 1.12, color: '#b6aacb', solid: 0, end: 0.64 },
      { x: 0.94, y: 0.04, color: '#edf0f2', solid: 0.16, end: 0.76 },
    ],
  },
] as const satisfies readonly SeasonArtwork[]

// One continuous fallback, including when WebGL is unavailable or motion is reduced.
const bannerWashes = seasonArtworks.flatMap((art, index) =>
  art.washes.map(
    ({ x, y, color, solid, end }) =>
      `radial-gradient(ellipse 20% 150% at ${((index + x) / 4) * 100}% ${y * 100}%, ${color} ${solid * 100}%, ${color}00 ${end * 100}%)`,
  ),
)
const bannerStops = seasonArtworks.flatMap((art, index) =>
  art.base.map(([at, color]) => `${color} ${((index + 0.15 + at * 0.7) / 4) * 100}%`),
)
export const seasonBannerStyle = {
  '--season-banner-art': [
    ...bannerWashes,
    `linear-gradient(90deg, ${bannerStops.join(', ')})`,
  ].join(', '),
}
