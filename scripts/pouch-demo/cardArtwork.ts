import * as THREE from 'three'

export const cardSamples = [
  {
    id: 'blue',
    label: '深色封面',
    title: '蓝调之后',
    artist: 'Auralis Studio',
    year: '2026',
    sky: ['#192443', '#516b88', '#c9a59d'],
    tracks: [
      '远岸',
      '夜航',
      '蓝色回声',
      '等风停下',
      '月光的背面',
      '慢慢靠近',
      '海平线',
      '天亮之前',
    ],
  },
  {
    id: 'morning',
    label: '浅色封面',
    title: '晨间留白',
    artist: 'Auralis Studio',
    year: '2025',
    sky: ['#d1e1d6', '#ece9d3', '#dabba6'],
    tracks: ['第一束光', '窗边', '温柔的空白', '树影', '一杯清晨', '慢步', '风经过这里', '晴天'],
  },
  {
    id: 'long',
    label: '长专辑名',
    title: '在所有未被命名的夜晚里，重新听见你',
    artist: 'Auralis Studio',
    year: '2024',
    sky: ['#30213f', '#775875', '#c79296'],
    tracks: [
      '未命名的夜晚',
      '路灯下的影子',
      '重逢之前',
      '你的声音',
      '沿途',
      '无人知晓的星光',
      '旧日来信',
      '重新听见',
    ],
  },
] as const
export type CardSample = (typeof cardSamples)[number]['id']

function titleLines(c: CanvasRenderingContext2D, title: string, width: number) {
  const lines: string[] = []
  let line = ''
  for (const char of title) {
    if (line && c.measureText(line + char).width > width) {
      lines.push(line)
      line = char
    } else line += char
  }
  if (line) lines.push(line)
  if (lines.length > 2) {
    let last = lines[1]
    while (c.measureText(last + '…').width > width) last = last.slice(0, -1)
    return [lines[0], last + '…']
  }
  return lines
}

// Original fictional artwork. Every sample uses the same square cover geometry.
export function drawCardArtwork(texture: THREE.CanvasTexture, id: CardSample, back = false) {
  const sample = cardSamples.find((item) => item.id === id)!
  const c = (texture.image as HTMLCanvasElement).getContext('2d')!
  c.clearRect(0, 0, 720, 1032)
  c.textAlign = 'left'
  // Neutral foil substrate shared by all covers; no printed information panel.
  c.fillStyle = '#b8bbc2'
  c.fillRect(0, 0, 720, 1032)
  if (!back) {
    const sky = c.createLinearGradient(0, 42, 620, 700)
    sample.sky.forEach((color, i) => sky.addColorStop(i / 2, color))
    c.fillStyle = sky
    c.fillRect(38, 42, 644, 644)
    c.save()
    c.beginPath()
    c.rect(38, 42, 644, 644)
    c.clip()
    c.fillStyle = id === 'morning' ? '#fbf0c9' : '#ead6aa'
    c.beginPath()
    c.arc(491, 226, 68, 0, Math.PI * 2)
    c.fill()
    for (let i = 0; i < 6; i++) {
      c.fillStyle = ['#646885', '#827888', '#ae888d', '#cfaaa0', '#a47279', '#634e6f'][i]
      c.beginPath()
      c.moveTo(38, 475 + i * 31)
      c.bezierCurveTo(245, 355 + i * 48, 430, 635 - i * 7, 682, 445 + i * 41)
      c.lineTo(682, 686)
      c.lineTo(38, 686)
      c.fill()
    }
    c.restore()
  }
  c.fillStyle = '#343945'
  c.font = '500 49px Segoe UI'
  const lines = titleLines(c, sample.title, 624)
  const titleY = back ? 116 : 771
  lines.forEach((line, i) => c.fillText(line, 48, titleY + i * 58))
  c.fillStyle = '#565d69'
  c.font = '29px Segoe UI'
  c.fillText(sample.artist, 49, titleY + lines.length * 58)
  if (back) {
    c.font = '23px Segoe UI'
    c.fillText('TRACKLIST', 49, 298)
    sample.tracks.forEach((track, i) => {
      const y = 365 + i * 61
      c.fillStyle = '#565d69'
      c.font = '23px Segoe UI'
      c.fillText(String(i + 1).padStart(2, '0'), 49, y)
      c.fillStyle = '#343945'
      c.font = '29px Segoe UI'
      c.fillText(track, 112, y)
      c.textAlign = 'right'
      c.fillStyle = '#565d69'
      c.font = '23px Segoe UI'
      c.fillText('04:00', 672, y)
      c.textAlign = 'left'
    })
  }
  c.strokeStyle = '#565d69'
  c.globalAlpha = 0.45
  c.lineWidth = 1.5
  c.beginPath()
  c.moveTo(48, 921)
  c.lineTo(672, 921)
  c.stroke()
  c.globalAlpha = 1
  c.fillStyle = '#565d69'
  c.font = '25px Segoe UI'
  c.fillText(back ? 'AURALIS' : sample.year, 49, 970)
  c.textAlign = 'right'
  c.fillText(back ? '8 TRACKS  /  32:00' : '8 TRACKS', 672, 970)
  c.textAlign = 'left'
  texture.needsUpdate = true
}

export function createCardArtwork(back = false) {
  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 1032
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  drawCardArtwork(texture, 'blue', back)
  return texture
}
