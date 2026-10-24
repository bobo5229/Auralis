import{W as ct,P as lt}from"./three.module-CRMHqCR0.js";import{S as He,B as dt,M as pe,a as ft,P as ut,b as W,I as pt,O as ht,c as vt,d as mt,D as ke,e as _e,f as Ne,G as he,E as Ue,V as ve,g as gt,F as wt,L as xt,h as bt,i as te,j as K,Q as Ce,k as yt,A as Mt,l as Ct,m as Ge,H as St,R as kt}from"./three.core-ClPm_2uc.js";import{c as We,a as Tt,b as Pt,e as Rt,r as At}from"./cardArtwork-8SCADANd.js";import{b as X}from"./cardTypography-gOHESpTd.js";import"./index-DAokQUYA.js";class Et extends He{constructor(){super();const e=new dt;e.deleteAttribute("uv");const s=new pe({side:ft}),c=new pe,x=new ut(16777215,900,28,2);x.position.set(.418,16.199,.3),this.add(x);const i=new W(e,s);i.position.set(-.757,13.219,.717),i.scale.set(31.713,28.305,28.591),this.add(i);const l=new pt(e,c,6),n=new ht;n.position.set(-10.906,2.009,1.846),n.rotation.set(0,-.195,0),n.scale.set(2.328,7.905,4.651),n.updateMatrix(),l.setMatrixAt(0,n.matrix),n.position.set(-5.607,-.754,-.758),n.rotation.set(0,.994,0),n.scale.set(1.97,1.534,3.955),n.updateMatrix(),l.setMatrixAt(1,n.matrix),n.position.set(6.167,.857,7.803),n.rotation.set(0,.561,0),n.scale.set(3.927,6.285,3.687),n.updateMatrix(),l.setMatrixAt(2,n.matrix),n.position.set(-2.017,.018,6.124),n.rotation.set(0,.333,0),n.scale.set(2.002,4.566,2.064),n.updateMatrix(),l.setMatrixAt(3,n.matrix),n.position.set(2.291,-.756,-2.621),n.rotation.set(0,-.286,0),n.scale.set(1.546,1.552,1.496),n.updateMatrix(),l.setMatrixAt(4,n.matrix),n.position.set(-2.193,-.369,-5.547),n.rotation.set(0,.516,0),n.scale.set(3.875,3.487,2.986),n.updateMatrix(),l.setMatrixAt(5,n.matrix),this.add(l);const u=new W(e,ne(50));u.position.set(-16.116,14.37,8.208),u.scale.set(.1,2.428,2.739),this.add(u);const m=new W(e,ne(50));m.position.set(-16.109,18.021,-8.207),m.scale.set(.1,2.425,2.751),this.add(m);const I=new W(e,ne(17));I.position.set(14.904,12.198,-1.832),I.scale.set(.15,4.265,6.331),this.add(I);const h=new W(e,ne(43));h.position.set(-.462,8.89,14.52),h.scale.set(4.38,5.441,.088),this.add(h);const r=new W(e,ne(20));r.position.set(3.235,11.486,-12.541),r.scale.set(2.5,2,.1),this.add(r);const o=new W(e,ne(100));o.position.set(0,20,0),o.scale.set(1,.1,1),this.add(o)}dispose(){const e=new Set;this.traverse(s=>{s.isMesh&&(e.add(s.geometry),e.add(s.material))});for(const s of e)s.dispose()}}function ne(a){return new vt({color:0,emissive:16777215,emissiveIntensity:a})}/*!
 * Selected GLSL functions from selop/pokebox, formatting adapted.
 * Source: https://github.com/selop/pokebox/tree/7f6b1b4b6bb4684f80b49d1318b2a1c90a357b80/src/shaders/common
 * Files: blend.glsl, rainbow.glsl, voronoi.glsl, holo-shine.glsl.
 * MIT License
 * Copyright (c) 2026 Sergej Lopatkin
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */const Bt=`
vec3 blendOverlay(vec3 base, vec3 blend) {
  return mix(2.0 * base * blend,
    1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, base));
}

vec3 getSunColor(int i) {
  if (i == 0) return vec3(1.0, 0.46, 0.46);
  if (i == 1) return vec3(1.0, 0.90, 0.38);
  if (i == 2) return vec3(0.58, 1.0, 0.38);
  if (i == 3) return vec3(0.52, 1.0, 0.92);
  if (i == 4) return vec3(0.48, 0.53, 1.0);
  return vec3(0.74, 0.46, 1.0);
}

vec3 sunpillarGradient(float t) {
  float f = fract(t) * 6.0;
  int idx = int(floor(f));
  float blend = fract(f);
  vec3 c0 = getSunColor(idx);
  vec3 c1 = getSunColor(int(mod(float(idx + 1), 6.0)));
  return mix(c0, c1, blend);
}

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

vec2 voronoiCell(vec2 uv) {
  vec2 cell = floor(uv);
  vec2 frac = fract(uv);
  float minDist = 10.0;
  float cellID = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 neighbor = vec2(float(i), float(j));
      vec2 point = hash2(cell + neighbor);
      vec2 diff = neighbor + point - frac;
      float dist = dot(diff, diff);
      if (dist < minDist) {
        minDist = dist;
        cellID = dot(cell + neighbor, vec2(7.0, 157.0));
      }
    }
  }
  return vec2(cellID, sqrt(minDist));
}

float cellHash(float id) {
  return fract(sin(id * 127.1) * 43758.5453);
}

vec3 holoShineAngled(vec3 base, vec2 uv, vec2 pointer, float bgY,
  float mask, float maskThreshold, float rainbowScale, float rainbowShift,
  float holoOpacity, float cardOpacity, float angleDeg) {
  float holoMask = smoothstep(maskThreshold - 0.05, maskThreshold + 0.05, mask);
  if (holoMask < 0.01 || holoOpacity < 0.01) return base;
  float angleRad = angleDeg * 3.14159265 / 180.0;
  vec2 dir = vec2(cos(angleRad), sin(angleRad));
  float tiltOffset = (0.5 - bgY) * rainbowShift;
  float ptrOffset = (0.5 - pointer.y) * 0.5;
  float rainbowT = dot(uv, dir) * rainbowScale + tiltOffset + ptrOffset;
  vec3 rainbow = sunpillarGradient(rainbowT);
  float spotDist = length(uv - pointer);
  float spotlight = 0.5 + (0.75 - smoothstep(0.1, 0.7, spotDist)) * 0.5;
  rainbow *= spotlight;
  return mix(base, blendOverlay(base, rainbow), holoMask * holoOpacity * cardOpacity);
}
`,ze=X.cover.x/X.width,Ye=(X.cover.x+X.cover.size)/X.width,qe=1-(X.cover.y+X.cover.size)/X.height,je=1-X.cover.y/X.height,Lt=`
#include <begin_vertex>
vCardNormal = normalize(normalMatrix * normal);
`,Dt=`
varying vec3 vCardNormal;
uniform float uCardFinish, uSweepPosition, uSweepStrength;
${Bt}

float cardSeed(vec2 p) { return fract(sin(dot(p, vec2(73.17, 219.43))) * 18437.29); }

float cardCoverMask(vec2 uv) {
  vec2 feather = vec2(.008, .006);
  vec2 lower = smoothstep(vec2(${ze}, ${qe}), vec2(${ze}, ${qe}) + feather, uv);
  vec2 upper = 1. - smoothstep(vec2(${Ye}, ${je}) - feather, vec2(${Ye}, ${je}), uv);
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
`;function Ft(){return`
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
`}function $e(a,e,s,c){const x=new mt({map:a,toneMapped:!1,transparent:!0,side:ke});return x.customProgramCacheKey=()=>"album-card-semantic-foil-v2",x.onBeforeCompile=i=>{i.uniforms.uCardFinish=c.finish,i.uniforms.uSweepPosition=c.sweepPosition,i.uniforms.uSweepStrength=c.sweepStrength,i.uniforms.uPrintMask={value:e},i.uniforms.uRedSurface=s,i.vertexShader=`varying vec3 vCardNormal;
`+i.vertexShader.replace("#include <begin_vertex>",Lt),i.fragmentShader=`uniform sampler2D uPrintMask;
uniform float uRedSurface;
`+Dt+i.fragmentShader,i.fragmentShader=i.fragmentShader.replace("#include <color_fragment>",Ft()+`
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
    `)},x}function It(a,e={}){let s=e.appearance??We(a.cover,e.background),c=a.id;const x=Tt(),i=Pt(a,s,x),l={value:0},n={value:1.5},u={value:0},m={value:s.redSurface},I={finish:l,sweepPosition:n,sweepStrength:u},h=$e(i,x,m,I),r=2.65,o=3.8,d=.09,f=new _e;f.moveTo(-r/2+d,-o/2),f.lineTo(r/2-d,-o/2),f.quadraticCurveTo(r/2,-o/2,r/2,-o/2+d),f.lineTo(r/2,o/2-d),f.quadraticCurveTo(r/2,o/2,r/2-d,o/2),f.lineTo(-r/2+d,o/2),f.quadraticCurveTo(-r/2,o/2,-r/2,o/2-d),f.lineTo(-r/2,-o/2+d),f.quadraticCurveTo(-r/2,-o/2,-r/2+d,-o/2);const p=new Ne(f,8),E=p.getAttribute("position"),Y=p.getAttribute("uv");for(let y=0;y<E.count;y++)Y.setXY(y,E.getX(y)/r+.5,E.getY(y)/o+.5);const M=new he,C=new W(new Ue(f,{depth:.035,bevelEnabled:!1,curveSegments:8}),new pe({color:"#e1d6c9",roughness:.68,transparent:!0,side:ke})),w=C.geometry.groups[1];C.geometry.setDrawRange(w.start,w.count),C.position.z=-.0175;const S=new W(p,h);return S.position.z=.018,M.add(C,S),{object:M,face:S,hoverSurface:new W(p,h),width:r,height:o,texture:i,printMask:x,createFragmentMaterial(){return $e(i,x,m,I)},get appearance(){return s},disposeArtwork(){i.dispose(),x.dispose()},setEntranceSweep(y,k){n.value=y,u.value=k},setContent(y,k=We(y.cover,y.id===c?s.background:e.background,y.id===c?s.patternSeed:void 0)){c=y.id,s=k,m.value=s.redSurface,Rt(i,y,s,x)},setFinish(y){l.value=y==="glitter"?1:0}}}const le=(a,e,s)=>{const c=K.clamp((s-a)/(e-a),0,1);return c*c*(3-2*c)};function Ot(a,e,s){const c=[];return a.forEach((x,i)=>{const l=a[(i+1)%a.length],n=x.dot(e)-s,u=l.dot(e)-s;n<=1e-9&&c.push(x.clone()),(n<0&&u>0||n>0&&u<0)&&c.push(x.clone().lerp(l,n/(n-u)))}),c}function Gt(a){let e=0;const s=new ve;return a.forEach((c,x)=>{const i=a[(x+1)%a.length],l=c.x*i.y-i.x*c.y;e+=l,s.x+=(c.x+i.x)*l,s.y+=(c.y+i.y)*l}),s.divideScalar(3*e)}const Ve=1400;function Wt(a,e){let s=e>>>0;const c=()=>(s=Math.imul(s,1664525)+1013904223>>>0,s/2**32),x=a.hoverSurface.geometry.getAttribute("position"),i=new Map;for(let h=0;h<x.count;h++){const r=new ve(x.getX(h),x.getY(h));i.set(`${r.x},${r.y}`,r)}const l=[...i.values()].sort((h,r)=>Math.atan2(h.y,h.x)-Math.atan2(r.y,r.x)),n=[[-.72,1.35],[.63,1.2],[-.86,.12],[.2,.32],[.88,-.4],[-.62,-1.24],[.53,-1.38]].map(([h,r])=>new ve(h+(c()-.5)*.32,r+(c()-.5)*.38)),u=new he,m=n.map((h,r)=>{let o=l.map(v=>v.clone());n.forEach((v,B)=>{r!==B&&(o=Ot(o,v.clone().sub(h),(v.lengthSq()-h.lengthSq())/2))});const d=Gt(o),f=new _e(o.map(v=>v.clone().sub(d))),p=new Ne(f),E=p.getAttribute("position"),Y=p.getAttribute("uv");for(let v=0;v<E.count;v++)Y.setXY(v,(E.getX(v)+d.x)/a.width+.5,(E.getY(v)+d.y)/a.height+.5);const M=a.createFragmentMaterial(),C=new pe({color:"#e1d6c9",roughness:.68,side:ke}),w=new W(p,M);w.position.z=.018;const S=new W(new Ue(f,{depth:.035,bevelEnabled:!1,curveSegments:8}),C),y=S.geometry.groups[1];S.geometry.setDrawRange(y.start,y.count),S.position.z=-.0175;const k=new he;k.add(S,w),k.position.set(d.x,d.y,0),u.add(k);const D=[];o.forEach((v,B)=>{const L=o[(B+1)%o.length],O=v.clone().lerp(L,.5);n.some((b,j)=>j!==r&&Math.abs(O.distanceToSquared(h)-O.distanceToSquared(b))<1e-6)&&D.push(v.x-d.x,v.y-d.y,.019,L.x-d.x,L.y-d.y,.019)});const z=new gt;z.setAttribute("position",new wt(D,3));const A=new xt({color:"#f2e8d9",transparent:!0,depthWrite:!1}),U=new bt(z,A);k.add(U);for(const v of[M,C])v.transparent=!0,v.depthWrite=!0;return{object:k,center:d,polygon:o,face:w,edge:S,crackGeometry:z,crackMaterial:A,crackVertices:D,drift:(c()-.5)*.22,depth:(c()-.5)*1.5,spin:new te((c()-.5)*2.4,(c()-.5)*2.8,(c()-.5)*1.4),delay:c()*.055}});let I=!1;return{group:u,setProgress(h){const r=K.clamp(h,0,1);a.object.visible=r<.025,u.visible=r>=.025&&r<1;for(const o of m){const d=le(.19+o.delay,.46,r),f=Math.max(0,(r-.3-o.delay)/(.7-o.delay)),p=f*(.5+.5*f);o.object.position.set(o.center.x+o.center.x*(d*.017+p*.64)+o.drift*p,o.center.y+o.center.y*(d*.017+p*.38)+.2*f-1.55*f*f,o.depth*p),o.object.rotation.set(o.spin.x*p,o.spin.y*p,o.spin.z*p);const E=1-le(.72+o.delay,1,r);for(const C of[o.face,o.edge])C.material.opacity=E;o.crackMaterial.opacity=le(.025,.15,r)*(1-le(.27,.46,r))*.48;const Y=o.crackGeometry.getAttribute("position"),M=Y.count/2;for(let C=0;C<M;C++){const w=C*6,S=le(.025+C/M*.12,.13+C/M*.12,r);Y.setXYZ(C*2+1,K.lerp(o.crackVertices[w],o.crackVertices[w+3],S),K.lerp(o.crackVertices[w+1],o.crackVertices[w+4],S),.019)}Y.needsUpdate=!0}},dispose(){if(!I){I=!0;for(const h of m){for(const r of[h.face,h.edge])r.geometry.dispose(),r.material.dispose();h.crackGeometry.dispose(),h.crackMaterial.dispose()}u.removeFromParent()}}}}const Xe=1200,Se=a=>{const e=Math.max(0,Math.min(1,a));return e*e*(3-2*e)};function zt(a,e,s,c,x,i,l){const n=a.domElement,u=n.getBoundingClientRect(),m=l.getBoundingClientRect();if(!l.isConnected||u.width<=0||u.height<=0||m.width<140||m.height<=0||m.top<100||m.top>=innerHeight||m.right<=0||m.left>=innerWidth||typeof l.animate!="function"||getComputedStyle(l).visibility==="hidden")return null;const I=n.style.cssText,h=[e.left,e.right,e.top,e.bottom],r=a.autoClear,o=(e.top-e.bottom)/u.height,d=(e.right-e.left)/u.width,f=c.getWorldPosition(new te),p=c.getWorldQuaternion(new Ce),E=c.getWorldScale(new te),Y=new Ce,M=new Ce,C=new yt,w=innerWidth,S=innerHeight,y=80*o/i,k=new te(y,y,y),D=[-1,1].flatMap(R=>[-1,1].map(b=>new te(R*x/2,b*i/2,0))),z=new te,A=Math.max(m.left+48,Math.min(m.right-48,m.left+m.width/2)),U=e.position.x+e.left+(A-u.left)*d,v=e.position.y+e.top-(m.top-u.top)*o;let B,L=!1,O=!1;return e.left-=u.left*d,e.right=e.left+w*d,e.top+=u.top*o,e.bottom=e.top-S*o,e.updateProjectionMatrix(),Object.assign(n.style,{position:"fixed",left:"0px",top:"0px",width:`${w}px`,height:`${S}px`,pointerEvents:"none"}),a.setDrawingBufferSize(w,S,Math.min(devicePixelRatio,2)),a.autoClear=!1,s.position.copy(f),s.quaternion.copy(p),s.scale.copy(E),c.position.set(0,0,0),c.quaternion.identity(),c.scale.setScalar(1),{update(R){const b=l.getBoundingClientRect();if(!l.isConnected||b.width<=0||b.height<=0||innerWidth!==w||innerHeight!==S||Math.abs(b.left-m.left)>1||Math.abs(b.width-m.width)>1||Math.abs(b.height-m.height)>1||Math.abs(b.top-m.top)>(L?4:1)||getComputedStyle(l).visibility==="hidden")return!1;const j=Math.max(0,Math.min(1,(R-150)/800)),$=Se(j),Q=Se((R-950)/250),F=12*o*Se(R/150);s.position.set(K.lerp(f.x,U,$),K.lerp(f.y-F,v+36*o,j*j)-80*o*Math.sin(j*Math.PI)-76*o*Q,f.z),s.scale.copy(E).lerp(k,$),s.quaternion.copy(p).slerp(Y,$),C.set(Math.PI*2*$+K.degToRad(78)*Q,0,K.degToRad(15)*Math.sin(j*Math.PI)),M.setFromEuler(C),s.quaternion.premultiply(M),s.updateMatrixWorld(!0);let P=-1/0;for(const Z of D)c.localToWorld(z.copy(Z)).project(e),P=Math.max(P,(1-z.y)*S/2);!L&&R>=800&&P>=b.top&&(L=!0,B=l.animate([{transform:"translateY(0)"},{transform:"translateY(3px)",offset:.35},{transform:"translateY(0)"}],{duration:250,easing:"cubic-bezier(.22,1,.36,1)",composite:"add"})),a.setScissorTest(!1),a.clear();const ie=Math.max(0,Math.min(S,l.getBoundingClientRect().top));return a.setScissor(0,S-ie,w,ie),a.setScissorTest(!0),!0},dispose(){O||(O=!0,B==null||B.cancel(),a.setScissorTest(!1),a.autoClear=r,n.style.cssText=I,[e.left,e.right,e.top,e.bottom]=h,e.updateProjectionMatrix())}}}const N=(a,e,s)=>Math.min(s,Math.max(e,a)),Yt=Math.PI/120,de=(a,e,s)=>{const c=N((s-a)/(e-a),0,1);return c*c*(3-2*c)};function Ht(a,e,s,c=window.matchMedia("(prefers-reduced-motion: reduce)"),x){const i=new ct({antialias:!0,alpha:!0,powerPreference:"low-power"});i.toneMapping=Mt,i.toneMappingExposure=.85,i.setClearColor(0,0),a.appendChild(i.domElement);const l=i.domElement;l.setAttribute("aria-hidden","true");const n=new He,u=new Ct(-4,4,4,-4,.1,100);u.position.set(0,.1,12),u.lookAt(0,.1,0);const m=new Et,I=new lt(i),h=I.fromScene(m,.04);m.dispose(),I.dispose(),n.environment=h.texture,n.environmentIntensity=.75;const r=new Ge("#fff7ed",1);r.position.set(-3,5,7);const o=new Ge("#d8d0f2",.6);o.position.set(4,-1,5),n.add(r,o,new St("#ffffff","#8b8394",.35));const d=new he;n.add(d);const f=It(s,{appearance:x}),p=f.object;let E=!1;f.face.onAfterRender=()=>{E=!0};const Y=[f.face];d.add(p);const M=c;let C="full",w=0,S="bands",y=s.id,k=0,D=0,z=0,A=0,U=0,v=0,B=!1,L=!1,O=!0,R,b,j=0,$=0,Q,F,P,ie=0,Z=0,re;const me=new kt,Te=new ve;let H=null,J=!1;const ae=()=>M.matches?.15:C==="full"?1.3:.35,ge=()=>w<ae();function Pe(){return{entrance:C,entranceProgress:N(w/ae(),0,1),entering:ge(),reducedMotion:M.matches,sweepStrength:z,entranceY:d.position.y,entranceX:d.position.x,entranceRotationX:d.rotation.x,entranceRotationY:d.rotation.y,entranceRotationZ:d.rotation.z,frames:U,cardRendered:E,pending:!!A,disposed:B,calls:i.info.render.calls,triangles:i.info.render.triangles,cardFinish:S,contentId:y,cardTilt:{x:p.rotation.x,y:p.rotation.y},contextLost:L,shattering:!!b,shatterProgress:$,dropping:!!P,dropProgress:Z}}function V(){e(Pe())}function Qe(t){n.updateMatrixWorld(!0);const T=p.localToWorld(new te(0,t==="card"?1.82:0,.02)).project(u),g=l.getBoundingClientRect();return{x:g.left+(T.x+1)*g.width/2,y:g.top+(1-T.y)*g.height/2}}function G(){B||!O||document.hidden||L||A||(A=requestAnimationFrame(Ke))}function fe(){const t=N(w/ae(),0,1);let T=1,g=0,q=0,_=0,xe=0,be=0,ye=1.5;if(z=0,l.style.opacity=M.matches?String(de(0,1,t)):"1",!M.matches&&t<1)if(C==="full"){const oe=1-(1-N(w/.98,0,1))**3,Ie=de(.98,1.3,w),Me=Math.sin(Ie*Math.PI*2)*(1-Ie)*.025;T=.82+oe*.18+Me*.3,q=(u.bottom-2.7-.18)*(1-oe)+Me;const at=t+.1*Math.sin(t*Math.PI*2)+.025*Math.sin(t*Math.PI*4),st=t+.08*Math.sin(t*Math.PI*2)-.035*Math.sin(t*Math.PI*4);_=-Math.PI*4*(1-st)**2.35,xe=-Math.PI*6*(1-at)**2.7,be=(-.6+.8*Math.sin(t*Math.PI*3)*Math.sqrt(1-t))*(1-de(.72,1,t))+Me*.2,g=-.58*(1-de(0,.45,t))+.55*Math.sin(t*Math.PI)*Math.sin(t*Math.PI*1.4)*(1-de(.65,1,t));const Oe=N((w-1.04)/.26,0,1);ye=-.25+Oe*1.5,z=Math.sin(Oe*Math.PI)*.65}else{const oe=(1-t)**3;_=.035*oe,xe=-.12*oe,be=-.012*oe,ye=-.25+t*1.5,z=Math.sin(t*Math.PI)*.32}d.position.set(g,.18+q,0),d.scale.setScalar(1.2*T),d.rotation.set(_,xe,Yt+be),f.setEntranceSweep(ye,z)}function Ke(t){if(A=0,B||!O||document.hidden||L)return;const T=v?Math.min((t-v)/1e3,.05):0;if(v=t,P){const _=t-ie;if(Z=N(_/Xe,0,1),!(F!=null&&F.update(_))){ee();return}i.render(n,u),U++,V(),Z>=1?ee():G();return}if(b){$=N((t-j)/Ve,0,1),R.setProgress($),i.render(n,u),U++,V(),$>=1?ce():G();return}w=Math.min(ae(),w+T),fe(),Ae();const g=M.matches?1:1-Math.exp(-T*13),q=D;p.rotation.x+=(k-p.rotation.x)*g,p.rotation.y+=(q-p.rotation.y)*g,Math.abs(p.rotation.x-k)<3e-4&&(p.rotation.x=k),Math.abs(p.rotation.y-q)<3e-4&&(p.rotation.y=q),i.render(n,u),U++,(ge()||p.rotation.x!==k||p.rotation.y!==D)&&G(),V()}function Ze(){w=ae(),fe()}function Re(t){E=!1,C=t,w=0,v=0,H=null,J=!1,k=D=0,p.rotation.set(0,0,0),fe(),G(),V()}function Je(){b||P||Re("full")}function et(t){b||P||y!==t.id&&(y=t.id,f.setContent(t),Re("switch"))}function tt(t){S=t,f.setFinish(t),G(),V()}function Ae(){if(!H||ge()||M.matches||b||P)return;const t=l.getBoundingClientRect();Te.set((H.x-t.left)/t.width*2-1,1-(H.y-t.top)/t.height*2),n.updateMatrixWorld(!0),u.updateMatrixWorld(!0),me.setFromCamera(Te,u);const T=me.intersectObjects(Y,!1)[0];f.hoverSurface.matrixWorld.copy(d.matrixWorld);const g=me.intersectObject(f.hoverSurface,!1)[0],q=J?g??T:T;if(!q){H=null,J=!1,k=D=0;return}J=!0;const _=d.worldToLocal(q.point);k=N(-_.y/f.height,-.5,.5)*.8,D=N(_.x/f.width,-.5,.5)*1.1}function Ee(t){if(M.matches||L||!O||b||P)return;H={x:t.clientX,y:t.clientY};const T=k,g=D;Ae(),(k!==T||D!==g)&&G()}function se(){H=null,J=!1;const t=k!==0||D!==0;k=D=0,t&&G()}function we(){if(!O||document.hidden){if(P){ee();return}if(b){ce();return}se(),A&&cancelAnimationFrame(A),A=0,v=0,V()}else v=0,G()}function Be(t){if(t.preventDefault(),P){ee();return}if(b){ce();return}se(),L=!0,A&&cancelAnimationFrame(A),A=0,v=0,V()}function ot(t){O=t,we()}function Le(){L=!1,v=0,G()}function De(){if(P){ee();return}if(b){ce();return}Ze(),se(),G()}function ue(){if(P){ee();return}const t=Math.max(1,a.clientWidth),T=Math.max(1,a.clientHeight);i.setDrawingBufferSize(t,T,Math.min(devicePixelRatio,2));const g=Math.max(7.5,6.5/(t/T));u.left=-g*t/T/2,u.right=g*t/T/2,u.top=g/2,u.bottom=-g/2,u.updateProjectionMatrix(),G()}l.addEventListener("pointermove",Ee),l.addEventListener("pointerleave",se),l.addEventListener("webglcontextlost",Be),l.addEventListener("webglcontextrestored",Le),document.addEventListener("visibilitychange",we),window.addEventListener("resize",ue),M.addEventListener("change",De);const Fe=new ResizeObserver(ue);Fe.observe(a);function ee(){const t=P;t&&(P=void 0,clearTimeout(re),re=void 0,Z=1,F==null||F.dispose(),F=null,t())}function nt(t,T){return B||P||b||L||M.matches||!O||document.hidden||(F=zt(i,u,d,p,f.width,f.height,t),!F)?!1:(H=null,J=!1,ie=performance.now(),Z=0,P=T,re=setTimeout(ee,Xe),G(),V(),!0)}function ce(){const t=b;t&&(b=void 0,clearTimeout(Q),Q=void 0,$=1,t())}function it(t){return B||P||b||L||M.matches||!O||document.hidden?!1:(R=Wt(f,At()),R.group.position.copy(p.position),R.group.quaternion.copy(p.quaternion),R.group.scale.copy(p.scale),d.add(R.group),R.setProgress(0),j=performance.now(),b=t,H=null,J=!1,Q=setTimeout(ce,Ve),G(),!0)}function rt(){if(B)return;B=!0,clearTimeout(re),re=void 0,P=void 0,F==null||F.dispose(),F=null,clearTimeout(Q),Q=void 0,b=void 0,A&&cancelAnimationFrame(A),A=0,Fe.disconnect(),l.removeEventListener("pointermove",Ee),l.removeEventListener("pointerleave",se),l.removeEventListener("webglcontextlost",Be),l.removeEventListener("webglcontextrestored",Le),document.removeEventListener("visibilitychange",we),window.removeEventListener("resize",ue),M.removeEventListener("change",De),R==null||R.dispose(),R=void 0;const t=new Set,T=new Set;n.traverse(g=>{if(g instanceof W){t.add(g.geometry);for(const q of Array.isArray(g.material)?g.material:[g.material])T.add(q)}}),t.forEach(g=>g.dispose()),T.forEach(g=>g.dispose()),f.disposeArtwork(),h.dispose(),i.dispose(),i.forceContextLoss(),l.remove(),V()}return fe(),ue(),V(),{getArtworkCanvas:()=>f.texture.image,snapshot:Pe,project:Qe,replay:Je,setCardFinish:tt,setContent:et,setVisible:ot,shatter:it,dropInto:nt,dispose:rt}}export{Ht as createCardScene};
