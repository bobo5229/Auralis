import type { ArtworkPalette, RgbColor } from '../types'
import { getOklabDistance, mixRgb, rgbToOklab } from '../utils/colorSpace'
import type { FluidRenderer } from './fluidRenderer'

interface RenderAccent {
  color: RgbColor
  weight: number
}

interface RenderPalette {
  background: RgbColor
  accents: RenderAccent[]
}

interface Uniforms {
  resolution: WebGLUniformLocation
  background: WebGLUniformLocation
  colors: WebGLUniformLocation
  weights: WebGLUniformLocation
  centers: WebGLUniformLocation
  colorCount: WebGLUniformLocation
  time: WebGLUniformLocation
}

const TRANSITION_MS = 1200
const MAX_COLORS = 5

const VERTEX_SHADER = `#version 300 es
precision highp float;

const vec2 POSITIONS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

void main() {
  gl_Position = vec4(POSITIONS[gl_VertexID], 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform vec3 uBackground;
uniform vec3 uColors[5];
uniform float uWeights[5];
uniform vec2 uCenters[5];
uniform int uColorCount;
uniform float uTime;

out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = uv - 0.5;
  p.x *= uResolution.x / max(uResolution.y, 1.0);

  float t = uTime * 0.055;
  vec2 warped = p;
  warped.x += sin(p.y * 3.1 + t * 0.83) * 0.055;
  warped.y += cos(p.x * 2.7 - t * 0.67) * 0.05;
  warped += vec2(
    sin((p.x + p.y) * 4.2 + t * 0.41),
    cos((p.x - p.y) * 3.8 - t * 0.37)
  ) * 0.018;

  vec3 accumulated = vec3(0.0);
  float field = 0.0;

  for (int i = 0; i < 5; i++) {
    if (i >= uColorCount) {
      continue;
    }

    float fi = float(i);
    vec2 delta = warped - uCenters[i];
    float distanceSquared = dot(delta, delta);
    float radius = 0.13 + mod(fi, 3.0) * 0.035;
    float influence = exp(-distanceSquared / radius);
    influence *= 0.72 + sqrt(max(uWeights[i], 0.0)) * 0.72;
    accumulated += uColors[i] * influence;
    field += influence;
  }

  vec3 fluidColor = accumulated / max(field, 0.001);
  float presence = smoothstep(0.035, 0.72, field);
  vec3 color = mix(uBackground * 0.72, fluidColor, presence * 0.94);

  float centerDistance = length((uv - 0.5) * vec2(0.82, 1.0));
  float vignette = 1.0 - smoothstep(0.24, 0.76, centerDistance) * 0.28;
  color *= vignette;
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luminance), color, 1.58);
  color = pow(max(color * 0.92, vec3(0.0)), vec3(1.03));

  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

function clonePalette(palette: ArtworkPalette): RenderPalette {
  return {
    background: { ...palette.background },
    accents: palette.accents.slice(0, MAX_COLORS).map(({ rgb, weight }) => ({
      color: { ...rgb },
      weight,
    })),
  }
}

function getColorDistance(a: RgbColor, b: RgbColor): number {
  return getOklabDistance(rgbToOklab(a), rgbToOklab(b))
}

function alignAccents(
  previous: RenderAccent[],
  next: RenderAccent[],
): [RenderAccent[], RenderAccent[]] {
  const fallback = { color: { r: 64, g: 92, b: 128 }, weight: 1 }
  const from = previous.length > 0 ? previous.map((accent) => ({ ...accent })) : [fallback]
  const available = next.length > 0 ? next.map((accent) => ({ ...accent })) : [fallback]
  const count = Math.min(MAX_COLORS, Math.max(from.length, available.length))
  const alignedFrom: RenderAccent[] = []
  const alignedTo: RenderAccent[] = []

  for (let index = 0; index < count; index += 1) {
    const source = from[index] ?? from[0]
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    available.forEach((target, targetIndex) => {
      const distance = getColorDistance(source.color, target.color)
      if (distance < nearestDistance) {
        nearestIndex = targetIndex
        nearestDistance = distance
      }
    })
    alignedFrom.push(source)
    alignedTo.push(available[nearestIndex])
    if (available.length > 1) available.splice(nearestIndex, 1)
  }

  return [alignedFrom, alignedTo]
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create WebGL shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader compilation error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to create WebGL program')
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown WebGL program link error'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

function getUniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string) {
  const location = gl.getUniformLocation(program, name)
  if (!location) throw new Error(`Missing WebGL uniform: ${name}`)
  return location
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3)
}

function toGlColor(color: RgbColor): [number, number, number] {
  return [color.r / 255, color.g / 255, color.b / 255]
}

export class WebglFluidRenderer implements FluidRenderer {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly vertexArray: WebGLVertexArrayObject
  private readonly uniforms: Uniforms
  private previous: RenderPalette
  private target: RenderPalette
  private transitionStartedAt = 0
  private motionTime = 0
  private lastRenderAt = 0
  private readonly colorBuffer = new Float32Array(MAX_COLORS * 3)
  private readonly weightBuffer = new Float32Array(MAX_COLORS)
  private readonly centerBuffer = new Float32Array(MAX_COLORS * 2)

  constructor(
    private readonly canvas: HTMLCanvasElement,
    initialPalette: ArtworkPalette,
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      stencil: false,
    })
    if (!gl) throw new Error('WebGL2 is unavailable')

    this.gl = gl
    this.program = createProgram(gl)
    const vertexArray = gl.createVertexArray()
    if (!vertexArray) throw new Error('Unable to create WebGL vertex array')
    this.vertexArray = vertexArray
    this.uniforms = {
      resolution: getUniform(gl, this.program, 'uResolution'),
      background: getUniform(gl, this.program, 'uBackground'),
      colors: getUniform(gl, this.program, 'uColors[0]'),
      weights: getUniform(gl, this.program, 'uWeights[0]'),
      centers: getUniform(gl, this.program, 'uCenters[0]'),
      colorCount: getUniform(gl, this.program, 'uColorCount'),
      time: getUniform(gl, this.program, 'uTime'),
    }
    this.previous = clonePalette(initialPalette)
    this.target = clonePalette(initialPalette)

    gl.useProgram(this.program)
    gl.bindVertexArray(this.vertexArray)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
  }

  resize(width: number, height: number, dpr: number): void {
    const pixelWidth = Math.max(1, Math.round(width * dpr))
    const pixelHeight = Math.max(1, Math.round(height * dpr))
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth
      this.canvas.height = pixelHeight
    }
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.gl.viewport(0, 0, pixelWidth, pixelHeight)
  }

  setPalette(palette: ArtworkPalette, startedAt: number): void {
    const current = this.getPaletteAt(startedAt)
    const next = clonePalette(palette)
    const [previousAccents, nextAccents] = alignAccents(current.accents, next.accents)
    this.previous = { background: current.background, accents: previousAccents }
    this.target = { background: next.background, accents: nextAccents }
    this.transitionStartedAt = startedAt
  }

  render(time: number, motionScale: number): void {
    if (this.gl.isContextLost()) return
    const delta = this.lastRenderAt > 0 ? Math.min(time - this.lastRenderAt, 100) : 0
    this.lastRenderAt = time
    this.motionTime += delta * motionScale
    const palette = this.getPaletteAt(time)
    this.colorBuffer.fill(0)
    this.weightBuffer.fill(0)
    this.centerBuffer.fill(0)

    palette.accents.forEach((accent, index) => {
      this.colorBuffer.set(toGlColor(accent.color), index * 3)
      this.weightBuffer[index] = accent.weight

      const direction = index % 2 === 0 ? 1 : -1
      const speed = (0.82 + index * 0.09) * direction
      const shaderTime = (this.motionTime / 1000) * 0.055
      const angle = shaderTime * speed + index * 2.17 + 0.4
      this.centerBuffer[index * 2] = Math.cos(angle) * (0.24 + (index % 3) * 0.035)
      this.centerBuffer[index * 2 + 1] =
        Math.sin(angle * 1.17 + index * 1.31) * (0.25 + (index % 2) * 0.045)
    })

    const gl = this.gl
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vertexArray)
    gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height)
    gl.uniform3fv(this.uniforms.background, toGlColor(palette.background))
    gl.uniform3fv(this.uniforms.colors, this.colorBuffer)
    gl.uniform1fv(this.uniforms.weights, this.weightBuffer)
    gl.uniform2fv(this.uniforms.centers, this.centerBuffer)
    gl.uniform1i(this.uniforms.colorCount, palette.accents.length)
    gl.uniform1f(this.uniforms.time, this.motionTime / 1000)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose(): void {
    if (!this.gl.isContextLost()) {
      this.gl.deleteVertexArray(this.vertexArray)
      this.gl.deleteProgram(this.program)
    }
  }

  private getPaletteAt(time: number): RenderPalette {
    const rawProgress =
      this.transitionStartedAt === 0
        ? 1
        : Math.min(1, Math.max(0, (time - this.transitionStartedAt) / TRANSITION_MS))
    const progress = easeOutCubic(rawProgress)
    const count = Math.max(this.previous.accents.length, this.target.accents.length, 1)
    const accents = Array.from({ length: count }, (_, index) => {
      const from = this.previous.accents[index] ?? this.previous.accents[0]
      const to = this.target.accents[index] ?? this.target.accents[0]
      return {
        color: mixRgb(from.color, to.color, progress),
        weight: from.weight + (to.weight - from.weight) * progress,
      }
    })
    return {
      background: mixRgb(this.previous.background, this.target.background, progress),
      accents,
    }
  }
}
