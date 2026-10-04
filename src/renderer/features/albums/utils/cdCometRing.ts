const NS = 'http://www.w3.org/2000/svg'
const CENTER = 200
const RADIUS = 216
const SEGMENTS = 36
const TAIL_SPAN = (56 * Math.PI) / 180

function point(angle: number): [number, number] {
  return [CENTER + Math.sin(angle) * RADIUS, CENTER - Math.cos(angle) * RADIUS]
}

/** Fixed SVG geometry: only rotation, tail opacity/width and head size change. */
export function createCdCometRing(svg: SVGSVGElement) {
  const root = document.createElementNS(NS, 'g')
  root.classList.add('cd-comet-ring')
  for (let index = 0; index < 4; index++) {
    const dot = document.createElementNS(NS, 'circle')
    const [x, y] = point((index * Math.PI) / 2)
    dot.setAttribute('cx', String(x))
    dot.setAttribute('cy', String(y))
    dot.setAttribute('r', '1.5')
    dot.style.fill = 'var(--cd-wave-track)'
    dot.style.stroke = 'none'
    root.append(dot)
  }
  const moving = document.createElementNS(NS, 'g')
  const segments = Array.from({ length: SEGMENTS }, (_, index) => {
    const path = document.createElementNS(NS, 'path')
    const [x1, y1] = point(-((index + 1) / SEGMENTS) * TAIL_SPAN)
    const [x2, y2] = point(-(index / SEGMENTS) * TAIL_SPAN)
    path.setAttribute('d', `M${x1},${y1} A${RADIUS},${RADIUS} 0 0 1 ${x2},${y2}`)
    path.style.strokeLinecap = index === 0 ? 'round' : 'butt'
    moving.append(path)
    return path
  })
  const head = document.createElementNS(NS, 'circle')
  head.classList.add('cd-comet-head')
  head.setAttribute('cx', String(CENTER))
  head.setAttribute('cy', String(CENTER - RADIUS))
  head.style.fill = '#fff'
  head.style.strokeWidth = '2'
  moving.append(head)
  root.append(moving)
  svg.append(root)

  return {
    root,
    setProgress(progress: number, accent: string): void {
      moving.setAttribute('transform', `rotate(${progress * 360} ${CENTER} ${CENTER})`)
      root.style.stroke = accent
    },
    paint(seconds: number): void {
      segments.forEach((path, index) => {
        const ratio = index / SEGMENTS
        const wave = Math.sin(index * 0.4 - seconds * 8) * 0.25
        path.style.opacity = String(Math.max(0.01, Math.min(1, (1 - ratio) ** 1.8 * (1 + wave))))
        path.style.strokeWidth = String(1 + (1 - ratio) * 2.8 + wave * 0.8)
      })
      head.setAttribute('r', String(4.2 + Math.sin(seconds * 10) * 0.8))
    },
  }
}
