interface DrawOptions {
  circular?: boolean
  delay?: number
  easing?: (progress: number) => number
  callback?: () => void
}

export default class Segment {
  constructor(path: SVGPathElement, begin?: number | string, end?: number | string)
  draw(begin: number | string, end: number | string, duration?: number, options?: DrawOptions): void
  stop(): void
}
