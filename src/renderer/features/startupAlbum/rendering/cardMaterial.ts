import * as THREE from 'three'
import { cardCoatingFragment, cardCoatingFunctions, cardCoatingVertex } from './cardCoating'

// Print mask: red = cover, green = printed text, black = background.
// Preserve the production cover treatment, compose the substrate independently.
export function createCardCoating(
  map: THREE.CanvasTexture,
  mask: THREE.CanvasTexture,
  redSurface: { value: number },
  uniforms: {
    finish: { value: number }
    sweepPosition: { value: number }
    sweepStrength: { value: number }
  },
) {
  // The intact card uses the same program variant as its fading fragments,
  // avoiding a first-use foil compilation stall in the middle of a skip.
  const material = new THREE.MeshBasicMaterial({
    map,
    toneMapped: false,
    transparent: true,
    side: THREE.DoubleSide,
  })
  material.customProgramCacheKey = () => 'album-card-semantic-foil-v2'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCardFinish = uniforms.finish
    shader.uniforms.uSweepPosition = uniforms.sweepPosition
    shader.uniforms.uSweepStrength = uniforms.sweepStrength
    shader.uniforms.uPrintMask = { value: mask }
    shader.uniforms.uRedSurface = redSurface
    shader.vertexShader =
      'varying vec3 vCardNormal;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', cardCoatingVertex)
    shader.fragmentShader =
      'uniform sampler2D uPrintMask;\nuniform float uRedSurface;\n' +
      cardCoatingFunctions +
      shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      cardCoatingFragment() +
        /* glsl */ `
      {
        vec2 semanticMask = texture2D(uPrintMask, uv).rg;
        float backgroundWeight = (1. - semanticMask.r) * (1. - semanticMask.g);
        // Saturated red stays dominant at rest. Bring the spectrum back with
        // real surface tilt instead of tinting the entire red sheet yellow.
        float film = mix(.58, .10 + viewTilt * .34, uRedSurface) * (.22 + band * .78);
        vec3 backgroundColor = mix(printColor, spectral, film);
        float facets = mix(.015 + viewTilt * .035, viewTilt * .025, uRedSurface);
        backgroundColor = mix(backgroundColor, blendOverlay(printColor, facetColor), facets);
        vec3 reflection = sunpillarGradient(dot(uv, vec2(.62, .78)) * 1.65 + view.x * .7 - view.y * .5);
        // Coloured reflection on dark substrates; avoid a neutral white overlay.
        float reflectionStrength = (.025 + band * .145) * (.3 + viewTilt * .7) + sweep * .08;
        reflectionStrength *= mix(1., .10 + viewTilt * .9, uRedSurface);
        backgroundColor += (1. - backgroundColor) * reflection * reflectionStrength;
        // Keep the production maximum per-channel lift. Text is excluded using
        // glyph coverage rasterized at the same coordinates as the artwork.
        float liftBudget = .16 * mix(1., .25 + viewTilt * .75, uRedSurface);
        backgroundColor = clamp(backgroundColor, printColor * mix(.82, .92, uRedSurface), printColor + (1. - printColor) * liftBudget);
        diffuseColor.rgb = mix(diffuseColor.rgb, sRGBTransferEOTF(vec4(backgroundColor, 1.)).rgb, backgroundWeight);
        diffuseColor.rgb = mix(diffuseColor.rgb, sRGBTransferEOTF(vec4(printColor, 1.)).rgb, semanticMask.g);
      }
    `,
    )
  }
  return material
}
