import {
  liquidMetalShaderHeader,
  liquidMetalShaderFunctions,
  liquidMetalColorSource,
} from './liquidMetalShader'

// The native flow and the morph canvas share CSS feathering, overscan and effects.
// Both endpoints therefore keep their original material instead of approximating
// the flow's blur/vignette inside the shader, as the standalone prototype did.
export const morphFragmentSource = `${liquidMetalShaderHeader}
uniform sampler2D u_flow;
uniform float u_phase;
${liquidMetalShaderFunctions}${liquidMetalColorSource}
void main() {
  vec2 uv = gl_FragCoord.xy/u_resolution;
  float amount = clamp(u_phase,0.,1.);
  if (amount >= 1.) { outColor = vec4(liquidMetalColor(),1.); return; }
  if (amount <= 0.) { outColor = vec4(texture(u_flow,uv).rgb,1.); return; }
  float geometry = smoothstep(.04,.85,amount);
  float metallic = smoothstep(.18,.96,amount);
  vec2 p = (2.*gl_FragCoord.xy-u_resolution)/u_resolution.y;
  p = mat2(.9,-.435,.435,.9)*p;
  p *= u_folds*.8*mix(.55,1.,geometry);
  vec2 warped;
  float h = surface(p,u_time,warped);
  vec2 unused;
  const float epsilon = .006;
  vec2 slope = (vec2(surface(p+vec2(epsilon,0),u_time,unused),
                    surface(p+vec2(0,epsilon),u_time,unused))-h)/epsilon;
  float deformation = sin(amount*3.14159265);
  vec2 displaced = uv + (slope*.028+(warped-p)*.022)*deformation;
  vec3 source = texture(u_flow,displaced).rgb;
  vec3 sourceLinear = pow(max(source,vec3(0.)),vec3(2.2));
  vec3 n = normalize(vec3(-slope*1.45*geometry,1.));
  vec3 view = normalize(vec3((uv-.5)*.16,1.));
  vec3 reflection = reflect(-view,n);
  float colorCoordinate = clamp(.48+.24*sin(warped.x*.6+warped.y*.5)
                                   +.24*sin(reflection.x*2.+reflection.y*1.3),0.,1.);
  vec3 tint = mix(sourceLinear,palette(colorCoordinate),smoothstep(.28,1.,amount));
  float envY = reflection.y*.82+reflection.x*.34;
  float soft = .5+.5*sin(envY*3.2+reflection.z*1.1);
  float roughness = mix(.65,u_roughness,geometry);
  float w = .055+roughness*.24;
  float ribbon = lightBand(envY,.27,w)+.75*lightBand(envY,-.52,w*1.55);
  float broad = lightBand(envY,.72,.22+roughness*.35);
  float darkSeam = lightBand(envY,-.12,.085+roughness*.2);
  float rim = pow(1.-max(n.z,0.),2.5);
  vec3 reflectedTint = palette(clamp(.5+reflection.x*.32-reflection.y*.18,0.,1.));
  vec3 color = tint*mix(1.,(.4+.75*soft)*(1.-.58*darkSeam),metallic);
  color += reflectedTint*.12*rim*metallic;
  vec3 highlight = mix(tint,vec3(1.,.99,.94),.43);
  color += (highlight*ribbon*.82+tint*broad*.48)*metallic;
  color = color/mix(vec3(1.),color+vec3(.62),metallic);
  outColor = vec4(pow(max(color,vec3(0.)),vec3(1./2.2)),1.);
}
`
