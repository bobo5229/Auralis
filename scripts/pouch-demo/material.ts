import * as THREE from 'three'

// Foil diffraction adapted from Dmitry Kurash's Holocloth (MIT).
// See HOLOCLOTH-LICENSE.txt. We keep its view-driven hue / metallic tint idea;
// fabric sheen, cavity attributes, emission and postprocessing are omitted.
export function createFoil(wrinkles: THREE.Texture) {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#a5a8b1',
    metalness: 0.92,
    roughness: 0.34,
    clearcoat: 0.45,
    clearcoatRoughness: 0.3,
    normalMap: wrinkles,
    normalScale: new THREE.Vector2(0.15, 0.15),
    side: THREE.DoubleSide,
  })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec2 vPouchUv;\n' +
      shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvPouchUv = uv;')
    shader.fragmentShader =
      `
      varying vec2 vPouchUv;
      float foilHash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * 0.1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }
      vec3 foilRainbow(float hue) {
        vec3 c = clamp(abs(mod(hue * 6.0 + vec3(0.,4.,2.),6.) - 3.) - 1.,0.,1.);
        return c * c * (3. - 2. * c);
      }
    ` +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `
      #include <emissivemap_fragment>
      float facing = clamp(abs(dot(normal, normalize(vViewPosition))), 0., 1.);
      float phase = facing * 2.7 + vPouchUv.x * 0.7 + vPouchUv.y * 0.9;
      phase += foilHash(floor(vPouchUv * 230.)) * 0.035;
      vec3 tint = 0.38 + foilRainbow(fract(phase)) * 1.25;
      diffuseColor.rgb *= mix(vec3(1.), tint, 0.8);
    `,
      )
  }
  return { material }
}

export function createWrinkles() {
  const size = 512
  const data = new Uint8Array(size * size * 4)
  // Reproducible narrow creases, with no woven texture or frame-driven noise.
  const height = (u: number, v: number) => {
    const edge = Math.pow(Math.abs(u - 0.5) * 2, 6)
    return (
      Math.sin(v * 93 + Math.sin(u * 21) * 3) * edge * 0.001 +
      Math.exp(-Math.pow((v - 0.27 - u * 0.16) / 0.006, 2)) * 0.002 +
      Math.exp(-Math.pow((v - 0.63 + u * 0.13) / 0.008, 2)) * 0.0015
    )
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size,
        e = 1 / size
      const n = new THREE.Vector3(
        -(height(u + e, v) - height(u - e, v)) / (2 * e),
        -(height(u, v + e) - height(u, v - e)) / (2 * e),
        1,
      ).normalize()
      const i = (y * size + x) * 4
      data[i] = (n.x * 0.5 + 0.5) * 255
      data[i + 1] = (n.y * 0.5 + 0.5) * 255
      data[i + 2] = (n.z * 0.5 + 0.5) * 255
      data[i + 3] = 255
    }
  const texture = new THREE.DataTexture(data, size, size)
  texture.needsUpdate = true
  return texture
}
