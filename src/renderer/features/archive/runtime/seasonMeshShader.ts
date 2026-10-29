import license from './vendor/paper-shaders.LICENSE.txt?raw'
import notice from './vendor/paper-shaders.NOTICE.txt?raw'

// Adapted from Paper Shaders, Apache-2.0:
// https://github.com/paper-design/shaders/blob/7002061d8389781a45e479584deeca0cf538474e/packages/shaders/src/shaders/mesh-gradient.ts
// Changes: four smoothly joined five-color fields, a shared slow clock, no grain,
// quiet lettering areas and rounded banner clipping. Embed notices in the shipped shader.
export const seasonMeshFragment = `
/*
Adapted for Auralis from Paper Shaders mesh-gradient.ts, revision 7002061d8389781a45e479584deeca0cf538474e.
Modified: four blended five-color fields, shared slow timing, no grain, title-area tint and rounded clipping.
${notice}
${license}
*/
uniform float time;
uniform vec3 colors[20];
uniform vec3 titleColors[4];
uniform vec4 wash;
uniform vec2 bannerSize;
varying vec2 bannerUv;

vec2 colorPosition(int index, float t) {
  float i = float(index);
  float a = i * 0.37;
  float b = 0.6 + fract(i / 3.0) * 0.9;
  float c = 0.8 + fract((i + 1.0) / 4.0);
  return 0.5 + 0.5 * vec2(sin(t * b + a), cos(t * c + a * 1.5));
}

vec3 seasonField(int season, vec2 uv) {
  vec2 localUv = vec2(clamp(uv.x * 4.0 - float(season), 0.0, 1.0), uv.y);
  float t = 0.5 * (time + float(season) * 9.7 + 41.5);
  vec2 position = localUv;
  float radius = smoothstep(0.0, 1.0, length(position - 0.5));
  float center = 1.0 - radius;
  for (float i = 1.0; i <= 2.0; i++) {
    position.x += 0.18 * center / i
      * sin(t + i * 0.4 * smoothstep(0.0, 1.0, position.y))
      * cos(0.2 * t + i * 2.4 * smoothstep(0.0, 1.0, position.y));
    position.y += 0.18 * center / i * cos(t + i * 2.0 * smoothstep(0.0, 1.0, position.x));
  }
  float angle = -0.18 * radius;
  mat2 rotation = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
  position = rotation * (position - 0.5) + 0.5;

  vec3 color = vec3(0.0);
  float totalWeight = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 offset = position - colorPosition(i, t);
    // (sqrt(d))^3.5 = d^1.75: keep the falloff without a square root per color.
    float weight = 1.0 / (pow(dot(offset, offset), 1.75) + 0.001);
    color += colors[season * 5 + i] * weight;
    totalWeight += weight;
  }
  color /= max(0.0001, totalWeight);
  float titleArea = 1.0 - smoothstep(0.06, 0.52, length(localUv - vec2(0.5)));
  return mix(color, titleColors[season], titleArea * 0.55);
}

void main() {
  vec2 uv = vec2(bannerUv.x, 1.0 - bannerUv.y);
  vec2 corner = abs((uv - 0.5) * bannerSize) - (0.5 * bannerSize - 10.0);
  float distanceToEdge = length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - 10.0;
  float alpha = 1.0 - smoothstep(-0.7, 0.7, distanceToEdge);
  if (alpha <= 0.0) discard;

  // Blend neighboring seasons across their boundary, with no internal clip or seam.
  float bandPosition = uv.x * 4.0 - 0.5;
  int leftSeason = int(clamp(floor(bandPosition), 0.0, 3.0));
  int rightSeason = int(clamp(floor(bandPosition) + 1.0, 0.0, 3.0));
  float blend = smoothstep(0.18, 0.82, fract(bandPosition));
  vec3 color;
  if (leftSeason == rightSeason || blend <= 0.0) {
    color = seasonField(leftSeason, uv);
  } else if (blend >= 1.0) {
    color = seasonField(rightSeason, uv);
  } else {
    color = mix(seasonField(leftSeason, uv), seasonField(rightSeason, uv), blend);
  }
  color = mix(color, wash.rgb, wash.a);
  gl_FragColor = vec4(color * alpha, alpha);
}
`
