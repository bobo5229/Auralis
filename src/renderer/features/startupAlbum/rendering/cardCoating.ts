import { pokeboxFoilFunctions } from './vendor/pokeboxFoil'
import { cardLayout } from './cardLayout'

const coverLeft = cardLayout.cover.x / cardLayout.width
const coverRight = (cardLayout.cover.x + cardLayout.cover.size) / cardLayout.width
const coverBottom = 1 - (cardLayout.cover.y + cardLayout.cover.size) / cardLayout.height
const coverTop = 1 - cardLayout.cover.y / cardLayout.height

// Crossed light-band composition adapts Pokebox regular-holo.frag at the same
// pinned revision as vendor/pokeboxFoil.ts; its MIT notice is retained there.
// Masks, view-angle mapping, engraving and the shared colour budget are local.

export const cardCoatingVertex = /* glsl */ `
#include <begin_vertex>
vCardNormal = normalize(normalMatrix * normal);
`

export const cardCoatingFunctions = /* glsl */ `
varying vec3 vCardNormal;
uniform float uCardFinish, uSweepPosition, uSweepStrength;
${pokeboxFoilFunctions}

float cardSeed(vec2 p) { return fract(sin(dot(p, vec2(73.17, 219.43))) * 18437.29); }

float cardCoverMask(vec2 uv) {
  vec2 feather = vec2(.008, .006);
  vec2 lower = smoothstep(vec2(${coverLeft}, ${coverBottom}), vec2(${coverLeft}, ${coverBottom}) + feather, uv);
  vec2 upper = 1. - smoothstep(vec2(${coverRight}, ${coverTop}) - feather, vec2(${coverRight}, ${coverTop}), uv);
  return lower.x * lower.y * upper.x * upper.y;
}

float cardBorderMask(vec2 uv) {
  float side = 1. - smoothstep(.022, .052, min(uv.x, 1. - uv.x));
  float top = smoothstep(.962, .988, uv.y);
  float bottom = 1. - smoothstep(.075, .125, uv.y);
  float corners = .38 + .62 * smoothstep(.08, .44, abs(uv.x - .5));
  return max(max(side, top), bottom * corners);
}

vec2 cardContour(vec2 uv) {
  vec2 point = (uv - vec2(.18, .025)) * vec2(1., 1.4333);
  float field = length(point) + .045 * sin(point.x * 9. + point.y * 4.)
    + .018 * sin(point.y * 17. - point.x * 7.);
  float phase = field * 25.;
  float distance = abs(fract(phase) - .5);
  float line = 1. - smoothstep(.035, .035 + max(fwidth(phase), .001), distance);
  return vec2(field, line);
}

float cardFoilBand(float phase) {
  float distance = abs(fract(phase) - .5);
  float aa = max(fwidth(phase), .001);
  return 1. - smoothstep(.055, .19 + aa, distance);
}

float cardCrossBands(vec2 uv, vec2 view) {
  // Independent directions/offsets, adapted from Pokebox's regular-holo bars.
  float angle = .28 + view.x * .24 - view.y * .12;
  float first = cardFoilBand(dot(uv, vec2(cos(angle), sin(angle))) * 2.1
    + view.x * .7 - view.y * .35);
  float second = cardFoilBand(dot(uv, vec2(cos(-angle), sin(-angle))) * 1.75
    - view.x * .45 + view.y * .65 + .3);
  return 1. - (1. - first) * (1. - second * .6);
}

float cardSparkle(vec2 uv, vec2 view) {
  vec2 cell = floor(uv * vec2(145., 208.));
  vec2 local = fract(uv * vec2(145., 208.));
  vec2 facet = vec2(cardSeed(cell + 3.7), cardSeed(cell + 17.1)) * 2. - 1.;
  float alignment = pow(max(0., 1. - length(view - facet * .8) * 1.4), 9.);
  float fleck = (1. - smoothstep(.12, .34, length(local - .5))) * step(.25, cardSeed(cell));
  return alignment * fleck;
}
`

export function cardCoatingFragment(): string {
  return /* glsl */ `
#include <color_fragment>
vec2 uv = vMapUv;
// The orthographic camera supplies a constant view direction. No pointer/time
// uniform: coating follows the real surface angle, and settles without drawing.
vec2 view = reflect(vec3(0., 0., -1.), normalize(vCardNormal)).xy;
float art = cardCoverMask(uv);
float border = cardBorderMask(uv);
float substrate = 1. - art;
vec2 contour = cardContour(uv);
float viewTilt = smoothstep(.06, .65, length(view));
vec2 pointer = clamp(vec2(.5) + view * .38, vec2(.08), vec2(.92));
float bgY = .5 + view.y * .13;
vec3 printColor = sRGBTransferOETF(vec4(diffuseColor.rgb, 1.)).rgb;
float luminance = dot(printColor, vec3(.2126, .7152, .0722));
// Protect dark printed strokes, not the rectangular area containing the text.
// The cover retains its existing dark-detail protection independently.
float inkProtection = mix(smoothstep(.34, .65, luminance),
  smoothstep(.08, .65, luminance), art);

// Reuse Pokebox's feathered mask, angled spectrum and local spotlight. Limit
// cover intensity separately. The film is continuous over all printed surfaces.
float coating = mix(.24, .14, art) * inkProtection;
vec3 spectral = holoShineAngled(printColor, uv, pointer, bgY, 1.,
  .5, 1.65, 2.2, 1., 1., 28.);
float band = cardCrossBands(uv, view);
float sparkle = cardSparkle(uv, view);
float intensity = clamp(mix(.12 + band * .65, .08 + sparkle * .92, uCardFinish), 0., 1.);
vec3 coated = mix(printColor, spectral, coating * intensity);

// A fixed Voronoi cell has its own colour phase (Pokebox holoShineMosaic).
// Continue the same etching through the information area's grey substrate;
// only the cover and actual dark text strokes attenuate it.
vec3 facetColor = vec3(.5);
if (substrate > .001) {
  vec2 cell = voronoiCell(uv * vec2(23., 33.));
  float phaseOffset = cellHash(cell.x) * 6.;
  float phase = dot(uv, vec2(.62, .78)) * 1.65 + phaseOffset + view.x * .8 - view.y * .55;
  facetColor = sunpillarGradient(phase);
  float facetWeight = substrate * inkProtection * (.025 + viewTilt * .085);
  coated = mix(coated, blendOverlay(printColor, facetColor), facetWeight);
}

float sweepDistance = dot(uv, vec2(.5, .5)) - uSweepPosition;
float sweep = exp(-sweepDistance * sweepDistance / .008) * clamp(uSweepStrength, 0., 1.);
vec3 rainbow = sunpillarGradient(dot(uv, vec2(.62, .78)) * 1.65 + view.x * .7 - view.y * .5);
vec3 highlight = mix(rainbow, vec3(.85, .91, 1.), sweep * .65);
float lift = min(.16, coating * (intensity * .35 + sweep * .65));
coated += (1. - coated) * highlight * lift;

vec3 contourRainbow = mix(rainbow, facetColor, .45);
vec3 contourInk = mix(printColor * vec3(.72, .79, .88),
  printColor * (.52 + .48 * contourRainbow), viewTilt);
float localGleam = pow(.5 + .5 * sin(contour.x * 7. + view.x * 3. - view.y * 2.), 4.);
coated = mix(coated, contourInk, border * contour.y * (.22 + .28 * viewTilt * localGleam));

// All layers share one display-space budget, including overlay/mosaic. A final
// clamp prevents stacked layers from bypassing ink protection or washing out art.
vec3 lowerBound = printColor * (1. - .18 * inkProtection);
vec3 upperBound = printColor + (1. - printColor) * (.16 * inkProtection);
coated = clamp(coated, lowerBound, upperBound);
diffuseColor.rgb = sRGBTransferEOTF(vec4(coated, 1.)).rgb;
`
}
