import * as THREE from 'three'
import {
  cardCoatingFragment,
  cardCoatingFunctions,
  cardCoatingVertex,
} from '../../../src/renderer/features/startupAlbum/rendering/cardCoating'

// Keep the original grey-substrate treatment available for design comparison.
export function createLegacyCoating(map: THREE.CanvasTexture) {
  const material = new THREE.MeshBasicMaterial({
    map,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  material.customProgramCacheKey = () => 'background-prototype-legacy-foil'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCardFinish = { value: 0 }
    shader.uniforms.uSweepPosition = { value: 1.5 }
    shader.uniforms.uSweepStrength = { value: 0 }
    shader.vertexShader =
      'varying vec3 vCardNormal;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', cardCoatingVertex)
    shader.fragmentShader = cardCoatingFunctions + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      cardCoatingFragment(),
    )
  }
  return material
}
