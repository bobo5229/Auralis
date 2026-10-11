import { fragmentSource } from '../../../src/renderer/features/playback/runtime/liquidMetalShader.ts'

// Keep the production height field, palette, normal and legacy shading together.
// The prototype inserts only optional curl and a new reflected environment.
function replaceOnce(source, anchor, replacement) {
  if (source.split(anchor).length !== 2)
    throw new Error('生产 shader 的结构已变化，请重新核对原型插入点。')
  return source.replace(anchor, replacement)
}

const environment = `
vec3 displayMetal(vec3 x) {
  // Filmic highlight shoulder in linear light; unlike the legacy mapping,
  // the toe preserves near-black reflected regions before display encoding.
  x = max(x, vec3(0.));
  x = clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);
  return mix(12.92*x,1.055*pow(x,vec3(1./2.4))-.055,
             step(vec3(.0031308),x));
}
float mirrorBand(float x, float center, float width) {
  // Integrate the narrow panel over the pixel footprint at pinched reflections.
  float footprint = fwidth(x)*.55;
  float filteredWidth = sqrt(width*width+footprint*footprint);
  return exp(-pow((x-center)/filteredWidth,2.))*width/filteredWidth;
}
vec3 mirrorMetal(vec3 n, vec3 r, vec3 tint) {
  // Light sources are sampled in reflected direction, not painted onto UVs.
  float axis = r.y*.82 + r.x*.34;
  float across = r.x*.76 - r.z*.48;
  axis += .065*sin(across*4.2+r.z*2.1);
  float w = .010 + u_roughness*.09;
  float panel = mirrorBand(axis,.69,.20+u_roughness*.3);
  float key = mirrorBand(axis,.245,w);
  float shoulder = mirrorBand(axis,.245,w*2.8);
  float strip = mirrorBand(axis,-.49,w*1.3);
  float returnLight = mirrorBand(axis,-.76,.15+u_roughness*.2);
  // Each bright panel has an adjacent dark reflector. Nested thin reflections
  // appear as the same continuous normal field compresses the environment.
  float seam = mirrorBand(axis,.36,.045+u_roughness*.1);
  float secondSeam = mirrorBand(axis,-.37,.038+u_roughness*.1);
  float trim = mirrorBand(axis,.79,w*.55);
  float echo = mirrorBand(axis,-.14,w*.65)
               + .55*mirrorBand(axis,.52,w*.45);
  float spot = mirrorBand(across,.14,.18);
  float fill = mix(.16,.03,u_depth);
  float gradient = .5+.5*sin(axis*5.3+across*.7+r.z*.5);
  float environment = fill + .13*gradient + .50*panel + .20*returnLight;
  environment *= 1.-u_depth*.96*max(seam,secondSeam);
  float luminance = dot(tint,vec3(.2126,.7152,.0722));
  vec3 reflectance = mix(vec3(.68),
    clamp(tint/sqrt(max(luminance,.025)),vec3(.025),vec3(.98)),.88);
  float grazing = pow(1.-max(n.z,0.),5.);
  vec3 fresnel = reflectance + (1.-reflectance)*grazing;
  vec3 color = fresnel*environment;
  // Preserve the album hue in broad reflections; bright softboxes approach
  // neutral white locally rather than desaturating the whole material.
  vec3 lightTint = mix(fresnel,vec3(1.,.985,.96),.3);
  color += fresnel*shoulder*.16;
  color += lightTint*(key*(2.35+spot*1.2)+strip*1.65+trim*.44+echo*.40);
  return displayMetal(color);
}
`

let next = replaceOnce(
  fragmentSource,
  'uniform float u_roughness;',
  'uniform float u_roughness;\nuniform float u_mirror;\nuniform float u_depth;\nuniform float u_detail;',
)
next = replaceOnce(
  next,
  '  vec2 q = vec2(fbm',
  `  // Optional second slow eddy; zero leaves the production surface unchanged.
  vec2 eddy = p-vec2(.8,-.45);
  float turn = u_detail*1.8*exp(-dot(eddy,eddy)*.62)
               *(.92+.08*sin(t*.08));
  p = mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*eddy+vec2(.8,-.45);
  vec2 q = vec2(fbm`,
)
next = replaceOnce(next, 'void main() {', environment + '\nvoid main() {')
next = replaceOnce(
  next,
  '  return .58*ridges + .28*broad + localFold*.06*sin(phase*2.8);',
  `  // Secondary broad ripples add nested normal directions without more noise
  // octaves. At zero detail the production height remains exactly unchanged.
  float secondary = .10*sin(phase*2.45+.4*sin(warped.x*1.3))
                     + .03*sin(phase*4.9+warped.y*.6);
  return .58*ridges + .28*broad + localFold*.06*sin(phase*2.8)
          + u_detail*secondary;`,
)
next = replaceOnce(
  next,
  '  outColor = vec4(color,1.);',
  '  color = mix(color,mirrorMetal(n,reflection,tint),u_mirror);\n  outColor = vec4(color,1.);',
)

export const refinedFragmentSource = next
