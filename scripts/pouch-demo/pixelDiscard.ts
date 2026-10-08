import * as THREE from 'three'

// Original coarse-pixel effect: one instanced square per image sample.
// A fixed birth time drives both detachment and shrinking, with no CPU update loop.
export function createPixelDiscard() {
  const columns = 28,
    rows = 40,
    count = columns * rows
  const geometry = new THREE.InstancedBufferGeometry()
  const plane = new THREE.PlaneGeometry(1, 1)
  geometry.index = plane.index
  geometry.attributes = { ...plane.attributes }
  geometry.instanceCount = count
  const homes = new Float32Array(count * 2)
  const births = new Float32Array(count)
  const seeds = new Float32Array(count)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const i = y * columns + x
      homes[i * 2] = (x + 0.5) / columns
      homes[i * 2 + 1] = (y + 0.5) / rows
      const seed = Math.sin(i * 73.17 + 19.3) * 18437.29
      seeds[i] = seed - Math.floor(seed)
      births[i] = (x / columns + (1 - y / rows)) * 0.5 * 0.7 + seeds[i] * 0.15
    }
  }
  geometry.setAttribute('aHome', new THREE.InstancedBufferAttribute(homes, 2))
  geometry.setAttribute('aBirth', new THREE.InstancedBufferAttribute(births, 1))
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
  const uniforms = {
    uTime: { value: 0 },
    uTexture: { value: null as THREE.Texture | null },
    uBack: { value: 0 },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec2 aHome;
      attribute float aBirth, aSeed;
      uniform float uTime, uBack;
      varying vec2 vSample;
      void main() {
        float age = max(0., uTime - aBirth);
        float life = clamp(age / .7, 0., 1.);
        float scale = 1. - smoothstep(.18, 1., life);
        vec3 p = vec3((aHome - .5) * vec2(2.65, 3.8), mix(.023, -.023, uBack));
        p.xy += position.xy * vec2(2.65 / 28., 3.8 / 40.) * scale;
        p.x += age * (1.5 + aSeed * 1.8);
        p.y += age * (.5 + aSeed * 1.5) + age * age * .4;
        p.z += age * (aSeed - .5) * .8;
        vSample = vec2(mix(aHome.x, 1. - aHome.x, uBack), aHome.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `
      uniform sampler2D uTexture;
      varying vec2 vSample;
      void main() {
        gl_FragColor = vec4(texture2D(uTexture, vSample).rgb, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const object = new THREE.Mesh(geometry, material)
  object.frustumCulled = false
  object.visible = false
  return {
    object,
    start(texture: THREE.Texture, back: boolean) {
      uniforms.uTexture.value = texture
      uniforms.uBack.value = back ? 1 : 0
      uniforms.uTime.value = 0
      object.visible = true
    },
    update(time: number) {
      uniforms.uTime.value = time
      object.visible = time < 1.6
    },
    reset() {
      object.visible = false
      uniforms.uTime.value = 0
    },
  }
}
