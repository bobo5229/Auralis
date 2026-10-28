// Explicit art direction lives here; the pipeline and renderer know no badge IDs.
export const materials = {
  silver: { kind: 0, color: '#aeb9c2', roughness: 0.22, coat: 0 },
  enamel: { kind: 1, roughness: 0.12, coat: 1 },
  opal: { kind: 2, color: '#9fbfc9', roughness: 0.18, coat: 1 },
  pearl: { kind: 2, roughness: 0.24, coat: 0.6 },
  gold: { kind: 0, roughness: 0.27, coat: 0 },
  paper: { kind: 1, roughness: 0.82, coat: 0 },
  vinyl: { kind: 1, roughness: 0.34, coat: 0.18 },
  velvet: { kind: 1, roughness: 0.88, coat: 0 },
}

const paint = (material, color, height = 0.46) => ({ material, color, height })
const profile = (id, name, color, extra = {}) => ({
  id,
  name,
  series: id.split('-')[0],
  catalogId: id.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase()),
  enamel: color,
  roughness: [0.22, 0.12, 0.18, 0.65],
  gradients: {},
  groups: [],
  removeStrokes: [],
  ...extra,
})

export const profiles = [
  profile('hours-10', '初响', '#268aaa', { removeStrokes: ['#b5eeef'] }),
  profile('hours-100', '成章', '#1965a0', { preserveBaseline: true }),
  profile('hours-500', '共鸣', '#168d7d', { removeStrokes: ['#a0ffe0'] }),
  profile('hours-1000', '久伴', '#6252a7', { removeStrokes: ['#d3c4ff'] }),
  profile('days-7', '一周相伴', '#203c68', {
    gradients: {
      'north-enamel': paint('enamel', '#203c68', 0.3),
      'north-bowl': paint('enamel', '#536dac', 0.24),
    },
    groups: [{ attribute: 'data-star', material: 'silver', height: 0.62 }],
    removeStrokes: ['#a8c8e8', '#6586c2'],
  }),
  profile('days-30', '月下相伴', '#37365f', {
    gradients: {
      'lunar-enamel': paint('enamel', '#37365f', 0.3),
      'white-pearl': paint('pearl', '#dedfe7', 0.58),
      'violet-pearl': paint('pearl', '#b6adce', 0.58),
      'phase-enamel': paint('pearl', '#857da6', 0.53),
      'moon-well': paint('enamel', '#191c36', 0.3),
    },
    groups: [{ attribute: 'data-moon-crescent', material: 'pearl', height: 0.58 }],
    removeStrokes: ['#fff9e9', '#f7f2e5', '#c5bfdf', '#aca8dc'],
  }),
  profile('days-100', '百日留声', '#225e68', {
    gradients: {
      'petrol-enamel': paint('enamel', '#225e68', 0.3),
      'vinyl-enamel': paint('vinyl', '#183e4b', 0.42),
      'vinyl-label': paint('enamel', '#092633', 0.44),
    },
    groups: [
      { attribute: 'data-music-disc', material: 'vinyl', height: 0.42 },
      { attribute: 'data-music-stylus', material: 'silver', height: 0.62 },
    ],
    removeStrokes: ['#9ad6cf', '#86c8c7'],
  }),
  profile('days-365', '一岁相伴', '#80522f', {
    gradients: {
      'amber-enamel': paint('enamel', '#80522f', 0.3),
      'dial-well': paint('enamel', '#4b3426', 0.29),
      'sun-gold': paint('gold', '#c9a160', 0.55),
      'sun-face': paint('gold', '#bd9758', 0.6),
      'season-0': paint('enamel', '#93976a', 0.42),
      'season-1': paint('enamel', '#cc994d', 0.42),
      'season-2': paint('enamel', '#a7653d', 0.42),
      'season-3': paint('enamel', '#809ca5', 0.42),
    },
    removeStrokes: ['#dec69c', '#d9af70', '#fff1d6', '#f5dfb1', '#fff3d0'],
  }),
  profile('days-520', '倾心相伴', '#75253f', {
    gradients: {
      'garnet-enamel': paint('enamel', '#75253f', 0.3),
      'heart-well': paint('enamel', '#65213c', 0.4),
    },
    opalClips: ['inlay-sector'],
    removeStrokes: ['#e9b9c7', '#d6899e', '#f7d3d9'],
  }),
  profile('albums-1', '从头到尾', '#245b55', {
    gradients: {
      peacock: paint('enamel', '#245b55', 0.3),
      ivory: paint('paper', '#e5ddbe', 0.58),
      vinyl: paint('vinyl', '#12283c', 0.43),
      champagne: paint('gold', '#c5a066', 0.49),
    },
    groups: [
      { attribute: 'data-album-sleeve', material: 'paper', height: 0.58 },
      { attribute: 'data-album-disc', material: 'vinyl', height: 0.43 },
    ],
    removeStrokes: ['#b5dacc', '#d1f2df', '#fffef2'],
  }),
  profile('albums-live', '现场回声', '#142237', {
    gradients: {
      stage: paint('enamel', '#142237', 0.3),
      velvet: paint('velvet', '#69223d', 0.46),
      swag: paint('velvet', '#833049', 0.52),
      gold: paint('gold', '#c4a06c', 0.58),
    },
    groups: [
      { attribute: 'data-live-curtain', material: 'velvet', height: 0.46 },
      { attribute: 'data-live-microphone', material: 'silver', height: 0.65 },
    ],
    removeStrokes: ['#bdccda'],
  }),
]

export function selectProfiles(id) {
  if (!id || id === 'all') return profiles
  const selected = profiles.filter((profile) => id.split(',').includes(profile.id))
  const unknown = id.split(',').filter((id) => !selected.some((profile) => profile.id === id))
  if (unknown.length) throw new Error(`Unknown badge: ${unknown.join(', ')}. Use --list.`)
  return selected
}
