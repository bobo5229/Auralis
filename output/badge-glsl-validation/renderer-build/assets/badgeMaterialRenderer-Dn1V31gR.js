import{W as D}from"./three.module-CRMHqCR0.js";import{n as k,A as R,o as U,p as P,q as B,b as T,S as A,l as F,T as E,j as x,N}from"./three.core-ClPm_2uc.js";const V=`
varying vec2 vUv;
varying vec3 vTangent;
varying vec3 vBitangent;
varying vec3 vNormal;
varying vec3 vSurface;
void main() {
  vUv = uv;
  vTangent = normalize(normalMatrix * vec3(1., 0., 0.));
  vBitangent = normalize(normalMatrix * vec3(0., 1., 0.));
  vNormal = normalize(normalMatrix * vec3(0., 0., 1.));
  vSurface = (vTangent * position.x + vBitangent * position.y) / 330.;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`,G=`
uniform sampler2D baseMap;
uniform sampler2D materialMap;
uniform sampler2D normalMap;
uniform sampler2D occlusionMap;
uniform sampler2D finishMap;
uniform float useFinish;
uniform float reflections;
uniform float unlit;
uniform vec4 roughness;
varying vec2 vUv;
varying vec3 vTangent;
varying vec3 vBitangent;
varying vec3 vNormal;
varying vec3 vSurface;
const float PI = 3.14159265359;
vec3 toView(vec3 n) { return normalize(vTangent*n.x + vBitangent*n.y + vNormal*n.z); }
vec3 fresnel(float cosine, vec3 f0) { return f0 + (1. - f0) * pow(1. - clamp(cosine, 0., 1.), 5.); }
// Analytic studio softboxes: the lobe widens with roughness, all directions are
// fixed in view space. No cursor-driven light or moving texture is involved.
vec3 studio(vec3 r, float a) {
  vec3 key = normalize(vec3(-.42, .55, .82));
  vec3 side = normalize(vec3(.72, -.12, .65));
  float keyLobe = exp(-(1. - dot(r, key)) / (.032 + a*a*.8));
  float strip = exp(-pow((r.x - side.x) / (.045 + a*.42), 2.) - pow((r.y - side.y) / (.60 + a), 2.));
  float ceiling = pow(max(r.y*.5+.5, 0.), 3.);
  // Intersect the reflected ray with a nearby studio panel. Spatial variation
  // on flat metal is an environment reflection, not a baked texture gradient.
  vec2 p = vSurface.xy + r.xy / max(r.z,.18) * 1.2;
  float diagonal = p.y + p.x*.62;
  float blur = .035 + a*.15;
  float panel = 1. - smoothstep(.065, .065+blur, abs(diagonal-.04));
  panel *= 1. - smoothstep(.6,.95,abs(p.x));
  float lowerPanel = 1. - smoothstep(.025,.025+blur*1.4,abs(diagonal+.37));
  return vec3(.12, .15, .19) + vec3(.8, .84, .9)*keyLobe + vec3(.38,.46,.55)*strip + vec3(.10)*ceiling + vec3(1.35,1.32,1.22)*panel + vec3(.3,.4,.5)*lowerPanel;
}
vec3 ggx(vec3 n, vec3 v, vec3 l, vec3 f0, float rough) {
  vec3 h = normalize(v+l);
  float nl=max(dot(n,l),0.), nv=max(dot(n,v),.001), nh=max(dot(n,h),0.);
  float a=rough*rough, a2=a*a;
  float d=a2 / (PI * pow(nh*nh*(a2-1.)+1., 2.) + .0001);
  float k=pow(rough+1.,2.)/8.;
  float g=(nv/(nv*(1.-k)+k))*(nl/(nl*(1.-k)+k));
  return d*g*fresnel(dot(v,h),f0)*nl / max(4.*nv*nl,.001);
}
void main() {
  vec4 base=texture2D(baseMap,vUv);
  if(base.a < .002) discard;
  vec3 weights=texture2D(materialMap,vUv).rgb;
  weights /= max(dot(weights,vec3(1.)),.001);
  float metal=weights.r, enamel=weights.g, opal=weights.b;
  vec3 relief=texture2D(normalMap,vUv).xyz*2.-1.;
  vec2 dome=(vUv-vec2(.5,.5))*vec2(.24,.20);
  vec3 n=toView(normalize(vec3(relief.xy + dome*(enamel+opal),relief.z)));
  vec3 coat=toView(normalize(vec3(relief.xy*.32+dome,1.)));
  vec3 v=vec3(0.,0.,1.);
  float ao=texture2D(occlusionMap,vUv).r;
  vec3 color=base.rgb;
  // Foil tint changes only inside its own mask. At zero reflection it remains
  // the deterministic, de-lit base pattern, useful for inspecting baked glare.
  float angle=dot(n,v);
  vec3 interference=.65+.35*cos(vec3(0.,2.1,4.2)+angle*14.+vUv.y*3.);
  color=mix(color,color*(.7+interference*.6),opal*reflections*.45);
  float diffuse=.82+.18*max(dot(n,normalize(vec3(-.4,.6,1.))),0.);
  vec3 result=color*diffuse*mix(.68,1.,ao);
  vec2 finish=texture2D(finishMap,vUv).rg;
  float rough=mix(mix(dot(weights,roughness.xyz),roughness.w,unlit),max(finish.r,.06),useFinish);
  float coatAmount=mix(enamel+opal,finish.g,useFinish);
  vec3 f0=mix(vec3(.04),color,metal);
  vec3 reflected=studio(reflect(-v,n),rough)*fresnel(max(dot(n,v),0.),f0);
  vec3 light=ggx(n,v,normalize(vec3(-.42,.55,.82)),f0,max(rough,.16))*.24;
  vec3 coatReflection=studio(reflect(-v,coat),mix(roughness.y,rough,useFinish))*fresnel(max(dot(coat,v),0.),vec3(.045));
  // Metal trades diffuse energy for its reflection; coat sits above colored enamel.
  result=mix(result,result*(1.-metal*.56)+reflected*.86+light+coatAmount*coatReflection,reflections);
  gl_FragColor=vec4(result,base.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;function _(p,y){const e=new D({canvas:p,alpha:!0,antialias:!0,powerPreference:"low-power"});e.setClearColor(0,0),e.outputColorSpace=k,e.toneMapping=R,e.toneMappingExposure=1.1,e.debug.onShaderError=()=>y(new Error("Badge shader compilation failed"));const l=new U({vertexShader:V,fragmentShader:G,transparent:!0,depthWrite:!1,uniforms:{baseMap:{value:null},materialMap:{value:null},normalMap:{value:null},occlusionMap:{value:null},finishMap:{value:null},useFinish:{value:0},reflections:{value:1},unlit:{value:0},roughness:{value:new P(.22,.12,.18,.65)}}}),w=new B(330,370),M=new T(w,l),h=new A;h.add(M);const i=new F(-165,165,185,-185,.1,2e3);i.position.z=1e3;const g=new Set;let d=[],v=0,t=!1,f=!1,b=0,z="",S="lit";const s={x:0,y:0},L=new E;function u(a){for(const o of a)o.dispose(),g.delete(o)}function C(a){a.preventDefault(),t||y(new Error("Badge WebGL context lost"))}return p.addEventListener("webglcontextlost",C),{async load(a,o="lit"){if(t)return!1;const m=++v,r=[];try{for(const n of["base","material","normal","ao","finish"]){const c=await L.loadAsync(a.states[o][n]);if(t||m!==v)return c.dispose(),u(r),!1;c.colorSpace=n==="base"?k:N,c.anisotropy=Math.min(e.capabilities.getMaxAnisotropy(),4),g.add(c),r.push(c)}if(t||m!==v)return u(r),!1;u(d),d=r;for(const[n,c]of["baseMap","materialMap","normalMap","occlusionMap","finishMap"].entries())l.uniforms[c].value=d[n];return l.uniforms.unlit.value=o==="unlit"?1:0,l.uniforms.useFinish.value=a.baseline?0:1,l.uniforms.roughness.value.fromArray(a.roughness),z=a.id,S=o,f=!0,!0}catch(n){if(u(r),t||m!==v)return!1;throw n}},resize(a,o,m=devicePixelRatio||1){if(t)return;e.setPixelRatio(Math.min(2,Math.max(1,m))),e.setSize(Math.max(1,a),Math.max(1,o),!1);const r=a/Math.max(1,o),n=Math.max(185,165/r);i.left=-n*r,i.right=n*r,i.top=n,i.bottom=-n,i.updateProjectionMatrix()},render(a=s.x,o=s.y){t||!f||(s.x=x.clamp(a,-8,8),s.y=x.clamp(o,-8,8),M.rotation.set(x.degToRad(s.x),x.degToRad(s.y),0,"YXZ"),e.render(h,i),b++)},setReflections(a){l.uniforms.reflections.value=a?1:0},snapshot(){return{badgeId:z,state:S,ready:f,disposed:t,frames:b,textures:g.size,dpr:e.getPixelRatio(),pose:{...s}}},capture(){if(t||!f)throw new Error("Badge is not ready");return e.render(h,i),p.toDataURL("image/png")},forceContextLoss(){e.getContext().isContextLost()||e.forceContextLoss()},dispose(){t||(t=!0,f=!1,v++,p.removeEventListener("webglcontextlost",C),u([...g]),d=[],l.dispose(),w.dispose(),e.dispose(),e.getContext().isContextLost()||e.forceContextLoss())}}}export{_ as createBadgeMaterialRenderer};
