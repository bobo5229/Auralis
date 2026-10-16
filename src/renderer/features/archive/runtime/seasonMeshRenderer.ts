import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from 'three'
import { modeRgb, useMode } from 'culori'
import { seasonArtworks } from '../utils/seasonArtwork'
import { seasonMeshFragment } from './seasonMeshShader'
import { createSeasonMeshClock } from './seasonMeshClock'
import type { SeasonMeshLayout, SeasonMeshWash } from './seasonMeshProtocol'

const toRgb = useMode(modeRgb)
function colorVector(color: string) {
  const rgb = toRgb(color)!
  return new Vector3(rgb.r, rgb.g, rgb.b)
}

/** One continuous annual color field, one draw call and one clock. */
export function createSeasonMeshRenderer(
  canvas: OffscreenCanvas,
  initialLayout: SeasonMeshLayout,
  initialWash: SeasonMeshWash,
  onError: (cause: unknown) => void,
) {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: 'low-power',
  })
  renderer.setClearColor(0, 0)
  renderer.debug.onShaderError = () => {
    throw new Error('Season mesh shader could not compile')
  }
  const geometry = new PlaneGeometry(2, 2)
  const material = new ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      colors: {
        value: seasonArtworks.flatMap((artwork) =>
          [
            ...artwork.washes.map((layer) => layer.color),
            artwork.base[0][1],
            artwork.base.at(-1)![1],
          ].map(colorVector),
        ),
      },
      titleColors: {
        value: seasonArtworks.map((artwork) =>
          colorVector(artwork.base[Math.floor(artwork.base.length / 2)][1]),
        ),
      },
      wash: { value: new Vector4(...initialWash) },
      bannerSize: { value: new Vector2() },
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      varying vec2 bannerUv;
      void main() { bannerUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: seasonMeshFragment,
  })
  const scene = new Scene()
  scene.add(new Mesh(geometry, material))
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  let playing = false
  let disposed = false
  let elapsed = 0
  const clock = createSeasonMeshClock((time) => {
    elapsed = time
    try {
      draw()
    } catch (cause) {
      fail(cause)
    }
  })

  function dispose() {
    if (disposed) return
    disposed = true
    clock.setPlaying(false)
    canvas.removeEventListener('webglcontextlost', contextLost)
    geometry.dispose()
    material.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
  function fail(cause: unknown) {
    dispose()
    onError(cause)
  }
  function contextLost(event: Event) {
    event.preventDefault()
    fail(new Error('Season mesh WebGL context was lost'))
  }
  function draw() {
    material.uniforms.time.value = elapsed * 0.16
    renderer.render(scene, camera)
  }
  function resize(layout: SeasonMeshLayout) {
    if (disposed) return
    renderer.setDrawingBufferSize(layout.width, layout.height, layout.pixelRatio)
    material.uniforms.bannerSize.value.set(layout.width, layout.height)
    if (playing) {
      try {
        draw()
      } catch (cause) {
        fail(cause)
      }
    }
  }
  canvas.addEventListener('webglcontextlost', contextLost)
  try {
    resize(initialLayout)
    draw()
  } catch (cause) {
    dispose()
    throw cause
  }
  return {
    resize,
    setAppearance(wash: SeasonMeshWash) {
      if (disposed) return
      material.uniforms.wash.value.set(...wash)
      if (playing) draw()
    },
    setPlaying(value: boolean) {
      if (disposed || playing === value) return
      playing = value
      if (value) {
        try {
          draw()
        } catch (cause) {
          fail(cause)
          return
        }
        clock.setPlaying(true)
      } else {
        clock.setPlaying(false)
      }
    },
    dispose,
  }
}
