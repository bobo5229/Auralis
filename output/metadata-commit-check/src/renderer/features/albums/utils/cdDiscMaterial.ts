// A transparent coating over the same DOM artwork. The hub, mask and rim stay CSS.
const vertex = `
attribute vec2 position;
varying vec2 uv;
void main() { uv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }
`

const fragment = `
precision highp float;
varying vec2 uv;
uniform vec3 tilt;
uniform float rotation;
uniform float gloss;
uniform float grooves;
uniform float vinyl;
uniform float dark;
uniform float pixels;
const float TAU = 6.28318530718;

vec3 toLocal(vec3 p) {
  // Production CSS is Rz(z) * Ry(y) * Rx(x). Converting y-down to y-up
  // gives Rz(-z) * Ry(y) * Rx(-x); invert in reverse order.
  float x = tilt.x, y = tilt.y, z = tilt.z;
  p.xy = vec2(cos(z)*p.x-sin(z)*p.y, sin(z)*p.x+cos(z)*p.y);
  p = vec3(cos(y)*p.x-sin(y)*p.z, p.y, sin(y)*p.x+cos(y)*p.z);
  return vec3(p.x, cos(x)*p.y-sin(x)*p.z, sin(x)*p.y+cos(x)*p.z);
}

void main() {
  vec2 p = uv * 2.0 - 1.0;
  float r = length(p);
  float aa = 2.0 / pixels;
  float coverage = 1.0 - smoothstep(1.0-aa, 1.0, r);
  if (coverage <= 0.0) discard;
  float angle = atan(p.y, p.x);
  vec2 radial = p / max(r, 0.001);
  vec3 light = normalize(toLocal(vec3(-0.45, 0.65, 1.4)));
  vec3 view = normalize(toLocal(vec3(-p * 0.13, 1.8)));
  vec3 halfVector = normalize(light + view);

  // Groove spacing follows the 400px CSS specimen. Attenuate at low resolution.
  float groovePhase = r * 196.0 / 2.8 * TAU;
  float grooveAA = clamp(pixels / 392.0, 0.0, 1.0);
  float ring = sin(groovePhase + 0.25*sin(r*61.0));
  float fine = sin(r * 196.0 * TAU / 1.4);
  float bands = 0.75 + 0.25 * sin(r * 87.0 + sin(r * 29.0));

  // Radially brushed normals create the paired, directional reflection of grooves.
  float axis = abs(dot(radial, normalize(halfVector.xy + vec2(0.0001))));
  float directional = 0.65*pow(axis, 8.0) + 0.35*pow(axis, 32.0);
  float normalTilt = length(halfVector.xy);
  float lobe = directional * (0.32 + 0.68 * smoothstep(0.01, 0.28, normalTilt));
  vec3 normal = normalize(vec3(radial * ring * 0.055 * grooves * vinyl, 1.0));
  float sheen = pow(max(dot(normal, halfVector), 0.0), 42.0);
  float facing = max(dot(normal, view), 0.0);
  float fresnel = pow(1.0-facing, 4.0);

  // Broad studio strip reflection moves across the surface as the plane tilts.
  vec3 reflected = reflect(-view, normal);
  float strip = exp(-pow((reflected.x + 0.23 + p.x*0.17) / 0.16, 2.0));
  strip *= smoothstep(-0.7, 0.5, reflected.y + p.y*0.15);
  float highlights = gloss * (0.13*sheen + 0.17*strip + 0.27*lobe*vinyl + 0.10*fresnel);
  highlights *= 0.88 + 0.12 * fine * grooveAA * grooves * vinyl;

  float concentric = (0.5 + 0.5*ring) * 0.095 * bands * grooves * vinyl * grooveAA;
  float rotatingGrain = sin(angle*83.0 + rotation*0.7 + r*1100.0);
  concentric += rotatingGrain * 0.004 * grooves * vinyl * grooveAA;
  float shade = 0.055 + concentric + (1.0-sheen)*0.025*gloss;
  shade *= mix(1.0, 1.16, dark);
  float alpha = clamp(shade + highlights, 0.0, 0.68);
  vec3 coating = mix(vec3(1.0,0.99,0.95), vec3(0.89,0.94,1.0), dark);
  vec3 color = coating * highlights / max(alpha, 0.001);
  gl_FragColor = vec4(color * alpha * coverage, alpha * coverage);
}
`

export interface CdDiscMaterialState {
  x: number
  y: number
  z: number
  angle: number
  vinyl: number
  dark: boolean
  size: number
  gloss?: number
  grooves?: number
}

/** No animation clock: the stage redraws only when the pose or appearance changes. */
export function createCdDiscMaterial(canvas: HTMLCanvasElement, invalidate: () => void) {
  const context = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
  })
  if (!context) throw new Error('WebGL is unavailable for the disc material')
  const gl = context
  let program: WebGLProgram | null = null
  let buffer: WebGLBuffer | null = null
  let uniforms: Record<string, WebGLUniformLocation | null> = {}
  let available = false
  let disposed = false
  let lastFrame = ''

  function release(): void {
    if (buffer) gl.deleteBuffer(buffer)
    if (program) gl.deleteProgram(program)
    buffer = program = null
  }
  function initialize(): void {
    const shaders: WebGLShader[] = []
    try {
      for (const [type, code] of [
        [gl.VERTEX_SHADER, vertex],
        [gl.FRAGMENT_SHADER, fragment],
      ] as const) {
        const shader = gl.createShader(type)
        if (!shader) throw new Error('Unable to allocate a disc shader')
        shaders.push(shader)
        gl.shaderSource(shader, code)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(shader) ?? 'Disc shader compilation failed')
      }
      program = gl.createProgram()
      if (!program) throw new Error('Unable to allocate a disc program')
      for (const shader of shaders) gl.attachShader(program, shader)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) ?? 'Disc shader linking failed')
      gl.useProgram(program)
      buffer = gl.createBuffer()
      if (!buffer) throw new Error('Unable to allocate a disc buffer')
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      )
      const location = gl.getAttribLocation(program, 'position')
      gl.enableVertexAttribArray(location)
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
      uniforms = Object.fromEntries(
        ['tilt', 'rotation', 'gloss', 'grooves', 'vinyl', 'dark', 'pixels'].map((key) => [
          key,
          gl.getUniformLocation(program!, key),
        ]),
      )
      gl.clearColor(0, 0, 0, 0)
      lastFrame = ''
      available = true
    } catch (error) {
      available = false
      release()
      throw error
    } finally {
      for (const shader of shaders) gl.deleteShader(shader)
    }
  }
  function contextLost(event: Event): void {
    event.preventDefault()
    available = false
    lastFrame = ''
    invalidate()
  }
  function contextRestored(): void {
    if (disposed) return
    try {
      initialize()
    } catch {
      /* Keep the CSS fallback if restoration fails. */
    }
    invalidate()
  }
  try {
    initialize()
  } catch (error) {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    throw error
  }
  canvas.addEventListener('webglcontextlost', contextLost)
  canvas.addEventListener('webglcontextrestored', contextRestored)

  return {
    draw(state: CdDiscMaterialState, force = false): boolean {
      if (!available || disposed || gl.isContextLost()) return false
      const pixels = Math.max(
        1,
        Math.min(1024, Math.round(state.size * Math.min(window.devicePixelRatio || 1, 2))),
      )
      const frame = [
        state.x,
        state.y,
        state.z,
        state.angle,
        state.vinyl,
        state.dark,
        pixels,
        state.gloss,
        state.grooves,
      ].join(',')
      if (!force && frame === lastFrame) return true
      if (canvas.width !== pixels || canvas.height !== pixels) canvas.width = canvas.height = pixels
      gl.viewport(0, 0, pixels, pixels)
      const radians = Math.PI / 180
      gl.uniform3f(uniforms.tilt, state.x * radians, state.y * radians, state.z * radians)
      gl.uniform1f(uniforms.rotation, state.angle * radians)
      gl.uniform1f(uniforms.gloss, state.gloss ?? 0.8)
      gl.uniform1f(uniforms.grooves, state.grooves ?? 0.8)
      gl.uniform1f(uniforms.vinyl, state.vinyl)
      gl.uniform1f(uniforms.dark, state.dark ? 1 : 0)
      gl.uniform1f(uniforms.pixels, pixels)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      // Validate the first submission (including after restoration), not every frame.
      if (!lastFrame && gl.getError() !== gl.NO_ERROR) {
        available = false
        return false
      }
      lastFrame = frame
      return true
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      available = false
      canvas.removeEventListener('webglcontextlost', contextLost)
      canvas.removeEventListener('webglcontextrestored', contextRestored)
      release()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
