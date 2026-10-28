import{W as ut,P as pt}from"./three.module-CWwUI5_D.js";import{S as Je,B as ft,M as Se,a as ht,P as vt,b as G,I as mt,O as gt,c as wt,d as et,D as ke,e as tt,f as ot,G as Te,E as nt,V as ue,C as xt,g as K,h as bt,F as $e,Q as Me,i as at,j as pe,A as yt,k as Mt,l as Xe,H as Ct,R as St}from"./three.core-UQnk7rm1.js";import{c as He,a as kt,b as Tt,e as Pt,r as At}from"./cardArtwork-C7O-pLUJ.js";import{b as Z}from"./cardTypography-CPymv9e6.js";import"./index-Dt5IIbwy.js";class Et extends Je{constructor(){super();const n=new ft;n.deleteAttribute("uv");const c=new Se({side:ht}),l=new Se,S=new vt(16777215,900,28,2);S.position.set(.418,16.199,.3),this.add(S);const r=new G(n,c);r.position.set(-.757,13.219,.717),r.scale.set(31.713,28.305,28.591),this.add(r);const d=new mt(n,l,6),i=new gt;i.position.set(-10.906,2.009,1.846),i.rotation.set(0,-.195,0),i.scale.set(2.328,7.905,4.651),i.updateMatrix(),d.setMatrixAt(0,i.matrix),i.position.set(-5.607,-.754,-.758),i.rotation.set(0,.994,0),i.scale.set(1.97,1.534,3.955),i.updateMatrix(),d.setMatrixAt(1,i.matrix),i.position.set(6.167,.857,7.803),i.rotation.set(0,.561,0),i.scale.set(3.927,6.285,3.687),i.updateMatrix(),d.setMatrixAt(2,i.matrix),i.position.set(-2.017,.018,6.124),i.rotation.set(0,.333,0),i.scale.set(2.002,4.566,2.064),i.updateMatrix(),d.setMatrixAt(3,i.matrix),i.position.set(2.291,-.756,-2.621),i.rotation.set(0,-.286,0),i.scale.set(1.546,1.552,1.496),i.updateMatrix(),d.setMatrixAt(4,i.matrix),i.position.set(-2.193,-.369,-5.547),i.rotation.set(0,.516,0),i.scale.set(3.875,3.487,2.986),i.updateMatrix(),d.setMatrixAt(5,i.matrix),this.add(d);const u=new G(n,de(50));u.position.set(-16.116,14.37,8.208),u.scale.set(.1,2.428,2.739),this.add(u);const w=new G(n,de(50));w.position.set(-16.109,18.021,-8.207),w.scale.set(.1,2.425,2.751),this.add(w);const p=new G(n,de(17));p.position.set(14.904,12.198,-1.832),p.scale.set(.15,4.265,6.331),this.add(p);const j=new G(n,de(43));j.position.set(-.462,8.89,14.52),j.scale.set(4.38,5.441,.088),this.add(j);const g=new G(n,de(20));g.position.set(3.235,11.486,-12.541),g.scale.set(2.5,2,.1),this.add(g);const v=new G(n,de(100));v.position.set(0,20,0),v.scale.set(1,.1,1),this.add(v)}dispose(){const n=new Set;this.traverse(c=>{c.isMesh&&(n.add(c.geometry),n.add(c.material))});for(const c of n)c.dispose()}}function de(s){return new wt({color:0,emissive:16777215,emissiveIntensity:s})}/*!
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
*/const Rt=`
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
`,Ve=Z.cover.x/Z.width,_e=(Z.cover.x+Z.cover.size)/Z.width,Qe=1-(Z.cover.y+Z.cover.size)/Z.height,Ue=1-Z.cover.y/Z.height,Bt=`
#include <begin_vertex>
vCardNormal = normalize(normalMatrix * normal);
`,Ft=`
varying vec3 vCardNormal;
uniform float uCardFinish, uSweepPosition, uSweepStrength;
${Rt}

float cardSeed(vec2 p) { return fract(sin(dot(p, vec2(73.17, 219.43))) * 18437.29); }

float cardCoverMask(vec2 uv) {
  vec2 feather = vec2(.008, .006);
  vec2 lower = smoothstep(vec2(${Ve}, ${Qe}), vec2(${Ve}, ${Qe}) + feather, uv);
  vec2 upper = 1. - smoothstep(vec2(${_e}, ${Ue}) - feather, vec2(${_e}, ${Ue}), uv);
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
`;function It(){return`
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
`}function Ne(s,n,c,l){const S=new et({map:s,toneMapped:!1,transparent:!0,side:ke});return S.customProgramCacheKey=()=>"album-card-semantic-foil-v2",S.onBeforeCompile=r=>{r.uniforms.uCardFinish=l.finish,r.uniforms.uSweepPosition=l.sweepPosition,r.uniforms.uSweepStrength=l.sweepStrength,r.uniforms.uPrintMask={value:n},r.uniforms.uRedSurface=c,r.vertexShader=`varying vec3 vCardNormal;
`+r.vertexShader.replace("#include <begin_vertex>",Bt),r.fragmentShader=`uniform sampler2D uPrintMask;
uniform float uRedSurface;
`+Ft+r.fragmentShader,r.fragmentShader=r.fragmentShader.replace("#include <color_fragment>",It()+`
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
    `)},S}function Ot(s,n={}){let c=n.appearance??He(s.cover,n.background),l=s.id;const S=kt(),r=Tt(s,c,S),d={value:0},i={value:1.5},u={value:0},w={value:c.redSurface},p={finish:d,sweepPosition:i,sweepStrength:u},j=Ne(r,S,w,p),g=2.65,v=3.8,x=.09,h=new tt;h.moveTo(-g/2+x,-v/2),h.lineTo(g/2-x,-v/2),h.quadraticCurveTo(g/2,-v/2,g/2,-v/2+x),h.lineTo(g/2,v/2-x),h.quadraticCurveTo(g/2,v/2,g/2-x,v/2),h.lineTo(-g/2+x,v/2),h.quadraticCurveTo(-g/2,v/2,-g/2,v/2-x),h.lineTo(-g/2,-v/2+x),h.quadraticCurveTo(-g/2,-v/2,-g/2+x,-v/2);const b=new ot(h,8),X=b.getAttribute("position"),N=b.getAttribute("uv");for(let k=0;k<X.count;k++)N.setXY(k,X.getX(k)/g+.5,X.getY(k)/v+.5);const B=new Te,q=new G(new nt(h,{depth:.035,bevelEnabled:!1,curveSegments:8}),new Se({color:"#e1d6c9",roughness:.68,transparent:!0,side:ke})),F=q.geometry.groups[1];q.geometry.setDrawRange(F.start,F.count),q.position.z=-.0175;const W=new G(b,j);return W.position.z=.018,B.add(q,W),{object:B,face:W,hoverSurface:new G(b,j),width:g,height:v,texture:r,printMask:S,createFragmentMaterial(){return Ne(r,S,w,p)},get appearance(){return c},disposeArtwork(){r.dispose(),S.dispose()},setEntranceSweep(k,O){i.value=k,u.value=O},setContent(k,O=He(k.cover,k.id===l?c.background:n.background,k.id===l?c.patternSeed:void 0)){l=k.id,c=O,w.value=c.redSurface,Pt(r,k,c,S)},setFinish(k){d.value=k==="glitter"?1:0}}}const be=(s,n,c)=>{const l=pe.clamp((c-s)/(n-s),0,1);return l*l*(3-2*l)};function Wt(s,n,c){const l=[];return s.forEach((S,r)=>{const d=s[(r+1)%s.length],i=S.dot(n)-c,u=d.dot(n)-c;i<=1e-9&&l.push(S.clone()),(i<0&&u>0||i>0&&u<0)&&l.push(S.clone().lerp(d,i/(i-u)))}),l}function Dt(s){let n=0;const c=new ue;return s.forEach((l,S)=>{const r=s[(S+1)%s.length],d=l.x*r.y-r.x*l.y;n+=d,c.x+=(l.x+r.x)*d,c.y+=(l.y+r.y)*d}),c.divideScalar(3*n)}const Ke=1400;function zt(s,n){let c=n>>>0;const l=()=>(c=Math.imul(c,1664525)+1013904223>>>0,c/2**32),S=s.hoverSurface.geometry.getAttribute("position"),r=new Map;for(let e=0;e<S.count;e++){const a=new ue(S.getX(e),S.getY(e));r.set(`${a.x},${a.y}`,a)}const d=[...r.values()].sort((e,a)=>Math.atan2(e.y,e.x)-Math.atan2(a.y,a.x)),i=[[-.72,1.35],[.63,1.2],[-.86,.12],[.2,.32],[.88,-.4],[-.62,-1.24],[.53,-1.38]].map(([e,a])=>new ue(e+(l()-.5)*.32,a+(l()-.5)*.38)),u=new Te,w=i.map((e,a)=>{let t=d.map(T=>T.clone());return i.forEach((T,P)=>{a!==P&&(t=Wt(t,T.clone().sub(e),(T.lengthSq()-e.lengthSq())/2))}),t}),p=[],j=e=>{let a=p.findIndex(t=>t.point.distanceToSquared(e)<1e-12);return a<0&&(a=p.length,p.push({point:e.clone(),distance:1/0})),a},g=[];w.forEach((e,a)=>{e.forEach((t,T)=>{const P=e[(T+1)%e.length],E=t.clone().lerp(P,.5);if(!i.some((C,I)=>I!==a&&Math.abs(E.distanceToSquared(i[a])-E.distanceToSquared(C))<1e-6))return;const y=j(t),m=j(P),D=g.find(C=>C.a===y&&C.b===m||C.a===m&&C.b===y);D?D.owners.push(a):g.push({a:y,b:m,length:t.distanceTo(P),owners:[a]})})});const v=new ue(-2.65*.18,s.height*.18),x=p.map((e,a)=>a).filter(e=>g.filter(a=>a.a===e||a.b===e).length>=3).reduce((e,a)=>p[a].point.distanceToSquared(v)<p[e].point.distanceToSquared(v)?a:e);p[x].distance=0;const h=new Set;for(;h.size<p.length;){let e=-1;p.forEach((a,t)=>{!h.has(t)&&(e<0||a.distance<p[e].distance)&&(e=t)}),h.add(e);for(const a of g){const t=a.a===e?a.b:a.b===e?a.a:-1;t>=0&&(p[t].distance=Math.min(p[t].distance,p[e].distance+a.length))}}const b=Math.max(...g.map(e=>(p[e.a].distance+p[e.b].distance+e.length)/2)),X=e=>.05+.2*e/b,N=w.map(e=>Math.abs(e.reduce((a,t,T)=>a+t.cross(e[(T+1)%e.length]),0))/2),B=Math.min(...N),q=Math.max(...N),F=w.map((e,a)=>{const t=Dt(e),T=new tt(e.map(f=>f.clone().sub(t))),P=new ot(T),E=P.getAttribute("position"),y=P.getAttribute("uv");for(let f=0;f<E.count;f++)y.setXY(f,(E.getX(f)+t.x)/s.width+.5,(E.getY(f)+t.y)/s.height+.5);const m=s.createFragmentMaterial(),D=new Se({color:new xt("#c8bcac").multiplyScalar(.94+l()*.12),roughness:.68,side:ke}),C=new G(P,m);C.position.z=.018;const I=new G(new nt(T,{depth:.035,bevelEnabled:!1,curveSegments:8}),D),L=I.geometry.groups[1];I.geometry.setDrawRange(L.start,L.count),I.position.z=-.0175;const A=new Te;A.add(I,C),A.position.set(t.x,t.y,0),u.add(A);const oe=[],_=[],ne=g.filter(f=>f.owners.includes(a)),ae=ne.reduce((f,Y)=>Math.min(p[Y.a].distance,p[Y.b].distance)<Math.min(p[f.a].distance,p[f.b].distance)?Y:f),ie=p[ae.a].point,H=p[ae.b].point,Q=new K(ie.x-t.x,ie.y-t.y,0),J=new K(H.x-ie.x,H.y-ie.y,0).normalize(),fe=Math.sign(J.x*-Q.y-J.y*-Q.x);for(const f of ne.filter(Y=>Y.owners[0]===a)){const Y=p[f.a].point,he=p[f.b].point,Ae=new ue(-(he.y-Y.y),he.x-Y.x).normalize().multiplyScalar(.003),ve=Math.max(8,Math.ceil(f.length/.045));for(let me=0;me<ve;me++)for(const[Ee,Re]of[[0,-1],[1,-1],[1,1],[0,-1],[1,1],[0,1]]){const ce=(me+Ee)/ve,ge=Y.clone().lerp(he,ce).addScaledVector(Ae,Re).sub(t);oe.push(ge.x,ge.y,.02),_.push(X(Math.min(p[f.a].distance+f.length*ce,p[f.b].distance+f.length*(1-ce))))}}const re=new bt;re.setAttribute("position",new $e(oe,3)),re.setAttribute("color",new $e(new Float32Array(_.length*4),4));const $=new et({color:"#ead8b8",vertexColors:!0,transparent:!0,side:ke,depthWrite:!1,toneMapped:!1}),Pe=new G(re,$);A.add(Pe);for(const f of[m,D])f.transparent=!0,f.depthWrite=!0;return{object:A,center:t,polygon:e,face:C,edge:I,crackGeometry:re,crackMaterial:$,crackArrivals:_,pivot:Q,axis:J,liftSign:fe,weight:(N[a]-B)/Math.max(.001,q-B),drift:(l()-.5)*.22,depth:(l()-.5)*1.5,spin:new K((l()-.5)*2.4,(l()-.5)*2.8,(l()-.5)*1.4),delay:.035*(N[a]-B)/Math.max(.001,q-B)+.035*Math.min(p[ae.a].distance,p[ae.b].distance)/b}}),W=new Me,k=new Me,O=new at,z=new K;let V=!1;return{group:u,setProgress(e){const a=pe.clamp(e,0,1);s.object.visible=a<.025,u.visible=a>=.025&&a<1;for(const t of F){const T=be(.2+t.delay,.4+t.delay,a),P=Math.max(0,(a-.32-t.delay)/(.68-t.delay)),E=P*P,y=1-t.weight;W.setFromAxisAngle(t.axis,t.liftSign*(.09+y*.09)*T),k.setFromEuler(O.set(t.spin.x*E*(.55+y*.65),t.spin.y*E*(.55+y*.65),t.spin.z*E*(.4+y*.6))),t.object.quaternion.copy(k).multiply(W),z.copy(t.pivot).negate().applyQuaternion(W).add(t.pivot),t.object.position.set(t.center.x+z.x+t.center.x*(T*.009+E*(.38+y*.24))+t.drift*E,t.center.y+z.y+t.center.y*T*.009+.14*P-(1.35+y*.45)*E,z.z+t.depth*E*(.5+y*.5));const m=1-be(.72+t.delay,1,a);for(const C of[t.face,t.edge])C.material.opacity=m;const D=t.crackGeometry.getAttribute("color");for(let C=0;C<t.crackArrivals.length;C++){const I=t.crackArrivals[C],L=be(I,I+.012,a)*(1-be(I+.025,I+.085,a))*(1-be(.25,.36,a))*.7;D.setXYZW(C,1,1,1,L)}D.needsUpdate=!0}},dispose(){if(!V){V=!0;for(const e of F){for(const a of[e.face,e.edge])a.geometry.dispose(),a.material.dispose();e.crackGeometry.dispose(),e.crackMaterial.dispose()}u.removeFromParent()}}}}const Ze=1200,De=s=>{const n=Math.max(0,Math.min(1,s));return n*n*(3-2*n)};function qt(s,n,c,l,S,r,d){const i=s.domElement,u=i.getBoundingClientRect(),w=d.getBoundingClientRect();if(!d.isConnected||u.width<=0||u.height<=0||w.width<140||w.height<=0||w.top<100||w.top>=innerHeight||w.right<=0||w.left>=innerWidth||typeof d.animate!="function"||getComputedStyle(d).visibility==="hidden")return null;const p=i.style.cssText,j=[n.left,n.right,n.top,n.bottom],g=s.autoClear,v=(n.top-n.bottom)/u.height,x=(n.right-n.left)/u.width,h=l.getWorldPosition(new K),b=l.getWorldQuaternion(new Me),X=l.getWorldScale(new K),N=new Me,B=new Me,q=new at,F=innerWidth,W=innerHeight,k=80*v/r,O=new K(k,k,k),z=[-1,1].flatMap(y=>[-1,1].map(m=>new K(y*S/2,m*r/2,0))),V=new K,e=Math.max(w.left+48,Math.min(w.right-48,w.left+w.width/2)),a=n.position.x+n.left+(e-u.left)*x,t=n.position.y+n.top-(w.top-u.top)*v;let T,P=!1,E=!1;return n.left-=u.left*x,n.right=n.left+F*x,n.top+=u.top*v,n.bottom=n.top-W*v,n.updateProjectionMatrix(),Object.assign(i.style,{position:"fixed",left:"0px",top:"0px",width:`${F}px`,height:`${W}px`,pointerEvents:"none"}),s.setDrawingBufferSize(F,W,Math.min(devicePixelRatio,2)),s.autoClear=!1,c.position.copy(h),c.quaternion.copy(b),c.scale.copy(X),l.position.set(0,0,0),l.quaternion.identity(),l.scale.setScalar(1),{update(y){const m=d.getBoundingClientRect();if(!d.isConnected||m.width<=0||m.height<=0||innerWidth!==F||innerHeight!==W||Math.abs(m.left-w.left)>1||Math.abs(m.width-w.width)>1||Math.abs(m.height-w.height)>1||Math.abs(m.top-w.top)>(P?4:1)||getComputedStyle(d).visibility==="hidden")return!1;const D=Math.max(0,Math.min(1,(y-150)/800)),C=De(D),I=De((y-950)/250),L=12*v*De(y/150);c.position.set(pe.lerp(h.x,a,C),pe.lerp(h.y-L,t+36*v,D*D)-80*v*Math.sin(D*Math.PI)-76*v*I,h.z),c.scale.copy(X).lerp(O,C),c.quaternion.copy(b).slerp(N,C),q.set(Math.PI*2*C+pe.degToRad(78)*I,0,pe.degToRad(15)*Math.sin(D*Math.PI)),B.setFromEuler(q),c.quaternion.premultiply(B),c.updateMatrixWorld(!0);let A=-1/0;for(const _ of z)l.localToWorld(V.copy(_)).project(n),A=Math.max(A,(1-V.y)*W/2);!P&&y>=800&&A>=m.top&&(P=!0,T=d.animate([{transform:"translateY(0)"},{transform:"translateY(3px)",offset:.35},{transform:"translateY(0)"}],{duration:250,easing:"cubic-bezier(.22,1,.36,1)",composite:"add"})),s.setScissorTest(!1),s.clear();const oe=Math.max(0,Math.min(W,d.getBoundingClientRect().top));return s.setScissor(0,W-oe,F,oe),s.setScissorTest(!0),!0},dispose(){E||(E=!0,T?.cancel(),s.setScissorTest(!1),s.autoClear=g,i.style.cssText=p,[n.left,n.right,n.top,n.bottom]=j,n.updateProjectionMatrix())}}}const te=(s,n,c)=>Math.min(c,Math.max(n,s)),jt=Math.PI/120,ye=(s,n,c)=>{const l=te((c-s)/(n-s),0,1);return l*l*(3-2*l)};function Ht(s,n,c,l=window.matchMedia("(prefers-reduced-motion: reduce)"),S){const r=new ut({antialias:!0,alpha:!0,powerPreference:"low-power"});r.toneMapping=yt,r.toneMappingExposure=.85,r.setClearColor(0,0),s.appendChild(r.domElement);const d=r.domElement;d.setAttribute("aria-hidden","true");const i=new Je,u=new Mt(-4,4,4,-4,.1,100);u.position.set(0,.1,12),u.lookAt(0,.1,0);const w=new Et,p=new pt(r),j=p.fromScene(w,.04);w.dispose(),p.dispose(),i.environment=j.texture,i.environmentIntensity=.75;const g=new Xe("#fff7ed",1);g.position.set(-3,5,7);const v=new Xe("#d8d0f2",.6);v.position.set(4,-1,5),i.add(g,v,new Ct("#ffffff","#8b8394",.35));const x=new Te;i.add(x);const h=Ot(c,{appearance:S}),b=h.object;let X=!1;h.face.onAfterRender=()=>{X=!0};const N=[h.face];x.add(b);const B=l;let q="full",F=0,W="bands",k=c.id,O=0,z=0,V=0,e=0,a=0,t=0,T=!1,P=!1,E=!0,y,m,D=0,C=0,I,L,A,oe=0,_=0,ne;const ae=new St,ie=new ue;let H=null,Q=!1;const J=()=>B.matches?.15:q==="full"?1.3:.35,fe=()=>F<J();function re(){return{entrance:q,entranceProgress:te(F/J(),0,1),entering:fe(),reducedMotion:B.matches,sweepStrength:V,entranceY:x.position.y,entranceX:x.position.x,entranceRotationX:x.rotation.x,entranceRotationY:x.rotation.y,entranceRotationZ:x.rotation.z,frames:a,cardRendered:X,pending:!!e,disposed:T,calls:r.info.render.calls,triangles:r.info.render.triangles,cardFinish:W,contentId:k,cardTilt:{x:b.rotation.x,y:b.rotation.y},contextLost:P,shattering:!!m,shatterProgress:C,dropping:!!A,dropProgress:_}}function $(){n(re())}function Pe(o){i.updateMatrixWorld(!0);const R=b.localToWorld(new K(0,o==="card"?1.82:0,.02)).project(u),M=d.getBoundingClientRect();return{x:M.left+(R.x+1)*M.width/2,y:M.top+(1-R.y)*M.height/2}}function f(){T||!E||document.hidden||P||e||(e=requestAnimationFrame(he))}function Y(){const o=te(F/J(),0,1);let R=1,M=0,U=0,ee=0,Fe=0,Ie=0,Oe=1.5;if(V=0,d.style.opacity=B.matches?String(ye(0,1,o)):"1",!B.matches&&o<1)if(q==="full"){const le=1-(1-te(F/.98,0,1))**3,Ye=ye(.98,1.3,F),We=Math.sin(Ye*Math.PI*2)*(1-Ye)*.025;R=.82+le*.18+We*.3,U=(u.bottom-2.7-.18)*(1-le)+We;const lt=o+.1*Math.sin(o*Math.PI*2)+.025*Math.sin(o*Math.PI*4),dt=o+.08*Math.sin(o*Math.PI*2)-.035*Math.sin(o*Math.PI*4);ee=-Math.PI*4*(1-dt)**2.35,Fe=-Math.PI*6*(1-lt)**2.7,Ie=(-.6+.8*Math.sin(o*Math.PI*3)*Math.sqrt(1-o))*(1-ye(.72,1,o))+We*.2,M=-.58*(1-ye(0,.45,o))+.55*Math.sin(o*Math.PI)*Math.sin(o*Math.PI*1.4)*(1-ye(.65,1,o));const Ge=te((F-1.04)/.26,0,1);Oe=-.25+Ge*1.5,V=Math.sin(Ge*Math.PI)*.65}else{const le=(1-o)**3;ee=.035*le,Fe=-.12*le,Ie=-.012*le,Oe=-.25+o*1.5,V=Math.sin(o*Math.PI)*.32}x.position.set(M,.18+U,0),x.scale.setScalar(1.2*R),x.rotation.set(ee,Fe,jt+Ie),h.setEntranceSweep(Oe,V)}function he(o){if(e=0,T||!E||document.hidden||P)return;const R=t?Math.min((o-t)/1e3,.05):0;if(t=o,A){const ee=o-oe;if(_=te(ee/Ze,0,1),!L?.update(ee)){se();return}r.render(i,u),a++,$(),_>=1?se():f();return}if(m){C=te((o-D)/Ke,0,1),y.setProgress(C),r.render(i,u),a++,$(),C>=1?xe():f();return}F=Math.min(J(),F+R),Y(),ce();const M=B.matches?1:1-Math.exp(-R*13),U=z;b.rotation.x+=(O-b.rotation.x)*M,b.rotation.y+=(U-b.rotation.y)*M,Math.abs(b.rotation.x-O)<3e-4&&(b.rotation.x=O),Math.abs(b.rotation.y-U)<3e-4&&(b.rotation.y=U),r.render(i,u),a++,(fe()||b.rotation.x!==O||b.rotation.y!==z)&&f(),$()}function Ae(){F=J(),Y()}function ve(o){X=!1,q=o,F=0,t=0,H=null,Q=!1,O=z=0,b.rotation.set(0,0,0),Y(),f(),$()}function me(){m||A||ve("full")}function Ee(o){m||A||k!==o.id&&(k=o.id,h.setContent(o),ve("switch"))}function Re(o){W=o,h.setFinish(o),f(),$()}function ce(){if(!H||fe()||B.matches||m||A)return;const o=d.getBoundingClientRect();ie.set((H.x-o.left)/o.width*2-1,1-(H.y-o.top)/o.height*2),i.updateMatrixWorld(!0),u.updateMatrixWorld(!0),ae.setFromCamera(ie,u);const R=ae.intersectObjects(N,!1)[0];h.hoverSurface.matrixWorld.copy(x.matrixWorld);const M=ae.intersectObject(h.hoverSurface,!1)[0],U=Q?M??R:R;if(!U){H=null,Q=!1,O=z=0;return}Q=!0;const ee=x.worldToLocal(U.point);O=te(-ee.y/h.height,-.5,.5)*.8,z=te(ee.x/h.width,-.5,.5)*1.1}function ge(o){if(B.matches||P||!E||m||A)return;H={x:o.clientX,y:o.clientY};const R=O,M=z;ce(),(O!==R||z!==M)&&f()}function we(){H=null,Q=!1;const o=O!==0||z!==0;O=z=0,o&&f()}function Be(){if(!E||document.hidden){if(A){se();return}if(m){xe();return}we(),e&&cancelAnimationFrame(e),e=0,t=0,$()}else t=0,f()}function ze(o){if(o.preventDefault(),A){se();return}if(m){xe();return}we(),P=!0,e&&cancelAnimationFrame(e),e=0,t=0,$()}function it(o){E=o,Be()}function qe(){P=!1,t=0,f()}function je(){if(A){se();return}if(m){xe();return}Ae(),we(),f()}function Ce(){if(A){se();return}const o=Math.max(1,s.clientWidth),R=Math.max(1,s.clientHeight);r.setDrawingBufferSize(o,R,Math.min(devicePixelRatio,2));const M=Math.max(7.5,6.5/(o/R));u.left=-M*o/R/2,u.right=M*o/R/2,u.top=M/2,u.bottom=-M/2,u.updateProjectionMatrix(),f()}d.addEventListener("pointermove",ge),d.addEventListener("pointerleave",we),d.addEventListener("webglcontextlost",ze),d.addEventListener("webglcontextrestored",qe),document.addEventListener("visibilitychange",Be),window.addEventListener("resize",Ce),B.addEventListener("change",je);const Le=new ResizeObserver(Ce);Le.observe(s);function se(){const o=A;o&&(A=void 0,clearTimeout(ne),ne=void 0,_=1,L?.dispose(),L=null,o())}function rt(o,R){return T||A||m||P||B.matches||!E||document.hidden||(L=qt(r,u,x,b,h.width,h.height,o),!L)?!1:(H=null,Q=!1,oe=performance.now(),_=0,A=R,ne=setTimeout(se,Ze),f(),$(),!0)}function xe(){const o=m;o&&(m=void 0,clearTimeout(I),I=void 0,C=1,o())}function st(o){return T||A||m||P||B.matches||!E||document.hidden?!1:(y=zt(h,At()),y.group.position.copy(b.position),y.group.quaternion.copy(b.quaternion),y.group.scale.copy(b.scale),x.add(y.group),y.setProgress(0),D=performance.now(),m=o,H=null,Q=!1,I=setTimeout(xe,Ke),f(),!0)}function ct(){if(T)return;T=!0,clearTimeout(ne),ne=void 0,A=void 0,L?.dispose(),L=null,clearTimeout(I),I=void 0,m=void 0,e&&cancelAnimationFrame(e),e=0,Le.disconnect(),d.removeEventListener("pointermove",ge),d.removeEventListener("pointerleave",we),d.removeEventListener("webglcontextlost",ze),d.removeEventListener("webglcontextrestored",qe),document.removeEventListener("visibilitychange",Be),window.removeEventListener("resize",Ce),B.removeEventListener("change",je),y?.dispose(),y=void 0;const o=new Set,R=new Set;i.traverse(M=>{if(M instanceof G){o.add(M.geometry);for(const U of Array.isArray(M.material)?M.material:[M.material])R.add(U)}}),o.forEach(M=>M.dispose()),R.forEach(M=>M.dispose()),h.disposeArtwork(),j.dispose(),r.dispose(),r.forceContextLoss(),d.remove(),$()}return Y(),Ce(),$(),{getArtworkCanvas:()=>h.texture.image,snapshot:re,project:Pe,replay:me,setCardFinish:Re,setContent:Ee,setVisible:it,shatter:st,dropInto:rt,dispose:ct}}export{Ht as createCardScene};
