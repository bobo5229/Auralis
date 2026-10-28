/*!
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
 */

// Keep this subset separate from Auralis's layout, motion and brightness policy.
export const pokeboxFoilFunctions = /* glsl */ `
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
`
