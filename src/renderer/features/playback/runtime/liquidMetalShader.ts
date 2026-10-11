export const vertexSource = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0., 1.); }
`

export const liquidMetalShaderHeader = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_folds;
uniform float u_roughness;
uniform vec3 u_colors[6];
uniform float u_weights[6];
out vec4 outColor;
`

export const liquidMetalShaderFunctions = `
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(hash(i), hash(i+vec2(1,0)),u.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
}
float fbm(vec2 p) {
  float sum = 0., amplitude = .72;
  mat2 rotation = mat2(.8,-.6,.6,.8);
  for (int i=0; i<2; i++) {
    sum += amplitude * noise(p);
    p = rotation*p*2.03 + vec2(3.7,9.2);
    amplitude *= .28;
  }
  return sum;
}
vec3 palette(float t) {
  vec3 color = vec3(0.);
  float boundary = 0., total = 0.;
  float previous = smoothstep(t-.09,t+.09,0.);
  for (int i=0; i<6; i++) {
    boundary += u_weights[i];
    float next = smoothstep(t-.09,t+.09,boundary);
    // A smoothed coverage interval vanishes continuously with its weight,
    // including empty first/middle slots left by perceptual color matching.
    float coverage = next - previous;
    color += u_colors[i]*coverage;
    total += coverage;
    previous = next;
  }
  return color/max(total,.00001);
}
float surface(vec2 p, float t, out vec2 warped) {
  vec2 drift = vec2(sin(t*.13),cos(t*.11));
  vec2 center = p - vec2(-.85,.25);
  float curl = 1.5*exp(-dot(center,center)*.85)*(.85+.15*sin(t*.09));
  center = mat2(cos(curl),-sin(curl),sin(curl),cos(curl))*center;
  p = center + vec2(-.85,.25);
  vec2 q = vec2(fbm(p*.8 + drift*.5), fbm(p*.8+vec2(5.2,1.3)-drift*.4));
  vec2 r = vec2(fbm(p*.85+1.7*q+vec2(1.7,9.2)+t*.025),
                fbm(p*.85+1.7*q+vec2(8.3,2.8)-t*.022));
  float localFold = exp(-dot(p-vec2(-1.,.2),p-vec2(-1.,.2))*.55);
  warped = p + 1.65*(r-.45) + .65*(q-.45);
  float phase = warped.y*2.2 + warped.x*.6 + fbm(warped*.7)*2.5;
  float ridges = sin(phase);
  float broad = sin(warped.x*.75-warped.y*.55+t*.045);
  return .58*ridges + .28*broad + localFold*.06*sin(phase*2.8);
}
float lightBand(float x, float center, float width) {
  return exp(-pow((x-center)/width,2.));
}
`

const liquidMetalColorBody = `
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = (2.*gl_FragCoord.xy-u_resolution)/u_resolution.y;
  p = mat2(.9,-.435,.435,.9)*p;
  p *= u_folds*.8;
  vec2 warped;
  float h = surface(p, u_time, warped);
  // Fixed small differences keep the normal continuous across GPU pixel quads.
  vec2 unused;
  const float epsilon = .006;
  vec2 slope = (vec2(surface(p+vec2(epsilon,0),u_time,unused),
                      surface(p+vec2(0,epsilon),u_time,unused))-h)/epsilon;
  vec3 n = normalize(vec3(-slope*1.45, 1.));
  vec3 view = normalize(vec3((uv-.5)*.16, 1.));
  vec3 reflection = reflect(-view,n);

  float colorCoordinate = clamp(.48 + .24*sin(warped.x*.6+warped.y*.5)
                                     + .24*sin(reflection.x*2.+reflection.y*1.3),0.,1.);
  vec3 tint = palette(colorCoordinate);
  // A colored studio environment: broad light panels, narrow softbox strips, dark seams.
  float envY = reflection.y*.82 + reflection.x*.34;
  float soft = .5 + .5*sin(envY*3.2+reflection.z*1.1);
  float w = .055+u_roughness*.24;
  float ribbon = lightBand(envY,.27,w) + .75*lightBand(envY,-.52,w*1.55);
  float broad = lightBand(envY,.72,.22+u_roughness*.35);
  float darkSeam = lightBand(envY,-.12,.085+u_roughness*.2);
  float rim = pow(1.-max(n.z,0.),2.5);
  vec3 reflectedTint = palette(clamp(.5+reflection.x*.32-reflection.y*.18,0.,1.));
  vec3 color = tint*(.4+.75*soft)*(1.-.58*darkSeam);
  color += reflectedTint*.12*rim;
  vec3 highlight = mix(tint,vec3(1.,.99,.94),.43);
  color += highlight*ribbon*.82 + tint*broad*.48;
  // Gentle highlight compression preserves bright colored metal without clipping wide areas.
  color = color/(color+vec3(.62));
  color = pow(max(color,vec3(0.)),vec3(1./2.2));
`

export const liquidMetalColorSource = `
vec3 liquidMetalColor() {${liquidMetalColorBody}
  return color;
}
`

export const fragmentSource = `${liquidMetalShaderHeader}${liquidMetalShaderFunctions}
void main() {${liquidMetalColorBody}
  outColor = vec4(color,1.);
}
`
