import{z as Ur,J as Rt,n as Dr,C as qe,K as wr,w as lt,U as Ui,W as qt,X as tr,Y as ji,Z as Gt,_ as et,$ as Xt,a0 as fi,a1 as yt,D as Mt,a as pt,a2 as jt,g as Ve,a3 as pi,a4 as yr,a5 as Zt,a6 as Vt,b as xt,k as Ir,a7 as ni,d as Nr,B as ir,a8 as Or,a9 as Fr,aa as vi,V as ct,ab as Tt,ac as ci,ad as Vi,ae as $t,af as Jt,ag as ar,ah as Br,v as It,ai as wt,aj as mi,h as rr,ak as oi,al as Bt,N as Ft,am as di,an as Hr,ao as Gr,ap as kt,aq as Vr,ar as zr,as as Wr,at as kr,au as Xr,av as Yr,aw as Kr,ax as qr,ay as jr,az as Zr,aA as $r,aB as Jr,aC as Qr,aD as en,aE as tn,aF as an,aG as rn,u as nn,aH as Ei,aI as ti,aJ as on,aK as Kt,aL as sn,aM as ln,aN as cn,aO as dn,aP as nr,aQ as un,aR as fn,aS as pn,aT as mn,p as Ne,aU as hn,aV as _n,aW as gn,aX as or,aY as St,aZ as ui,a_ as sr,a$ as lr,b0 as cr,x as dr,b1 as vn,b2 as En,b3 as Sn,b4 as Mn,b5 as ur,b6 as Dt,b7 as Tn,b8 as xn,b9 as Rn,ba as fr,bb as An,bc as pr,bd as mr,be as Si,bf as Mi,bg as Ti,bh as xi,bi as Ye,bj as Zi,bk as $i,bl as Ji,bm as Qi,bn as ea,bo as ta,bp as ia,bq as aa,br as ra,bs as na,bt as oa,bu as sa,bv as la,bw as ca,bx as da,by as ua,bz as fa,bA as pa,bB as ma,bC as ha,bD as _a,bE as ga,bF as va,bG as Ea,bH as Sa,bI as Ma,bJ as Ta,bK as xa,bL as Di,bM as wi,bN as yi,bO as Ii,bP as Ni,bQ as Oi,bR as Fi,bS as bn,bT as Ra,bU as Cn,bV as si,bW as Pn,bX as Aa,bY as ba,bZ as Ca,b_ as Bi,b$ as Hi,c0 as Ln,c1 as hr,c2 as Un,c3 as Dn,c4 as wn,c5 as _r,c6 as Pa,i as gr,c7 as La,c8 as vr,c9 as yn,ca as In,cb as Nn,cc as Ua,cd as st,ce as On,cf as Fn,cg as Bn,ch as Hn,ci as Gn,A as Vn,cj as zn,ck as Wn,cl as kn,cm as Xn,cn as Yn,co as Kn,cp as qn,cq as jn,cr as Zn,cs as $n,ct as Jn,cu as Qn}from"./three.core-UQnk7rm1.js";/**
* @license
* Copyright 2010-2025 Three.js Authors
* SPDX-License-Identifier: MIT
*/function Er(){let e=null,i=!1,t=null,a=null;function l(o,m){t(o,m),a=e.requestAnimationFrame(l)}return{start:function(){i!==!0&&t!==null&&(a=e.requestAnimationFrame(l),i=!0)},stop:function(){e.cancelAnimationFrame(a),i=!1},setAnimationLoop:function(o){t=o},setContext:function(o){e=o}}}function eo(e){const i=new WeakMap;function t(d,P){const v=d.array,L=d.usage,R=v.byteLength,E=e.createBuffer();e.bindBuffer(P,E),e.bufferData(P,v,L),d.onUploadCallback();let T;if(v instanceof Float32Array)T=e.FLOAT;else if(typeof Float16Array<"u"&&v instanceof Float16Array)T=e.HALF_FLOAT;else if(v instanceof Uint16Array)d.isFloat16BufferAttribute?T=e.HALF_FLOAT:T=e.UNSIGNED_SHORT;else if(v instanceof Int16Array)T=e.SHORT;else if(v instanceof Uint32Array)T=e.UNSIGNED_INT;else if(v instanceof Int32Array)T=e.INT;else if(v instanceof Int8Array)T=e.BYTE;else if(v instanceof Uint8Array)T=e.UNSIGNED_BYTE;else if(v instanceof Uint8ClampedArray)T=e.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+v);return{buffer:E,type:T,bytesPerElement:v.BYTES_PER_ELEMENT,version:d.version,size:R}}function a(d,P,v){const L=P.array,R=P.updateRanges;if(e.bindBuffer(v,d),R.length===0)e.bufferSubData(v,0,L);else{R.sort((T,F)=>T.start-F.start);let E=0;for(let T=1;T<R.length;T++){const F=R[E],U=R[T];U.start<=F.start+F.count+1?F.count=Math.max(F.count,U.start+U.count-F.start):(++E,R[E]=U)}R.length=E+1;for(let T=0,F=R.length;T<F;T++){const U=R[T];e.bufferSubData(v,U.start*L.BYTES_PER_ELEMENT,L,U.start,U.count)}P.clearUpdateRanges()}P.onUploadCallback()}function l(d){return d.isInterleavedBufferAttribute&&(d=d.data),i.get(d)}function o(d){d.isInterleavedBufferAttribute&&(d=d.data);const P=i.get(d);P&&(e.deleteBuffer(P.buffer),i.delete(d))}function m(d,P){if(d.isInterleavedBufferAttribute&&(d=d.data),d.isGLBufferAttribute){const L=i.get(d);(!L||L.version<d.version)&&i.set(d,{buffer:d.buffer,type:d.type,bytesPerElement:d.elementSize,version:d.version});return}const v=i.get(d);if(v===void 0)i.set(d,t(d,P));else if(v.version<d.version){if(v.size!==d.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");a(v.buffer,d,P),v.version=d.version}}return{get:l,remove:o,update:m}}var to=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,io=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,ao=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,ro=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,no=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,oo=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,so=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,lo=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,co=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,uo=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,fo=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,po=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,mo=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,ho=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,_o=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,go=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,vo=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Eo=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,So=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,Mo=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,To=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,xo=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,Ro=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,Ao=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,bo=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,Co=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,Po=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Lo=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Uo=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Do=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,wo="gl_FragColor = linearToOutputTexel( gl_FragColor );",yo=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Io=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,No=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,Oo=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,Fo=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Bo=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,Ho=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Go=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Vo=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,zo=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Wo=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,ko=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Xo=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,Yo=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Ko=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,qo=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,jo=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Zo=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,$o=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Jo=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Qo=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,es=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,ts=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,is=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,as=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,rs=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,ns=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,os=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,ss=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,ls=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,cs=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,ds=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,us=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,fs=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,ps=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,ms=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,hs=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,_s=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,gs=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,vs=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Es=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,Ss=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,Ms=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Ts=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,xs=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,Rs=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,As=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,bs=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,Cs=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,Ps=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,Ls=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,Us=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,Ds=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,ws=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,ys=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Is=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Ns=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Os=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,Fs=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		float depth = unpackRGBAToDepth( texture2D( depths, uv ) );
		#ifdef USE_REVERSED_DEPTH_BUFFER
			return step( depth, compare );
		#else
			return step( compare, depth );
		#endif
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow( sampler2D shadow, vec2 uv, float compare ) {
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		#ifdef USE_REVERSED_DEPTH_BUFFER
			float hard_shadow = step( distribution.x, compare );
		#else
			float hard_shadow = step( compare, distribution.x );
		#endif
		if ( hard_shadow != 1.0 ) {
			float distance = compare - distribution.x;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,Bs=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,Hs=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,Gs=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,Vs=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,zs=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,Ws=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,ks=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,Xs=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,Ys=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Ks=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,qs=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,js=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,Zs=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,$s=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Js=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Qs=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,el=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const tl=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,il=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,al=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,rl=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,nl=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,ol=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,sl=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,ll=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,cl=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,dl=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,ul=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,fl=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,pl=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,ml=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,hl=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,_l=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,gl=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,vl=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,El=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,Sl=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Ml=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,Tl=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,xl=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Rl=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Al=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,bl=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Cl=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Pl=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Ll=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,Ul=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Dl=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,wl=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,yl=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Il=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Ue={alphahash_fragment:to,alphahash_pars_fragment:io,alphamap_fragment:ao,alphamap_pars_fragment:ro,alphatest_fragment:no,alphatest_pars_fragment:oo,aomap_fragment:so,aomap_pars_fragment:lo,batching_pars_vertex:co,batching_vertex:uo,begin_vertex:fo,beginnormal_vertex:po,bsdfs:mo,iridescence_fragment:ho,bumpmap_pars_fragment:_o,clipping_planes_fragment:go,clipping_planes_pars_fragment:vo,clipping_planes_pars_vertex:Eo,clipping_planes_vertex:So,color_fragment:Mo,color_pars_fragment:To,color_pars_vertex:xo,color_vertex:Ro,common:Ao,cube_uv_reflection_fragment:bo,defaultnormal_vertex:Co,displacementmap_pars_vertex:Po,displacementmap_vertex:Lo,emissivemap_fragment:Uo,emissivemap_pars_fragment:Do,colorspace_fragment:wo,colorspace_pars_fragment:yo,envmap_fragment:Io,envmap_common_pars_fragment:No,envmap_pars_fragment:Oo,envmap_pars_vertex:Fo,envmap_physical_pars_fragment:qo,envmap_vertex:Bo,fog_vertex:Ho,fog_pars_vertex:Go,fog_fragment:Vo,fog_pars_fragment:zo,gradientmap_pars_fragment:Wo,lightmap_pars_fragment:ko,lights_lambert_fragment:Xo,lights_lambert_pars_fragment:Yo,lights_pars_begin:Ko,lights_toon_fragment:jo,lights_toon_pars_fragment:Zo,lights_phong_fragment:$o,lights_phong_pars_fragment:Jo,lights_physical_fragment:Qo,lights_physical_pars_fragment:es,lights_fragment_begin:ts,lights_fragment_maps:is,lights_fragment_end:as,logdepthbuf_fragment:rs,logdepthbuf_pars_fragment:ns,logdepthbuf_pars_vertex:os,logdepthbuf_vertex:ss,map_fragment:ls,map_pars_fragment:cs,map_particle_fragment:ds,map_particle_pars_fragment:us,metalnessmap_fragment:fs,metalnessmap_pars_fragment:ps,morphinstance_vertex:ms,morphcolor_vertex:hs,morphnormal_vertex:_s,morphtarget_pars_vertex:gs,morphtarget_vertex:vs,normal_fragment_begin:Es,normal_fragment_maps:Ss,normal_pars_fragment:Ms,normal_pars_vertex:Ts,normal_vertex:xs,normalmap_pars_fragment:Rs,clearcoat_normal_fragment_begin:As,clearcoat_normal_fragment_maps:bs,clearcoat_pars_fragment:Cs,iridescence_pars_fragment:Ps,opaque_fragment:Ls,packing:Us,premultiplied_alpha_fragment:Ds,project_vertex:ws,dithering_fragment:ys,dithering_pars_fragment:Is,roughnessmap_fragment:Ns,roughnessmap_pars_fragment:Os,shadowmap_pars_fragment:Fs,shadowmap_pars_vertex:Bs,shadowmap_vertex:Hs,shadowmask_pars_fragment:Gs,skinbase_vertex:Vs,skinning_pars_vertex:zs,skinning_vertex:Ws,skinnormal_vertex:ks,specularmap_fragment:Xs,specularmap_pars_fragment:Ys,tonemapping_fragment:Ks,tonemapping_pars_fragment:qs,transmission_fragment:js,transmission_pars_fragment:Zs,uv_pars_fragment:$s,uv_pars_vertex:Js,uv_vertex:Qs,worldpos_vertex:el,background_vert:tl,background_frag:il,backgroundCube_vert:al,backgroundCube_frag:rl,cube_vert:nl,cube_frag:ol,depth_vert:sl,depth_frag:ll,distanceRGBA_vert:cl,distanceRGBA_frag:dl,equirect_vert:ul,equirect_frag:fl,linedashed_vert:pl,linedashed_frag:ml,meshbasic_vert:hl,meshbasic_frag:_l,meshlambert_vert:gl,meshlambert_frag:vl,meshmatcap_vert:El,meshmatcap_frag:Sl,meshnormal_vert:Ml,meshnormal_frag:Tl,meshphong_vert:xl,meshphong_frag:Rl,meshphysical_vert:Al,meshphysical_frag:bl,meshtoon_vert:Cl,meshtoon_frag:Pl,points_vert:Ll,points_frag:Ul,shadow_vert:Dl,shadow_frag:wl,sprite_vert:yl,sprite_frag:Il},ae={common:{diffuse:{value:new qe(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Ne},alphaMap:{value:null},alphaMapTransform:{value:new Ne},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Ne}},envmap:{envMap:{value:null},envMapRotation:{value:new Ne},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Ne}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Ne}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Ne},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Ne},normalScale:{value:new ct(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Ne},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Ne}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Ne}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Ne}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new qe(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new qe(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Ne},alphaTest:{value:0},uvTransform:{value:new Ne}},sprite:{diffuse:{value:new qe(16777215)},opacity:{value:1},center:{value:new ct(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Ne},alphaMap:{value:null},alphaMapTransform:{value:new Ne},alphaTest:{value:0}}},gt={basic:{uniforms:st([ae.common,ae.specularmap,ae.envmap,ae.aomap,ae.lightmap,ae.fog]),vertexShader:Ue.meshbasic_vert,fragmentShader:Ue.meshbasic_frag},lambert:{uniforms:st([ae.common,ae.specularmap,ae.envmap,ae.aomap,ae.lightmap,ae.emissivemap,ae.bumpmap,ae.normalmap,ae.displacementmap,ae.fog,ae.lights,{emissive:{value:new qe(0)}}]),vertexShader:Ue.meshlambert_vert,fragmentShader:Ue.meshlambert_frag},phong:{uniforms:st([ae.common,ae.specularmap,ae.envmap,ae.aomap,ae.lightmap,ae.emissivemap,ae.bumpmap,ae.normalmap,ae.displacementmap,ae.fog,ae.lights,{emissive:{value:new qe(0)},specular:{value:new qe(1118481)},shininess:{value:30}}]),vertexShader:Ue.meshphong_vert,fragmentShader:Ue.meshphong_frag},standard:{uniforms:st([ae.common,ae.envmap,ae.aomap,ae.lightmap,ae.emissivemap,ae.bumpmap,ae.normalmap,ae.displacementmap,ae.roughnessmap,ae.metalnessmap,ae.fog,ae.lights,{emissive:{value:new qe(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ue.meshphysical_vert,fragmentShader:Ue.meshphysical_frag},toon:{uniforms:st([ae.common,ae.aomap,ae.lightmap,ae.emissivemap,ae.bumpmap,ae.normalmap,ae.displacementmap,ae.gradientmap,ae.fog,ae.lights,{emissive:{value:new qe(0)}}]),vertexShader:Ue.meshtoon_vert,fragmentShader:Ue.meshtoon_frag},matcap:{uniforms:st([ae.common,ae.bumpmap,ae.normalmap,ae.displacementmap,ae.fog,{matcap:{value:null}}]),vertexShader:Ue.meshmatcap_vert,fragmentShader:Ue.meshmatcap_frag},points:{uniforms:st([ae.points,ae.fog]),vertexShader:Ue.points_vert,fragmentShader:Ue.points_frag},dashed:{uniforms:st([ae.common,ae.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ue.linedashed_vert,fragmentShader:Ue.linedashed_frag},depth:{uniforms:st([ae.common,ae.displacementmap]),vertexShader:Ue.depth_vert,fragmentShader:Ue.depth_frag},normal:{uniforms:st([ae.common,ae.bumpmap,ae.normalmap,ae.displacementmap,{opacity:{value:1}}]),vertexShader:Ue.meshnormal_vert,fragmentShader:Ue.meshnormal_frag},sprite:{uniforms:st([ae.sprite,ae.fog]),vertexShader:Ue.sprite_vert,fragmentShader:Ue.sprite_frag},background:{uniforms:{uvTransform:{value:new Ne},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ue.background_vert,fragmentShader:Ue.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Ne}},vertexShader:Ue.backgroundCube_vert,fragmentShader:Ue.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ue.cube_vert,fragmentShader:Ue.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ue.equirect_vert,fragmentShader:Ue.equirect_frag},distanceRGBA:{uniforms:st([ae.common,ae.displacementmap,{referencePosition:{value:new Ve},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Ue.distanceRGBA_vert,fragmentShader:Ue.distanceRGBA_frag},shadow:{uniforms:st([ae.lights,ae.fog,{color:{value:new qe(0)},opacity:{value:1}}]),vertexShader:Ue.shadow_vert,fragmentShader:Ue.shadow_frag}};gt.physical={uniforms:st([gt.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Ne},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Ne},clearcoatNormalScale:{value:new ct(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Ne},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Ne},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Ne},sheen:{value:0},sheenColor:{value:new qe(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Ne},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Ne},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Ne},transmissionSamplerSize:{value:new ct},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Ne},attenuationDistance:{value:0},attenuationColor:{value:new qe(0)},specularColor:{value:new qe(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Ne},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Ne},anisotropyVector:{value:new ct},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Ne}}]),vertexShader:Ue.meshphysical_vert,fragmentShader:Ue.meshphysical_frag};const ii={r:0,b:0,g:0},Ct=new gr,Nl=new qt;function Ol(e,i,t,a,l,o,m){const d=new qe(0);let P=o===!0?0:1,v,L,R=null,E=0,T=null;function F(C){let g=C.isScene===!0?C.background:null;return g&&g.isTexture&&(g=(C.backgroundBlurriness>0?t:i).get(g)),g}function U(C){let g=!1;const O=F(C);O===null?r(d,P):O&&O.isColor&&(r(O,1),g=!0);const b=e.xr.getEnvironmentBlendMode();b==="additive"?a.buffers.color.setClear(0,0,0,1,m):b==="alpha-blend"&&a.buffers.color.setClear(0,0,0,0,m),(e.autoClear||g)&&(a.buffers.depth.setTest(!0),a.buffers.depth.setMask(!0),a.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil))}function c(C,g){const O=F(g);O&&(O.isCubeTexture||O.mapping===mi)?(L===void 0&&(L=new xt(new ir(1,1,1),new It({name:"BackgroundCubeMaterial",uniforms:Pa(gt.backgroundCube.uniforms),vertexShader:gt.backgroundCube.vertexShader,fragmentShader:gt.backgroundCube.fragmentShader,side:pt,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),L.geometry.deleteAttribute("normal"),L.geometry.deleteAttribute("uv"),L.onBeforeRender=function(b,w,V){this.matrixWorld.copyPosition(V.matrixWorld)},Object.defineProperty(L.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),l.update(L)),Ct.copy(g.backgroundRotation),Ct.x*=-1,Ct.y*=-1,Ct.z*=-1,O.isCubeTexture&&O.isRenderTargetTexture===!1&&(Ct.y*=-1,Ct.z*=-1),L.material.uniforms.envMap.value=O,L.material.uniforms.flipEnvMap.value=O.isCubeTexture&&O.isRenderTargetTexture===!1?-1:1,L.material.uniforms.backgroundBlurriness.value=g.backgroundBlurriness,L.material.uniforms.backgroundIntensity.value=g.backgroundIntensity,L.material.uniforms.backgroundRotation.value.setFromMatrix4(Nl.makeRotationFromEuler(Ct)),L.material.toneMapped=et.getTransfer(O.colorSpace)!==Ye,(R!==O||E!==O.version||T!==e.toneMapping)&&(L.material.needsUpdate=!0,R=O,E=O.version,T=e.toneMapping),L.layers.enableAll(),C.unshift(L,L.geometry,L.material,0,0,null)):O&&O.isTexture&&(v===void 0&&(v=new xt(new dr(2,2),new It({name:"BackgroundMaterial",uniforms:Pa(gt.background.uniforms),vertexShader:gt.background.vertexShader,fragmentShader:gt.background.fragmentShader,side:jt,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),v.geometry.deleteAttribute("normal"),Object.defineProperty(v.material,"map",{get:function(){return this.uniforms.t2D.value}}),l.update(v)),v.material.uniforms.t2D.value=O,v.material.uniforms.backgroundIntensity.value=g.backgroundIntensity,v.material.toneMapped=et.getTransfer(O.colorSpace)!==Ye,O.matrixAutoUpdate===!0&&O.updateMatrix(),v.material.uniforms.uvTransform.value.copy(O.matrix),(R!==O||E!==O.version||T!==e.toneMapping)&&(v.material.needsUpdate=!0,R=O,E=O.version,T=e.toneMapping),v.layers.enableAll(),C.unshift(v,v.geometry,v.material,0,0,null))}function r(C,g){C.getRGB(ii,_r(e)),a.buffers.color.setClear(ii.r,ii.g,ii.b,g,m)}function D(){L!==void 0&&(L.geometry.dispose(),L.material.dispose(),L=void 0),v!==void 0&&(v.geometry.dispose(),v.material.dispose(),v=void 0)}return{getClearColor:function(){return d},setClearColor:function(C,g=1){d.set(C),P=g,r(d,P)},getClearAlpha:function(){return P},setClearAlpha:function(C){P=C,r(d,P)},render:U,addToRenderList:c,dispose:D}}function Fl(e,i){const t=e.getParameter(e.MAX_VERTEX_ATTRIBS),a={},l=E(null);let o=l,m=!1;function d(u,x,N,q,K){let Z=!1;const k=R(q,N,x);o!==k&&(o=k,v(o.object)),Z=T(u,q,N,K),Z&&F(u,q,N,K),K!==null&&i.update(K,e.ELEMENT_ARRAY_BUFFER),(Z||m)&&(m=!1,g(u,x,N,q),K!==null&&e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,i.get(K).buffer))}function P(){return e.createVertexArray()}function v(u){return e.bindVertexArray(u)}function L(u){return e.deleteVertexArray(u)}function R(u,x,N){const q=N.wireframe===!0;let K=a[u.id];K===void 0&&(K={},a[u.id]=K);let Z=K[x.id];Z===void 0&&(Z={},K[x.id]=Z);let k=Z[q];return k===void 0&&(k=E(P()),Z[q]=k),k}function E(u){const x=[],N=[],q=[];for(let K=0;K<t;K++)x[K]=0,N[K]=0,q[K]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:x,enabledAttributes:N,attributeDivisors:q,object:u,attributes:{},index:null}}function T(u,x,N,q){const K=o.attributes,Z=x.attributes;let k=0;const ie=N.getAttributes();for(const H in ie)if(ie[H].location>=0){const se=K[H];let Ce=Z[H];if(Ce===void 0&&(H==="instanceMatrix"&&u.instanceMatrix&&(Ce=u.instanceMatrix),H==="instanceColor"&&u.instanceColor&&(Ce=u.instanceColor)),se===void 0||se.attribute!==Ce||Ce&&se.data!==Ce.data)return!0;k++}return o.attributesNum!==k||o.index!==q}function F(u,x,N,q){const K={},Z=x.attributes;let k=0;const ie=N.getAttributes();for(const H in ie)if(ie[H].location>=0){let se=Z[H];se===void 0&&(H==="instanceMatrix"&&u.instanceMatrix&&(se=u.instanceMatrix),H==="instanceColor"&&u.instanceColor&&(se=u.instanceColor));const Ce={};Ce.attribute=se,se&&se.data&&(Ce.data=se.data),K[H]=Ce,k++}o.attributes=K,o.attributesNum=k,o.index=q}function U(){const u=o.newAttributes;for(let x=0,N=u.length;x<N;x++)u[x]=0}function c(u){r(u,0)}function r(u,x){const N=o.newAttributes,q=o.enabledAttributes,K=o.attributeDivisors;N[u]=1,q[u]===0&&(e.enableVertexAttribArray(u),q[u]=1),K[u]!==x&&(e.vertexAttribDivisor(u,x),K[u]=x)}function D(){const u=o.newAttributes,x=o.enabledAttributes;for(let N=0,q=x.length;N<q;N++)x[N]!==u[N]&&(e.disableVertexAttribArray(N),x[N]=0)}function C(u,x,N,q,K,Z,k){k===!0?e.vertexAttribIPointer(u,x,N,K,Z):e.vertexAttribPointer(u,x,N,q,K,Z)}function g(u,x,N,q){U();const K=q.attributes,Z=N.getAttributes(),k=x.defaultAttributeValues;for(const ie in Z){const H=Z[ie];if(H.location>=0){let se=K[ie];if(se===void 0&&(ie==="instanceMatrix"&&u.instanceMatrix&&(se=u.instanceMatrix),ie==="instanceColor"&&u.instanceColor&&(se=u.instanceColor)),se!==void 0){const Ce=se.normalized,Be=se.itemSize,Oe=i.get(se);if(Oe===void 0)continue;const Je=Oe.buffer,$e=Oe.type,Ge=Oe.bytesPerElement,z=$e===e.INT||$e===e.UNSIGNED_INT||se.gpuType===ur;if(se.isInterleavedBufferAttribute){const Y=se.data,fe=Y.stride,be=se.offset;if(Y.isInstancedInterleavedBuffer){for(let Ee=0;Ee<H.locationSize;Ee++)r(H.location+Ee,Y.meshPerAttribute);u.isInstancedMesh!==!0&&q._maxInstanceCount===void 0&&(q._maxInstanceCount=Y.meshPerAttribute*Y.count)}else for(let Ee=0;Ee<H.locationSize;Ee++)c(H.location+Ee);e.bindBuffer(e.ARRAY_BUFFER,Je);for(let Ee=0;Ee<H.locationSize;Ee++)C(H.location+Ee,Be/H.locationSize,$e,Ce,fe*Ge,(be+Be/H.locationSize*Ee)*Ge,z)}else{if(se.isInstancedBufferAttribute){for(let Y=0;Y<H.locationSize;Y++)r(H.location+Y,se.meshPerAttribute);u.isInstancedMesh!==!0&&q._maxInstanceCount===void 0&&(q._maxInstanceCount=se.meshPerAttribute*se.count)}else for(let Y=0;Y<H.locationSize;Y++)c(H.location+Y);e.bindBuffer(e.ARRAY_BUFFER,Je);for(let Y=0;Y<H.locationSize;Y++)C(H.location+Y,Be/H.locationSize,$e,Ce,Be*Ge,Be/H.locationSize*Y*Ge,z)}}else if(k!==void 0){const Ce=k[ie];if(Ce!==void 0)switch(Ce.length){case 2:e.vertexAttrib2fv(H.location,Ce);break;case 3:e.vertexAttrib3fv(H.location,Ce);break;case 4:e.vertexAttrib4fv(H.location,Ce);break;default:e.vertexAttrib1fv(H.location,Ce)}}}}D()}function O(){V();for(const u in a){const x=a[u];for(const N in x){const q=x[N];for(const K in q)L(q[K].object),delete q[K];delete x[N]}delete a[u]}}function b(u){if(a[u.id]===void 0)return;const x=a[u.id];for(const N in x){const q=x[N];for(const K in q)L(q[K].object),delete q[K];delete x[N]}delete a[u.id]}function w(u){for(const x in a){const N=a[x];if(N[u.id]===void 0)continue;const q=N[u.id];for(const K in q)L(q[K].object),delete q[K];delete N[u.id]}}function V(){p(),m=!0,o!==l&&(o=l,v(o.object))}function p(){l.geometry=null,l.program=null,l.wireframe=!1}return{setup:d,reset:V,resetDefaultState:p,dispose:O,releaseStatesOfGeometry:b,releaseStatesOfProgram:w,initAttributes:U,enableAttribute:c,disableUnusedAttributes:D}}function Bl(e,i,t){let a;function l(v){a=v}function o(v,L){e.drawArrays(a,v,L),t.update(L,a,1)}function m(v,L,R){R!==0&&(e.drawArraysInstanced(a,v,L,R),t.update(L,a,R))}function d(v,L,R){if(R===0)return;i.get("WEBGL_multi_draw").multiDrawArraysWEBGL(a,v,0,L,0,R);let E=0;for(let T=0;T<R;T++)E+=L[T];t.update(E,a,1)}function P(v,L,R,E){if(R===0)return;const T=i.get("WEBGL_multi_draw");if(T===null)for(let F=0;F<v.length;F++)m(v[F],L[F],E[F]);else{T.multiDrawArraysInstancedWEBGL(a,v,0,L,0,E,0,R);let F=0;for(let U=0;U<R;U++)F+=L[U]*E[U];t.update(F,a,1)}}this.setMode=l,this.render=o,this.renderInstances=m,this.renderMultiDraw=d,this.renderMultiDrawInstances=P}function Hl(e,i,t,a){let l;function o(){if(l!==void 0)return l;if(i.has("EXT_texture_filter_anisotropic")===!0){const w=i.get("EXT_texture_filter_anisotropic");l=e.getParameter(w.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else l=0;return l}function m(w){return!(w!==Tt&&a.convert(w)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT))}function d(w){const V=w===fi&&(i.has("EXT_color_buffer_half_float")||i.has("EXT_color_buffer_float"));return!(w!==yt&&a.convert(w)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE)&&w!==Dt&&!V)}function P(w){if(w==="highp"){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return"highp";w="mediump"}return w==="mediump"&&e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let v=t.precision!==void 0?t.precision:"highp";const L=P(v);L!==v&&(console.warn("THREE.WebGLRenderer:",v,"not supported, using",L,"instead."),v=L);const R=t.logarithmicDepthBuffer===!0,E=t.reversedDepthBuffer===!0&&i.has("EXT_clip_control"),T=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),F=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),U=e.getParameter(e.MAX_TEXTURE_SIZE),c=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),r=e.getParameter(e.MAX_VERTEX_ATTRIBS),D=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),C=e.getParameter(e.MAX_VARYING_VECTORS),g=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),O=F>0,b=e.getParameter(e.MAX_SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:o,getMaxPrecision:P,textureFormatReadable:m,textureTypeReadable:d,precision:v,logarithmicDepthBuffer:R,reversedDepthBuffer:E,maxTextures:T,maxVertexTextures:F,maxTextureSize:U,maxCubemapSize:c,maxAttributes:r,maxVertexUniforms:D,maxVaryings:C,maxFragmentUniforms:g,vertexTextures:O,maxSamples:b}}function Gl(e){const i=this;let t=null,a=0,l=!1,o=!1;const m=new mn,d=new Ne,P={value:null,needsUpdate:!1};this.uniform=P,this.numPlanes=0,this.numIntersection=0,this.init=function(R,E){const T=R.length!==0||E||a!==0||l;return l=E,a=R.length,T},this.beginShadows=function(){o=!0,L(null)},this.endShadows=function(){o=!1},this.setGlobalState=function(R,E){t=L(R,E,0)},this.setState=function(R,E,T){const F=R.clippingPlanes,U=R.clipIntersection,c=R.clipShadows,r=e.get(R);if(!l||F===null||F.length===0||o&&!c)o?L(null):v();else{const D=o?0:a,C=D*4;let g=r.clippingState||null;P.value=g,g=L(F,E,C,T);for(let O=0;O!==C;++O)g[O]=t[O];r.clippingState=g,this.numIntersection=U?this.numPlanes:0,this.numPlanes+=D}};function v(){P.value!==t&&(P.value=t,P.needsUpdate=a>0),i.numPlanes=a,i.numIntersection=0}function L(R,E,T,F){const U=R!==null?R.length:0;let c=null;if(U!==0){if(c=P.value,F!==!0||c===null){const r=T+U*4,D=E.matrixWorldInverse;d.getNormalMatrix(D),(c===null||c.length<r)&&(c=new Float32Array(r));for(let C=0,g=T;C!==U;++C,g+=4)m.copy(R[C]).applyMatrix4(D,d),m.normal.toArray(c,g),c[g+3]=m.constant}P.value=c,P.needsUpdate=!0}return i.numPlanes=U,i.numIntersection=0,c}}function Vl(e){let i=new WeakMap;function t(m,d){return d===Bi?m.mapping=Zt:d===Hi&&(m.mapping=Vt),m}function a(m){if(m&&m.isTexture){const d=m.mapping;if(d===Bi||d===Hi)if(i.has(m)){const P=i.get(m).texture;return t(P,m.mapping)}else{const P=m.image;if(P&&P.height>0){const v=new Ln(P.height);return v.fromEquirectangularTexture(e,m),i.set(m,v),m.addEventListener("dispose",l),t(v.texture,m.mapping)}else return null}}return m}function l(m){const d=m.target;d.removeEventListener("dispose",l);const P=i.get(d);P!==void 0&&(i.delete(d),P.dispose())}function o(){i=new WeakMap}return{get:a,dispose:o}}const Ht=4,Da=[.125,.215,.35,.446,.526,.582],Ut=20,Ri=new Ir,wa=new qe;let Ai=null,bi=0,Ci=0,Pi=!1;const Lt=(1+Math.sqrt(5))/2,Ot=1/Lt,ya=[new Ve(-Lt,Ot,0),new Ve(Lt,Ot,0),new Ve(-Ot,0,Lt),new Ve(Ot,0,Lt),new Ve(0,Lt,-Ot),new Ve(0,Lt,Ot),new Ve(-1,1,-1),new Ve(1,1,-1),new Ve(-1,1,1),new Ve(1,1,1)],zl=new Ve;class Ia{constructor(i){this._renderer=i,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(i,t=0,a=.1,l=100,o={}){const{size:m=256,position:d=zl}=o;Ai=this._renderer.getRenderTarget(),bi=this._renderer.getActiveCubeFace(),Ci=this._renderer.getActiveMipmapLevel(),Pi=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(m);const P=this._allocateTargets();return P.depthBuffer=!0,this._sceneToCubeUV(i,a,l,P,d),t>0&&this._blur(P,0,0,t),this._applyPMREM(P),this._cleanup(P),P}fromEquirectangular(i,t=null){return this._fromTexture(i,t)}fromCubemap(i,t=null){return this._fromTexture(i,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Fa(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Oa(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(i){this._lodMax=Math.floor(Math.log2(i)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let i=0;i<this._lodPlanes.length;i++)this._lodPlanes[i].dispose()}_cleanup(i){this._renderer.setRenderTarget(Ai,bi,Ci),this._renderer.xr.enabled=Pi,i.scissorTest=!1,ai(i,0,0,i.width,i.height)}_fromTexture(i,t){i.mapping===Zt||i.mapping===Vt?this._setSize(i.image.length===0?16:i.image[0].width||i.image[0].image.width):this._setSize(i.image.width/4),Ai=this._renderer.getRenderTarget(),bi=this._renderer.getActiveCubeFace(),Ci=this._renderer.getActiveMipmapLevel(),Pi=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const a=t||this._allocateTargets();return this._textureToCubeUV(i,a),this._applyPMREM(a),this._cleanup(a),a}_allocateTargets(){const i=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,a={magFilter:Bt,minFilter:Bt,generateMipmaps:!1,type:fi,format:Tt,colorSpace:pi,depthBuffer:!1},l=Na(i,t,a);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==i||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Na(i,t,a);const{_lodMax:o}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=Wl(o)),this._blurMaterial=kl(o,i,t)}return l}_compileMaterial(i){const t=new xt(this._lodPlanes[0],i);this._renderer.compile(t,Ri)}_sceneToCubeUV(i,t,a,l,o){const m=new ni(90,1,t,a),d=[1,-1,1,1,1,1],P=[1,1,1,-1,-1,-1],v=this._renderer,L=v.autoClear,R=v.toneMapping;v.getClearColor(wa),v.toneMapping=Rt,v.autoClear=!1,v.state.buffers.depth.getReversed()&&(v.setRenderTarget(l),v.clearDepth(),v.setRenderTarget(null));const E=new Nr({name:"PMREM.Background",side:pt,depthWrite:!1,depthTest:!1}),T=new xt(new ir,E);let F=!1;const U=i.background;U?U.isColor&&(E.color.copy(U),i.background=null,F=!0):(E.color.copy(wa),F=!0);for(let c=0;c<6;c++){const r=c%3;r===0?(m.up.set(0,d[c],0),m.position.set(o.x,o.y,o.z),m.lookAt(o.x+P[c],o.y,o.z)):r===1?(m.up.set(0,0,d[c]),m.position.set(o.x,o.y,o.z),m.lookAt(o.x,o.y+P[c],o.z)):(m.up.set(0,d[c],0),m.position.set(o.x,o.y,o.z),m.lookAt(o.x,o.y,o.z+P[c]));const D=this._cubeSize;ai(l,r*D,c>2?D:0,D,D),v.setRenderTarget(l),F&&v.render(T,m),v.render(i,m)}T.geometry.dispose(),T.material.dispose(),v.toneMapping=R,v.autoClear=L,i.background=U}_textureToCubeUV(i,t){const a=this._renderer,l=i.mapping===Zt||i.mapping===Vt;l?(this._cubemapMaterial===null&&(this._cubemapMaterial=Fa()),this._cubemapMaterial.uniforms.flipEnvMap.value=i.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Oa());const o=l?this._cubemapMaterial:this._equirectMaterial,m=new xt(this._lodPlanes[0],o),d=o.uniforms;d.envMap.value=i;const P=this._cubeSize;ai(t,0,0,3*P,2*P),a.setRenderTarget(t),a.render(m,Ri)}_applyPMREM(i){const t=this._renderer,a=t.autoClear;t.autoClear=!1;const l=this._lodPlanes.length;for(let o=1;o<l;o++){const m=Math.sqrt(this._sigmas[o]*this._sigmas[o]-this._sigmas[o-1]*this._sigmas[o-1]),d=ya[(l-o-1)%ya.length];this._blur(i,o-1,o,m,d)}t.autoClear=a}_blur(i,t,a,l,o){const m=this._pingPongRenderTarget;this._halfBlur(i,m,t,a,l,"latitudinal",o),this._halfBlur(m,i,a,a,l,"longitudinal",o)}_halfBlur(i,t,a,l,o,m,d){const P=this._renderer,v=this._blurMaterial;m!=="latitudinal"&&m!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");const L=3,R=new xt(this._lodPlanes[l],v),E=v.uniforms,T=this._sizeLods[a]-1,F=isFinite(o)?Math.PI/(2*T):2*Math.PI/(2*Ut-1),U=o/F,c=isFinite(o)?1+Math.floor(L*U):Ut;c>Ut&&console.warn(`sigmaRadians, ${o}, is too large and will clip, as it requested ${c} samples when the maximum is set to ${Ut}`);const r=[];let D=0;for(let w=0;w<Ut;++w){const V=w/U,p=Math.exp(-V*V/2);r.push(p),w===0?D+=p:w<c&&(D+=2*p)}for(let w=0;w<r.length;w++)r[w]=r[w]/D;E.envMap.value=i.texture,E.samples.value=c,E.weights.value=r,E.latitudinal.value=m==="latitudinal",d&&(E.poleAxis.value=d);const{_lodMax:C}=this;E.dTheta.value=F,E.mipInt.value=C-a;const g=this._sizeLods[l],O=3*g*(l>C-Ht?l-C+Ht:0),b=4*(this._cubeSize-g);ai(t,O,b,3*g,2*g),P.setRenderTarget(t),P.render(R,Ri)}}function Wl(e){const i=[],t=[],a=[];let l=e;const o=e-Ht+1+Da.length;for(let m=0;m<o;m++){const d=Math.pow(2,l);t.push(d);let P=1/d;m>e-Ht?P=Da[m-e+Ht-1]:m===0&&(P=0),a.push(P);const v=1/(d-2),L=-v,R=1+v,E=[L,L,R,L,R,R,L,L,R,R,L,R],T=6,F=6,U=3,c=2,r=1,D=new Float32Array(U*F*T),C=new Float32Array(c*F*T),g=new Float32Array(r*F*T);for(let b=0;b<T;b++){const w=b%3*2/3-1,V=b>2?0:-1,p=[w,V,0,w+2/3,V,0,w+2/3,V+1,0,w,V,0,w+2/3,V+1,0,w,V+1,0];D.set(p,U*F*b),C.set(E,c*F*b);const u=[b,b,b,b,b,b];g.set(u,r*F*b)}const O=new rr;O.setAttribute("position",new oi(D,U)),O.setAttribute("uv",new oi(C,c)),O.setAttribute("faceIndex",new oi(g,r)),i.push(O),l>Ht&&l--}return{lodPlanes:i,sizeLods:t,sigmas:a}}function Na(e,i,t){const a=new Gt(e,i,t);return a.texture.mapping=mi,a.texture.name="PMREM.cubeUv",a.scissorTest=!0,a}function ai(e,i,t,a,l){e.viewport.set(i,t,a,l),e.scissor.set(i,t,a,l)}function kl(e,i,t){const a=new Float32Array(Ut),l=new Ve(0,1,0);return new It({name:"SphericalGaussianBlur",defines:{n:Ut,CUBEUV_TEXEL_WIDTH:1/i,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:a},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:l}},vertexShader:zi(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:wt,depthTest:!1,depthWrite:!1})}function Oa(){return new It({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:zi(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:wt,depthTest:!1,depthWrite:!1})}function Fa(){return new It({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:zi(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:wt,depthTest:!1,depthWrite:!1})}function zi(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function Xl(e){let i=new WeakMap,t=null;function a(d){if(d&&d.isTexture){const P=d.mapping,v=P===Bi||P===Hi,L=P===Zt||P===Vt;if(v||L){let R=i.get(d);const E=R!==void 0?R.texture.pmremVersion:0;if(d.isRenderTargetTexture&&d.pmremVersion!==E)return t===null&&(t=new Ia(e)),R=v?t.fromEquirectangular(d,R):t.fromCubemap(d,R),R.texture.pmremVersion=d.pmremVersion,i.set(d,R),R.texture;if(R!==void 0)return R.texture;{const T=d.image;return v&&T&&T.height>0||L&&T&&l(T)?(t===null&&(t=new Ia(e)),R=v?t.fromEquirectangular(d):t.fromCubemap(d),R.texture.pmremVersion=d.pmremVersion,i.set(d,R),d.addEventListener("dispose",o),R.texture):null}}}return d}function l(d){let P=0;const v=6;for(let L=0;L<v;L++)d[L]!==void 0&&P++;return P===v}function o(d){const P=d.target;P.removeEventListener("dispose",o);const v=i.get(P);v!==void 0&&(i.delete(P),v.dispose())}function m(){i=new WeakMap,t!==null&&(t.dispose(),t=null)}return{get:a,dispose:m}}function Yl(e){const i={};function t(a){if(i[a]!==void 0)return i[a];let l;switch(a){case"WEBGL_depth_texture":l=e.getExtension("WEBGL_depth_texture")||e.getExtension("MOZ_WEBGL_depth_texture")||e.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":l=e.getExtension("EXT_texture_filter_anisotropic")||e.getExtension("MOZ_EXT_texture_filter_anisotropic")||e.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":l=e.getExtension("WEBGL_compressed_texture_s3tc")||e.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||e.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":l=e.getExtension("WEBGL_compressed_texture_pvrtc")||e.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:l=e.getExtension(a)}return i[a]=l,l}return{has:function(a){return t(a)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(a){const l=t(a);return l===null&&Ui("THREE.WebGLRenderer: "+a+" extension not supported."),l}}}function Kl(e,i,t,a){const l={},o=new WeakMap;function m(R){const E=R.target;E.index!==null&&i.remove(E.index);for(const F in E.attributes)i.remove(E.attributes[F]);E.removeEventListener("dispose",m),delete l[E.id];const T=o.get(E);T&&(i.remove(T),o.delete(E)),a.releaseStatesOfGeometry(E),E.isInstancedBufferGeometry===!0&&delete E._maxInstanceCount,t.memory.geometries--}function d(R,E){return l[E.id]===!0||(E.addEventListener("dispose",m),l[E.id]=!0,t.memory.geometries++),E}function P(R){const E=R.attributes;for(const T in E)i.update(E[T],e.ARRAY_BUFFER)}function v(R){const E=[],T=R.index,F=R.attributes.position;let U=0;if(T!==null){const D=T.array;U=T.version;for(let C=0,g=D.length;C<g;C+=3){const O=D[C+0],b=D[C+1],w=D[C+2];E.push(O,b,b,w,w,O)}}else if(F!==void 0){const D=F.array;U=F.version;for(let C=0,g=D.length/3-1;C<g;C+=3){const O=C+0,b=C+1,w=C+2;E.push(O,b,b,w,w,O)}}else return;const c=new(Nn(E)?yn:In)(E,1);c.version=U;const r=o.get(R);r&&i.remove(r),o.set(R,c)}function L(R){const E=o.get(R);if(E){const T=R.index;T!==null&&E.version<T.version&&v(R)}else v(R);return o.get(R)}return{get:d,update:P,getWireframeAttribute:L}}function ql(e,i,t){let a;function l(E){a=E}let o,m;function d(E){o=E.type,m=E.bytesPerElement}function P(E,T){e.drawElements(a,T,o,E*m),t.update(T,a,1)}function v(E,T,F){F!==0&&(e.drawElementsInstanced(a,T,o,E*m,F),t.update(T,a,F))}function L(E,T,F){if(F===0)return;i.get("WEBGL_multi_draw").multiDrawElementsWEBGL(a,T,0,o,E,0,F);let U=0;for(let c=0;c<F;c++)U+=T[c];t.update(U,a,1)}function R(E,T,F,U){if(F===0)return;const c=i.get("WEBGL_multi_draw");if(c===null)for(let r=0;r<E.length;r++)v(E[r]/m,T[r],U[r]);else{c.multiDrawElementsInstancedWEBGL(a,T,0,o,E,0,U,0,F);let r=0;for(let D=0;D<F;D++)r+=T[D]*U[D];t.update(r,a,1)}}this.setMode=l,this.setIndex=d,this.render=P,this.renderInstances=v,this.renderMultiDraw=L,this.renderMultiDrawInstances=R}function jl(e){const i={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function a(o,m,d){switch(t.calls++,m){case e.TRIANGLES:t.triangles+=d*(o/3);break;case e.LINES:t.lines+=d*(o/2);break;case e.LINE_STRIP:t.lines+=d*(o-1);break;case e.LINE_LOOP:t.lines+=d*o;break;case e.POINTS:t.points+=d*o;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",m);break}}function l(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:i,render:t,programs:null,autoReset:!0,reset:l,update:a}}function Zl(e,i,t){const a=new WeakMap,l=new lt;function o(m,d,P){const v=m.morphTargetInfluences,L=d.morphAttributes.position||d.morphAttributes.normal||d.morphAttributes.color,R=L!==void 0?L.length:0;let E=a.get(d);if(E===void 0||E.count!==R){let T=function(){V.dispose(),a.delete(d),d.removeEventListener("dispose",T)};E!==void 0&&E.texture.dispose();const F=d.morphAttributes.position!==void 0,U=d.morphAttributes.normal!==void 0,c=d.morphAttributes.color!==void 0,r=d.morphAttributes.position||[],D=d.morphAttributes.normal||[],C=d.morphAttributes.color||[];let g=0;F===!0&&(g=1),U===!0&&(g=2),c===!0&&(g=3);let O=d.attributes.position.count*g,b=1;O>i.maxTextureSize&&(b=Math.ceil(O/i.maxTextureSize),O=i.maxTextureSize);const w=new Float32Array(O*b*4*R),V=new hr(w,O,b,R);V.type=Dt,V.needsUpdate=!0;const p=g*4;for(let u=0;u<R;u++){const x=r[u],N=D[u],q=C[u],K=O*b*4*u;for(let Z=0;Z<x.count;Z++){const k=Z*p;F===!0&&(l.fromBufferAttribute(x,Z),w[K+k+0]=l.x,w[K+k+1]=l.y,w[K+k+2]=l.z,w[K+k+3]=0),U===!0&&(l.fromBufferAttribute(N,Z),w[K+k+4]=l.x,w[K+k+5]=l.y,w[K+k+6]=l.z,w[K+k+7]=0),c===!0&&(l.fromBufferAttribute(q,Z),w[K+k+8]=l.x,w[K+k+9]=l.y,w[K+k+10]=l.z,w[K+k+11]=q.itemSize===4?l.w:1)}}E={count:R,texture:V,size:new ct(O,b)},a.set(d,E),d.addEventListener("dispose",T)}if(m.isInstancedMesh===!0&&m.morphTexture!==null)P.getUniforms().setValue(e,"morphTexture",m.morphTexture,t);else{let T=0;for(let U=0;U<v.length;U++)T+=v[U];const F=d.morphTargetsRelative?1:1-T;P.getUniforms().setValue(e,"morphTargetBaseInfluence",F),P.getUniforms().setValue(e,"morphTargetInfluences",v)}P.getUniforms().setValue(e,"morphTargetsTexture",E.texture,t),P.getUniforms().setValue(e,"morphTargetsTextureSize",E.size)}return{update:o}}function $l(e,i,t,a){let l=new WeakMap;function o(P){const v=a.render.frame,L=P.geometry,R=i.get(P,L);if(l.get(R)!==v&&(i.update(R),l.set(R,v)),P.isInstancedMesh&&(P.hasEventListener("dispose",d)===!1&&P.addEventListener("dispose",d),l.get(P)!==v&&(t.update(P.instanceMatrix,e.ARRAY_BUFFER),P.instanceColor!==null&&t.update(P.instanceColor,e.ARRAY_BUFFER),l.set(P,v))),P.isSkinnedMesh){const E=P.skeleton;l.get(E)!==v&&(E.update(),l.set(E,v))}return R}function m(){l=new WeakMap}function d(P){const v=P.target;v.removeEventListener("dispose",d),t.remove(v.instanceMatrix),v.instanceColor!==null&&t.remove(v.instanceColor)}return{update:o,dispose:m}}const Sr=new Kn,Ba=new ar(1,1),Mr=new hr,Tr=new Yn,xr=new Xn,Ha=[],Ga=[],Va=new Float32Array(16),za=new Float32Array(9),Wa=new Float32Array(4);function zt(e,i,t){const a=e[0];if(a<=0||a>0)return e;const l=i*t;let o=Ha[l];if(o===void 0&&(o=new Float32Array(l),Ha[l]=o),i!==0){a.toArray(o,0);for(let m=1,d=0;m!==i;++m)d+=t,e[m].toArray(o,d)}return o}function it(e,i){if(e.length!==i.length)return!1;for(let t=0,a=e.length;t<a;t++)if(e[t]!==i[t])return!1;return!0}function at(e,i){for(let t=0,a=i.length;t<a;t++)e[t]=i[t]}function hi(e,i){let t=Ga[i];t===void 0&&(t=new Int32Array(i),Ga[i]=t);for(let a=0;a!==i;++a)t[a]=e.allocateTextureUnit();return t}function Jl(e,i){const t=this.cache;t[0]!==i&&(e.uniform1f(this.addr,i),t[0]=i)}function Ql(e,i){const t=this.cache;if(i.x!==void 0)(t[0]!==i.x||t[1]!==i.y)&&(e.uniform2f(this.addr,i.x,i.y),t[0]=i.x,t[1]=i.y);else{if(it(t,i))return;e.uniform2fv(this.addr,i),at(t,i)}}function ec(e,i){const t=this.cache;if(i.x!==void 0)(t[0]!==i.x||t[1]!==i.y||t[2]!==i.z)&&(e.uniform3f(this.addr,i.x,i.y,i.z),t[0]=i.x,t[1]=i.y,t[2]=i.z);else if(i.r!==void 0)(t[0]!==i.r||t[1]!==i.g||t[2]!==i.b)&&(e.uniform3f(this.addr,i.r,i.g,i.b),t[0]=i.r,t[1]=i.g,t[2]=i.b);else{if(it(t,i))return;e.uniform3fv(this.addr,i),at(t,i)}}function tc(e,i){const t=this.cache;if(i.x!==void 0)(t[0]!==i.x||t[1]!==i.y||t[2]!==i.z||t[3]!==i.w)&&(e.uniform4f(this.addr,i.x,i.y,i.z,i.w),t[0]=i.x,t[1]=i.y,t[2]=i.z,t[3]=i.w);else{if(it(t,i))return;e.uniform4fv(this.addr,i),at(t,i)}}function ic(e,i){const t=this.cache,a=i.elements;if(a===void 0){if(it(t,i))return;e.uniformMatrix2fv(this.addr,!1,i),at(t,i)}else{if(it(t,a))return;Wa.set(a),e.uniformMatrix2fv(this.addr,!1,Wa),at(t,a)}}function ac(e,i){const t=this.cache,a=i.elements;if(a===void 0){if(it(t,i))return;e.uniformMatrix3fv(this.addr,!1,i),at(t,i)}else{if(it(t,a))return;za.set(a),e.uniformMatrix3fv(this.addr,!1,za),at(t,a)}}function rc(e,i){const t=this.cache,a=i.elements;if(a===void 0){if(it(t,i))return;e.uniformMatrix4fv(this.addr,!1,i),at(t,i)}else{if(it(t,a))return;Va.set(a),e.uniformMatrix4fv(this.addr,!1,Va),at(t,a)}}function nc(e,i){const t=this.cache;t[0]!==i&&(e.uniform1i(this.addr,i),t[0]=i)}function oc(e,i){const t=this.cache;if(i.x!==void 0)(t[0]!==i.x||t[1]!==i.y)&&(e.uniform2i(this.addr,i.x,i.y),t[0]=i.x,t[1]=i.y);else{if(it(t,i))return;e.uniform2iv(this.addr,i),at(t,i)}}function sc(e,i){const t=this.cache;if(i.x!==void 0)(t[0]!==i.x||t[1]!==i.y||t[2]!==i.z)&&(e.uniform3i(this.addr,i.x,i.y,i.z),t[0]=i.x,t[1]=i.y,t[2]=i.z);else{if(it(t,i))return;e.uniform3iv(this.addr,i),at(t,i)}}function lc(e,i){const t=this.cache;if(i.x!==void 0)(t[0]!==i.x||t[1]!==i.y||t[2]!==i.z||t[3]!==i.w)&&(e.uniform4i(this.addr,i.x,i.y,i.z,i.w),t[0]=i.x,t[1]=i.y,t[2]=i.z,t[3]=i.w);else{if(it(t,i))return;e.uniform4iv(this.addr,i),at(t,i)}}function cc(e,i){const t=this.cache;t[0]!==i&&(e.uniform1ui(this.addr,i),t[0]=i)}function dc(e,i){const t=this.cache;if(i.x!==void 0)(t[0]!==i.x||t[1]!==i.y)&&(e.uniform2ui(this.addr,i.x,i.y),t[0]=i.x,t[1]=i.y);else{if(it(t,i))return;e.uniform2uiv(this.addr,i),at(t,i)}}function uc(e,i){const t=this.cache;if(i.x!==void 0)(t[0]!==i.x||t[1]!==i.y||t[2]!==i.z)&&(e.uniform3ui(this.addr,i.x,i.y,i.z),t[0]=i.x,t[1]=i.y,t[2]=i.z);else{if(it(t,i))return;e.uniform3uiv(this.addr,i),at(t,i)}}function fc(e,i){const t=this.cache;if(i.x!==void 0)(t[0]!==i.x||t[1]!==i.y||t[2]!==i.z||t[3]!==i.w)&&(e.uniform4ui(this.addr,i.x,i.y,i.z,i.w),t[0]=i.x,t[1]=i.y,t[2]=i.z,t[3]=i.w);else{if(it(t,i))return;e.uniform4uiv(this.addr,i),at(t,i)}}function pc(e,i,t){const a=this.cache,l=t.allocateTextureUnit();a[0]!==l&&(e.uniform1i(this.addr,l),a[0]=l);let o;this.type===e.SAMPLER_2D_SHADOW?(Ba.compareFunction=nr,o=Ba):o=Sr,t.setTexture2D(i||o,l)}function mc(e,i,t){const a=this.cache,l=t.allocateTextureUnit();a[0]!==l&&(e.uniform1i(this.addr,l),a[0]=l),t.setTexture3D(i||Tr,l)}function hc(e,i,t){const a=this.cache,l=t.allocateTextureUnit();a[0]!==l&&(e.uniform1i(this.addr,l),a[0]=l),t.setTextureCube(i||xr,l)}function _c(e,i,t){const a=this.cache,l=t.allocateTextureUnit();a[0]!==l&&(e.uniform1i(this.addr,l),a[0]=l),t.setTexture2DArray(i||Mr,l)}function gc(e){switch(e){case 5126:return Jl;case 35664:return Ql;case 35665:return ec;case 35666:return tc;case 35674:return ic;case 35675:return ac;case 35676:return rc;case 5124:case 35670:return nc;case 35667:case 35671:return oc;case 35668:case 35672:return sc;case 35669:case 35673:return lc;case 5125:return cc;case 36294:return dc;case 36295:return uc;case 36296:return fc;case 35678:case 36198:case 36298:case 36306:case 35682:return pc;case 35679:case 36299:case 36307:return mc;case 35680:case 36300:case 36308:case 36293:return hc;case 36289:case 36303:case 36311:case 36292:return _c}}function vc(e,i){e.uniform1fv(this.addr,i)}function Ec(e,i){const t=zt(i,this.size,2);e.uniform2fv(this.addr,t)}function Sc(e,i){const t=zt(i,this.size,3);e.uniform3fv(this.addr,t)}function Mc(e,i){const t=zt(i,this.size,4);e.uniform4fv(this.addr,t)}function Tc(e,i){const t=zt(i,this.size,4);e.uniformMatrix2fv(this.addr,!1,t)}function xc(e,i){const t=zt(i,this.size,9);e.uniformMatrix3fv(this.addr,!1,t)}function Rc(e,i){const t=zt(i,this.size,16);e.uniformMatrix4fv(this.addr,!1,t)}function Ac(e,i){e.uniform1iv(this.addr,i)}function bc(e,i){e.uniform2iv(this.addr,i)}function Cc(e,i){e.uniform3iv(this.addr,i)}function Pc(e,i){e.uniform4iv(this.addr,i)}function Lc(e,i){e.uniform1uiv(this.addr,i)}function Uc(e,i){e.uniform2uiv(this.addr,i)}function Dc(e,i){e.uniform3uiv(this.addr,i)}function wc(e,i){e.uniform4uiv(this.addr,i)}function yc(e,i,t){const a=this.cache,l=i.length,o=hi(t,l);it(a,o)||(e.uniform1iv(this.addr,o),at(a,o));for(let m=0;m!==l;++m)t.setTexture2D(i[m]||Sr,o[m])}function Ic(e,i,t){const a=this.cache,l=i.length,o=hi(t,l);it(a,o)||(e.uniform1iv(this.addr,o),at(a,o));for(let m=0;m!==l;++m)t.setTexture3D(i[m]||Tr,o[m])}function Nc(e,i,t){const a=this.cache,l=i.length,o=hi(t,l);it(a,o)||(e.uniform1iv(this.addr,o),at(a,o));for(let m=0;m!==l;++m)t.setTextureCube(i[m]||xr,o[m])}function Oc(e,i,t){const a=this.cache,l=i.length,o=hi(t,l);it(a,o)||(e.uniform1iv(this.addr,o),at(a,o));for(let m=0;m!==l;++m)t.setTexture2DArray(i[m]||Mr,o[m])}function Fc(e){switch(e){case 5126:return vc;case 35664:return Ec;case 35665:return Sc;case 35666:return Mc;case 35674:return Tc;case 35675:return xc;case 35676:return Rc;case 5124:case 35670:return Ac;case 35667:case 35671:return bc;case 35668:case 35672:return Cc;case 35669:case 35673:return Pc;case 5125:return Lc;case 36294:return Uc;case 36295:return Dc;case 36296:return wc;case 35678:case 36198:case 36298:case 36306:case 35682:return yc;case 35679:case 36299:case 36307:return Ic;case 35680:case 36300:case 36308:case 36293:return Nc;case 36289:case 36303:case 36311:case 36292:return Oc}}class Bc{constructor(i,t,a){this.id=i,this.addr=a,this.cache=[],this.type=t.type,this.setValue=gc(t.type)}}class Hc{constructor(i,t,a){this.id=i,this.addr=a,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=Fc(t.type)}}class Gc{constructor(i){this.id=i,this.seq=[],this.map={}}setValue(i,t,a){const l=this.seq;for(let o=0,m=l.length;o!==m;++o){const d=l[o];d.setValue(i,t[d.id],a)}}}const Li=/(\w+)(\])?(\[|\.)?/g;function ka(e,i){e.seq.push(i),e.map[i.id]=i}function Vc(e,i,t){const a=e.name,l=a.length;for(Li.lastIndex=0;;){const o=Li.exec(a),m=Li.lastIndex;let d=o[1];const P=o[2]==="]",v=o[3];if(P&&(d=d|0),v===void 0||v==="["&&m+2===l){ka(t,v===void 0?new Bc(d,e,i):new Hc(d,e,i));break}else{let L=t.map[d];L===void 0&&(L=new Gc(d),ka(t,L)),t=L}}}class li{constructor(i,t){this.seq=[],this.map={};const a=i.getProgramParameter(t,i.ACTIVE_UNIFORMS);for(let l=0;l<a;++l){const o=i.getActiveUniform(t,l),m=i.getUniformLocation(t,o.name);Vc(o,m,this)}}setValue(i,t,a,l){const o=this.map[t];o!==void 0&&o.setValue(i,a,l)}setOptional(i,t,a){const l=t[a];l!==void 0&&this.setValue(i,a,l)}static upload(i,t,a,l){for(let o=0,m=t.length;o!==m;++o){const d=t[o],P=a[d.id];P.needsUpdate!==!1&&d.setValue(i,P.value,l)}}static seqWithValue(i,t){const a=[];for(let l=0,o=i.length;l!==o;++l){const m=i[l];m.id in t&&a.push(m)}return a}}function Xa(e,i,t){const a=e.createShader(i);return e.shaderSource(a,t),e.compileShader(a),a}const zc=37297;let Wc=0;function kc(e,i){const t=e.split(`
`),a=[],l=Math.max(i-6,0),o=Math.min(i+6,t.length);for(let m=l;m<o;m++){const d=m+1;a.push(`${d===i?">":" "} ${d}: ${t[m]}`)}return a.join(`
`)}const Ya=new Ne;function Xc(e){et._getMatrix(Ya,et.workingColorSpace,e);const i=`mat3( ${Ya.elements.map(t=>t.toFixed(4))} )`;switch(et.getTransfer(e)){case vr:return[i,"LinearTransferOETF"];case Ye:return[i,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space: ",e),[i,"LinearTransferOETF"]}}function Ka(e,i,t){const a=e.getShaderParameter(i,e.COMPILE_STATUS),l=(e.getShaderInfoLog(i)||"").trim();if(a&&l==="")return"";const o=/ERROR: 0:(\d+)/.exec(l);if(o){const m=parseInt(o[1]);return t.toUpperCase()+`

`+l+`

`+kc(e.getShaderSource(i),m)}else return l}function Yc(e,i){const t=Xc(i);return[`vec4 ${e}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}function Kc(e,i){let t;switch(i){case kn:t="Linear";break;case Wn:t="Reinhard";break;case zn:t="Cineon";break;case Vn:t="ACESFilmic";break;case Gn:t="AgX";break;case Hn:t="Neutral";break;case Bn:t="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",i),t="Linear"}return"vec3 "+e+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}const ri=new Ve;function qc(){et.getLuminanceCoefficients(ri);const e=ri.x.toFixed(4),i=ri.y.toFixed(4),t=ri.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${e}, ${i}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function jc(e){return[e.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",e.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Yt).join(`
`)}function Zc(e){const i=[];for(const t in e){const a=e[t];a!==!1&&i.push("#define "+t+" "+a)}return i.join(`
`)}function $c(e,i){const t={},a=e.getProgramParameter(i,e.ACTIVE_ATTRIBUTES);for(let l=0;l<a;l++){const o=e.getActiveAttrib(i,l),m=o.name;let d=1;o.type===e.FLOAT_MAT2&&(d=2),o.type===e.FLOAT_MAT3&&(d=3),o.type===e.FLOAT_MAT4&&(d=4),t[m]={type:o.type,location:e.getAttribLocation(i,m),locationSize:d}}return t}function Yt(e){return e!==""}function qa(e,i){const t=i.numSpotLightShadows+i.numSpotLightMaps-i.numSpotLightShadowsWithMaps;return e.replace(/NUM_DIR_LIGHTS/g,i.numDirLights).replace(/NUM_SPOT_LIGHTS/g,i.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,i.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,i.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,i.numPointLights).replace(/NUM_HEMI_LIGHTS/g,i.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,i.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,i.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,i.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,i.numPointLightShadows)}function ja(e,i){return e.replace(/NUM_CLIPPING_PLANES/g,i.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,i.numClippingPlanes-i.numClipIntersection)}const Jc=/^[ \t]*#include +<([\w\d./]+)>/gm;function Gi(e){return e.replace(Jc,ed)}const Qc=new Map;function ed(e,i){let t=Ue[i];if(t===void 0){const a=Qc.get(i);if(a!==void 0)t=Ue[a],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',i,a);else throw new Error("Can not resolve #include <"+i+">")}return Gi(t)}const td=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Za(e){return e.replace(td,id)}function id(e,i,t,a){let l="";for(let o=parseInt(i);o<parseInt(t);o++)l+=a.replace(/\[\s*i\s*\]/g,"[ "+o+" ]").replace(/UNROLLED_LOOP_INDEX/g,o);return l}function $a(e){let i=`precision ${e.precision} float;
	precision ${e.precision} int;
	precision ${e.precision} sampler2D;
	precision ${e.precision} samplerCube;
	precision ${e.precision} sampler3D;
	precision ${e.precision} sampler2DArray;
	precision ${e.precision} sampler2DShadow;
	precision ${e.precision} samplerCubeShadow;
	precision ${e.precision} sampler2DArrayShadow;
	precision ${e.precision} isampler2D;
	precision ${e.precision} isampler3D;
	precision ${e.precision} isamplerCube;
	precision ${e.precision} isampler2DArray;
	precision ${e.precision} usampler2D;
	precision ${e.precision} usampler3D;
	precision ${e.precision} usamplerCube;
	precision ${e.precision} usampler2DArray;
	`;return e.precision==="highp"?i+=`
#define HIGH_PRECISION`:e.precision==="mediump"?i+=`
#define MEDIUM_PRECISION`:e.precision==="lowp"&&(i+=`
#define LOW_PRECISION`),i}function ad(e){let i="SHADOWMAP_TYPE_BASIC";return e.shadowMapType===or?i="SHADOWMAP_TYPE_PCF":e.shadowMapType===Fn?i="SHADOWMAP_TYPE_PCF_SOFT":e.shadowMapType===St&&(i="SHADOWMAP_TYPE_VSM"),i}function rd(e){let i="ENVMAP_TYPE_CUBE";if(e.envMap)switch(e.envMapMode){case Zt:case Vt:i="ENVMAP_TYPE_CUBE";break;case mi:i="ENVMAP_TYPE_CUBE_UV";break}return i}function nd(e){let i="ENVMAP_MODE_REFLECTION";if(e.envMap)switch(e.envMapMode){case Vt:i="ENVMAP_MODE_REFRACTION";break}return i}function od(e){let i="ENVMAP_BLENDING_NONE";if(e.envMap)switch(e.combine){case $n:i="ENVMAP_BLENDING_MULTIPLY";break;case Zn:i="ENVMAP_BLENDING_MIX";break;case jn:i="ENVMAP_BLENDING_ADD";break}return i}function sd(e){const i=e.envMapCubeUVHeight;if(i===null)return null;const t=Math.log2(i)-2,a=1/i;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:a,maxMip:t}}function ld(e,i,t,a){const l=e.getContext(),o=t.defines;let m=t.vertexShader,d=t.fragmentShader;const P=ad(t),v=rd(t),L=nd(t),R=od(t),E=sd(t),T=jc(t),F=Zc(o),U=l.createProgram();let c,r,D=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(c=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,F].filter(Yt).join(`
`),c.length>0&&(c+=`
`),r=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,F].filter(Yt).join(`
`),r.length>0&&(r+=`
`)):(c=[$a(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,F,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+L:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+P:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Yt).join(`
`),r=[$a(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,F,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+v:"",t.envMap?"#define "+L:"",t.envMap?"#define "+R:"",E?"#define CUBEUV_TEXEL_WIDTH "+E.texelWidth:"",E?"#define CUBEUV_TEXEL_HEIGHT "+E.texelHeight:"",E?"#define CUBEUV_MAX_MIP "+E.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor||t.batchingColor?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+P:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==Rt?"#define TONE_MAPPING":"",t.toneMapping!==Rt?Ue.tonemapping_pars_fragment:"",t.toneMapping!==Rt?Kc("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",Ue.colorspace_pars_fragment,Yc("linearToOutputTexel",t.outputColorSpace),qc(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Yt).join(`
`)),m=Gi(m),m=qa(m,t),m=ja(m,t),d=Gi(d),d=qa(d,t),d=ja(d,t),m=Za(m),d=Za(d),t.isRawShaderMaterial!==!0&&(D=`#version 300 es
`,c=[T,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+c,r=["#define varying in",t.glslVersion===Ua?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===Ua?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+r);const C=D+c+m,g=D+r+d,O=Xa(l,l.VERTEX_SHADER,C),b=Xa(l,l.FRAGMENT_SHADER,g);l.attachShader(U,O),l.attachShader(U,b),t.index0AttributeName!==void 0?l.bindAttribLocation(U,0,t.index0AttributeName):t.morphTargets===!0&&l.bindAttribLocation(U,0,"position"),l.linkProgram(U);function w(x){if(e.debug.checkShaderErrors){const N=l.getProgramInfoLog(U)||"",q=l.getShaderInfoLog(O)||"",K=l.getShaderInfoLog(b)||"",Z=N.trim(),k=q.trim(),ie=K.trim();let H=!0,se=!0;if(l.getProgramParameter(U,l.LINK_STATUS)===!1)if(H=!1,typeof e.debug.onShaderError=="function")e.debug.onShaderError(l,U,O,b);else{const Ce=Ka(l,O,"vertex"),Be=Ka(l,b,"fragment");console.error("THREE.WebGLProgram: Shader Error "+l.getError()+" - VALIDATE_STATUS "+l.getProgramParameter(U,l.VALIDATE_STATUS)+`

Material Name: `+x.name+`
Material Type: `+x.type+`

Program Info Log: `+Z+`
`+Ce+`
`+Be)}else Z!==""?console.warn("THREE.WebGLProgram: Program Info Log:",Z):(k===""||ie==="")&&(se=!1);se&&(x.diagnostics={runnable:H,programLog:Z,vertexShader:{log:k,prefix:c},fragmentShader:{log:ie,prefix:r}})}l.deleteShader(O),l.deleteShader(b),V=new li(l,U),p=$c(l,U)}let V;this.getUniforms=function(){return V===void 0&&w(this),V};let p;this.getAttributes=function(){return p===void 0&&w(this),p};let u=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return u===!1&&(u=l.getProgramParameter(U,zc)),u},this.destroy=function(){a.releaseStatesOfProgram(this),l.deleteProgram(U),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=Wc++,this.cacheKey=i,this.usedTimes=1,this.program=U,this.vertexShader=O,this.fragmentShader=b,this}let cd=0;class dd{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(i){const t=i.vertexShader,a=i.fragmentShader,l=this._getShaderStage(t),o=this._getShaderStage(a),m=this._getShaderCacheForMaterial(i);return m.has(l)===!1&&(m.add(l),l.usedTimes++),m.has(o)===!1&&(m.add(o),o.usedTimes++),this}remove(i){const t=this.materialCache.get(i);for(const a of t)a.usedTimes--,a.usedTimes===0&&this.shaderCache.delete(a.code);return this.materialCache.delete(i),this}getVertexShaderID(i){return this._getShaderStage(i.vertexShader).id}getFragmentShaderID(i){return this._getShaderStage(i.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(i){const t=this.materialCache;let a=t.get(i);return a===void 0&&(a=new Set,t.set(i,a)),a}_getShaderStage(i){const t=this.shaderCache;let a=t.get(i);return a===void 0&&(a=new ud(i),t.set(i,a)),a}}class ud{constructor(i){this.id=cd++,this.code=i,this.usedTimes=0}}function fd(e,i,t,a,l,o,m){const d=new On,P=new dd,v=new Set,L=[],R=l.logarithmicDepthBuffer,E=l.vertexTextures;let T=l.precision;const F={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function U(p){return v.add(p),p===0?"uv":`uv${p}`}function c(p,u,x,N,q){const K=N.fog,Z=q.geometry,k=p.isMeshStandardMaterial?N.environment:null,ie=(p.isMeshStandardMaterial?t:i).get(p.envMap||k),H=ie&&ie.mapping===mi?ie.image.height:null,se=F[p.type];p.precision!==null&&(T=l.getMaxPrecision(p.precision),T!==p.precision&&console.warn("THREE.WebGLProgram.getParameters:",p.precision,"not supported, using",T,"instead."));const Ce=Z.morphAttributes.position||Z.morphAttributes.normal||Z.morphAttributes.color,Be=Ce!==void 0?Ce.length:0;let Oe=0;Z.morphAttributes.position!==void 0&&(Oe=1),Z.morphAttributes.normal!==void 0&&(Oe=2),Z.morphAttributes.color!==void 0&&(Oe=3);let Je,$e,Ge,z;if(se){const Fe=gt[se];Je=Fe.vertexShader,$e=Fe.fragmentShader}else Je=p.vertexShader,$e=p.fragmentShader,P.update(p),Ge=P.getVertexShaderID(p),z=P.getFragmentShaderID(p);const Y=e.getRenderTarget(),fe=e.state.buffers.depth.getReversed(),be=q.isInstancedMesh===!0,Ee=q.isBatchedMesh===!0,Me=!!p.map,ke=!!p.matcap,h=!!ie,ye=!!p.aoMap,we=!!p.lightMap,He=!!p.bumpMap,ve=!!p.normalMap,Ke=!!p.displacementMap,pe=!!p.emissiveMap,Le=!!p.metalnessMap,rt=!!p.roughnessMap,Qe=p.anisotropy>0,f=p.clearcoat>0,n=p.dispersion>0,A=p.iridescence>0,B=p.sheen>0,X=p.transmission>0,G=Qe&&!!p.anisotropyMap,Se=f&&!!p.clearcoatMap,ee=f&&!!p.clearcoatNormalMap,ge=f&&!!p.clearcoatRoughnessMap,le=A&&!!p.iridescenceMap,J=A&&!!p.iridescenceThicknessMap,ne=B&&!!p.sheenColorMap,Pe=B&&!!p.sheenRoughnessMap,he=!!p.specularMap,re=!!p.specularColorMap,De=!!p.specularIntensityMap,_=X&&!!p.transmissionMap,Q=X&&!!p.thicknessMap,te=!!p.gradientMap,me=!!p.alphaMap,$=p.alphaTest>0,W=!!p.alphaHash,ue=!!p.extensions;let Te=Rt;p.toneMapped&&(Y===null||Y.isXRRenderTarget===!0)&&(Te=e.toneMapping);const tt={shaderID:se,shaderType:p.type,shaderName:p.name,vertexShader:Je,fragmentShader:$e,defines:p.defines,customVertexShaderID:Ge,customFragmentShaderID:z,isRawShaderMaterial:p.isRawShaderMaterial===!0,glslVersion:p.glslVersion,precision:T,batching:Ee,batchingColor:Ee&&q._colorsTexture!==null,instancing:be,instancingColor:be&&q.instanceColor!==null,instancingMorph:be&&q.morphTexture!==null,supportsVertexTextures:E,outputColorSpace:Y===null?e.outputColorSpace:Y.isXRRenderTarget===!0?Y.texture.colorSpace:pi,alphaToCoverage:!!p.alphaToCoverage,map:Me,matcap:ke,envMap:h,envMapMode:h&&ie.mapping,envMapCubeUVHeight:H,aoMap:ye,lightMap:we,bumpMap:He,normalMap:ve,displacementMap:E&&Ke,emissiveMap:pe,normalMapObjectSpace:ve&&p.normalMapType===wn,normalMapTangentSpace:ve&&p.normalMapType===Dn,metalnessMap:Le,roughnessMap:rt,anisotropy:Qe,anisotropyMap:G,clearcoat:f,clearcoatMap:Se,clearcoatNormalMap:ee,clearcoatRoughnessMap:ge,dispersion:n,iridescence:A,iridescenceMap:le,iridescenceThicknessMap:J,sheen:B,sheenColorMap:ne,sheenRoughnessMap:Pe,specularMap:he,specularColorMap:re,specularIntensityMap:De,transmission:X,transmissionMap:_,thicknessMap:Q,gradientMap:te,opaque:p.transparent===!1&&p.blending===si&&p.alphaToCoverage===!1,alphaMap:me,alphaTest:$,alphaHash:W,combine:p.combine,mapUv:Me&&U(p.map.channel),aoMapUv:ye&&U(p.aoMap.channel),lightMapUv:we&&U(p.lightMap.channel),bumpMapUv:He&&U(p.bumpMap.channel),normalMapUv:ve&&U(p.normalMap.channel),displacementMapUv:Ke&&U(p.displacementMap.channel),emissiveMapUv:pe&&U(p.emissiveMap.channel),metalnessMapUv:Le&&U(p.metalnessMap.channel),roughnessMapUv:rt&&U(p.roughnessMap.channel),anisotropyMapUv:G&&U(p.anisotropyMap.channel),clearcoatMapUv:Se&&U(p.clearcoatMap.channel),clearcoatNormalMapUv:ee&&U(p.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:ge&&U(p.clearcoatRoughnessMap.channel),iridescenceMapUv:le&&U(p.iridescenceMap.channel),iridescenceThicknessMapUv:J&&U(p.iridescenceThicknessMap.channel),sheenColorMapUv:ne&&U(p.sheenColorMap.channel),sheenRoughnessMapUv:Pe&&U(p.sheenRoughnessMap.channel),specularMapUv:he&&U(p.specularMap.channel),specularColorMapUv:re&&U(p.specularColorMap.channel),specularIntensityMapUv:De&&U(p.specularIntensityMap.channel),transmissionMapUv:_&&U(p.transmissionMap.channel),thicknessMapUv:Q&&U(p.thicknessMap.channel),alphaMapUv:me&&U(p.alphaMap.channel),vertexTangents:!!Z.attributes.tangent&&(ve||Qe),vertexColors:p.vertexColors,vertexAlphas:p.vertexColors===!0&&!!Z.attributes.color&&Z.attributes.color.itemSize===4,pointsUvs:q.isPoints===!0&&!!Z.attributes.uv&&(Me||me),fog:!!K,useFog:p.fog===!0,fogExp2:!!K&&K.isFogExp2,flatShading:p.flatShading===!0&&p.wireframe===!1,sizeAttenuation:p.sizeAttenuation===!0,logarithmicDepthBuffer:R,reversedDepthBuffer:fe,skinning:q.isSkinnedMesh===!0,morphTargets:Z.morphAttributes.position!==void 0,morphNormals:Z.morphAttributes.normal!==void 0,morphColors:Z.morphAttributes.color!==void 0,morphTargetsCount:Be,morphTextureStride:Oe,numDirLights:u.directional.length,numPointLights:u.point.length,numSpotLights:u.spot.length,numSpotLightMaps:u.spotLightMap.length,numRectAreaLights:u.rectArea.length,numHemiLights:u.hemi.length,numDirLightShadows:u.directionalShadowMap.length,numPointLightShadows:u.pointShadowMap.length,numSpotLightShadows:u.spotShadowMap.length,numSpotLightShadowsWithMaps:u.numSpotLightShadowsWithMaps,numLightProbes:u.numLightProbes,numClippingPlanes:m.numPlanes,numClipIntersection:m.numIntersection,dithering:p.dithering,shadowMapEnabled:e.shadowMap.enabled&&x.length>0,shadowMapType:e.shadowMap.type,toneMapping:Te,decodeVideoTexture:Me&&p.map.isVideoTexture===!0&&et.getTransfer(p.map.colorSpace)===Ye,decodeVideoTextureEmissive:pe&&p.emissiveMap.isVideoTexture===!0&&et.getTransfer(p.emissiveMap.colorSpace)===Ye,premultipliedAlpha:p.premultipliedAlpha,doubleSided:p.side===Mt,flipSided:p.side===pt,useDepthPacking:p.depthPacking>=0,depthPacking:p.depthPacking||0,index0AttributeName:p.index0AttributeName,extensionClipCullDistance:ue&&p.extensions.clipCullDistance===!0&&a.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(ue&&p.extensions.multiDraw===!0||Ee)&&a.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:a.has("KHR_parallel_shader_compile"),customProgramCacheKey:p.customProgramCacheKey()};return tt.vertexUv1s=v.has(1),tt.vertexUv2s=v.has(2),tt.vertexUv3s=v.has(3),v.clear(),tt}function r(p){const u=[];if(p.shaderID?u.push(p.shaderID):(u.push(p.customVertexShaderID),u.push(p.customFragmentShaderID)),p.defines!==void 0)for(const x in p.defines)u.push(x),u.push(p.defines[x]);return p.isRawShaderMaterial===!1&&(D(u,p),C(u,p),u.push(e.outputColorSpace)),u.push(p.customProgramCacheKey),u.join()}function D(p,u){p.push(u.precision),p.push(u.outputColorSpace),p.push(u.envMapMode),p.push(u.envMapCubeUVHeight),p.push(u.mapUv),p.push(u.alphaMapUv),p.push(u.lightMapUv),p.push(u.aoMapUv),p.push(u.bumpMapUv),p.push(u.normalMapUv),p.push(u.displacementMapUv),p.push(u.emissiveMapUv),p.push(u.metalnessMapUv),p.push(u.roughnessMapUv),p.push(u.anisotropyMapUv),p.push(u.clearcoatMapUv),p.push(u.clearcoatNormalMapUv),p.push(u.clearcoatRoughnessMapUv),p.push(u.iridescenceMapUv),p.push(u.iridescenceThicknessMapUv),p.push(u.sheenColorMapUv),p.push(u.sheenRoughnessMapUv),p.push(u.specularMapUv),p.push(u.specularColorMapUv),p.push(u.specularIntensityMapUv),p.push(u.transmissionMapUv),p.push(u.thicknessMapUv),p.push(u.combine),p.push(u.fogExp2),p.push(u.sizeAttenuation),p.push(u.morphTargetsCount),p.push(u.morphAttributeCount),p.push(u.numDirLights),p.push(u.numPointLights),p.push(u.numSpotLights),p.push(u.numSpotLightMaps),p.push(u.numHemiLights),p.push(u.numRectAreaLights),p.push(u.numDirLightShadows),p.push(u.numPointLightShadows),p.push(u.numSpotLightShadows),p.push(u.numSpotLightShadowsWithMaps),p.push(u.numLightProbes),p.push(u.shadowMapType),p.push(u.toneMapping),p.push(u.numClippingPlanes),p.push(u.numClipIntersection),p.push(u.depthPacking)}function C(p,u){d.disableAll(),u.supportsVertexTextures&&d.enable(0),u.instancing&&d.enable(1),u.instancingColor&&d.enable(2),u.instancingMorph&&d.enable(3),u.matcap&&d.enable(4),u.envMap&&d.enable(5),u.normalMapObjectSpace&&d.enable(6),u.normalMapTangentSpace&&d.enable(7),u.clearcoat&&d.enable(8),u.iridescence&&d.enable(9),u.alphaTest&&d.enable(10),u.vertexColors&&d.enable(11),u.vertexAlphas&&d.enable(12),u.vertexUv1s&&d.enable(13),u.vertexUv2s&&d.enable(14),u.vertexUv3s&&d.enable(15),u.vertexTangents&&d.enable(16),u.anisotropy&&d.enable(17),u.alphaHash&&d.enable(18),u.batching&&d.enable(19),u.dispersion&&d.enable(20),u.batchingColor&&d.enable(21),u.gradientMap&&d.enable(22),p.push(d.mask),d.disableAll(),u.fog&&d.enable(0),u.useFog&&d.enable(1),u.flatShading&&d.enable(2),u.logarithmicDepthBuffer&&d.enable(3),u.reversedDepthBuffer&&d.enable(4),u.skinning&&d.enable(5),u.morphTargets&&d.enable(6),u.morphNormals&&d.enable(7),u.morphColors&&d.enable(8),u.premultipliedAlpha&&d.enable(9),u.shadowMapEnabled&&d.enable(10),u.doubleSided&&d.enable(11),u.flipSided&&d.enable(12),u.useDepthPacking&&d.enable(13),u.dithering&&d.enable(14),u.transmission&&d.enable(15),u.sheen&&d.enable(16),u.opaque&&d.enable(17),u.pointsUvs&&d.enable(18),u.decodeVideoTexture&&d.enable(19),u.decodeVideoTextureEmissive&&d.enable(20),u.alphaToCoverage&&d.enable(21),p.push(d.mask)}function g(p){const u=F[p.type];let x;if(u){const N=gt[u];x=Un.clone(N.uniforms)}else x=p.uniforms;return x}function O(p,u){let x;for(let N=0,q=L.length;N<q;N++){const K=L[N];if(K.cacheKey===u){x=K,++x.usedTimes;break}}return x===void 0&&(x=new ld(e,u,p,o),L.push(x)),x}function b(p){if(--p.usedTimes===0){const u=L.indexOf(p);L[u]=L[L.length-1],L.pop(),p.destroy()}}function w(p){P.remove(p)}function V(){P.dispose()}return{getParameters:c,getProgramCacheKey:r,getUniforms:g,acquireProgram:O,releaseProgram:b,releaseShaderCache:w,programs:L,dispose:V}}function pd(){let e=new WeakMap;function i(m){return e.has(m)}function t(m){let d=e.get(m);return d===void 0&&(d={},e.set(m,d)),d}function a(m){e.delete(m)}function l(m,d,P){e.get(m)[d]=P}function o(){e=new WeakMap}return{has:i,get:t,remove:a,update:l,dispose:o}}function md(e,i){return e.groupOrder!==i.groupOrder?e.groupOrder-i.groupOrder:e.renderOrder!==i.renderOrder?e.renderOrder-i.renderOrder:e.material.id!==i.material.id?e.material.id-i.material.id:e.z!==i.z?e.z-i.z:e.id-i.id}function Ja(e,i){return e.groupOrder!==i.groupOrder?e.groupOrder-i.groupOrder:e.renderOrder!==i.renderOrder?e.renderOrder-i.renderOrder:e.z!==i.z?i.z-e.z:e.id-i.id}function Qa(){const e=[];let i=0;const t=[],a=[],l=[];function o(){i=0,t.length=0,a.length=0,l.length=0}function m(R,E,T,F,U,c){let r=e[i];return r===void 0?(r={id:R.id,object:R,geometry:E,material:T,groupOrder:F,renderOrder:R.renderOrder,z:U,group:c},e[i]=r):(r.id=R.id,r.object=R,r.geometry=E,r.material=T,r.groupOrder=F,r.renderOrder=R.renderOrder,r.z=U,r.group=c),i++,r}function d(R,E,T,F,U,c){const r=m(R,E,T,F,U,c);T.transmission>0?a.push(r):T.transparent===!0?l.push(r):t.push(r)}function P(R,E,T,F,U,c){const r=m(R,E,T,F,U,c);T.transmission>0?a.unshift(r):T.transparent===!0?l.unshift(r):t.unshift(r)}function v(R,E){t.length>1&&t.sort(R||md),a.length>1&&a.sort(E||Ja),l.length>1&&l.sort(E||Ja)}function L(){for(let R=i,E=e.length;R<E;R++){const T=e[R];if(T.id===null)break;T.id=null,T.object=null,T.geometry=null,T.material=null,T.group=null}}return{opaque:t,transmissive:a,transparent:l,init:o,push:d,unshift:P,finish:L,sort:v}}function hd(){let e=new WeakMap;function i(a,l){const o=e.get(a);let m;return o===void 0?(m=new Qa,e.set(a,[m])):l>=o.length?(m=new Qa,o.push(m)):m=o[l],m}function t(){e=new WeakMap}return{get:i,dispose:t}}function _d(){const e={};return{get:function(i){if(e[i.id]!==void 0)return e[i.id];let t;switch(i.type){case"DirectionalLight":t={direction:new Ve,color:new qe};break;case"SpotLight":t={position:new Ve,direction:new Ve,color:new qe,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new Ve,color:new qe,distance:0,decay:0};break;case"HemisphereLight":t={direction:new Ve,skyColor:new qe,groundColor:new qe};break;case"RectAreaLight":t={color:new qe,position:new Ve,halfWidth:new Ve,halfHeight:new Ve};break}return e[i.id]=t,t}}}function gd(){const e={};return{get:function(i){if(e[i.id]!==void 0)return e[i.id];let t;switch(i.type){case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ct};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ct};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ct,shadowCameraNear:1,shadowCameraFar:1e3};break}return e[i.id]=t,t}}}let vd=0;function Ed(e,i){return(i.castShadow?2:0)-(e.castShadow?2:0)+(i.map?1:0)-(e.map?1:0)}function Sd(e){const i=new _d,t=gd(),a={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let v=0;v<9;v++)a.probe.push(new Ve);const l=new Ve,o=new qt,m=new qt;function d(v){let L=0,R=0,E=0;for(let p=0;p<9;p++)a.probe[p].set(0,0,0);let T=0,F=0,U=0,c=0,r=0,D=0,C=0,g=0,O=0,b=0,w=0;v.sort(Ed);for(let p=0,u=v.length;p<u;p++){const x=v[p],N=x.color,q=x.intensity,K=x.distance,Z=x.shadow&&x.shadow.map?x.shadow.map.texture:null;if(x.isAmbientLight)L+=N.r*q,R+=N.g*q,E+=N.b*q;else if(x.isLightProbe){for(let k=0;k<9;k++)a.probe[k].addScaledVector(x.sh.coefficients[k],q);w++}else if(x.isDirectionalLight){const k=i.get(x);if(k.color.copy(x.color).multiplyScalar(x.intensity),x.castShadow){const ie=x.shadow,H=t.get(x);H.shadowIntensity=ie.intensity,H.shadowBias=ie.bias,H.shadowNormalBias=ie.normalBias,H.shadowRadius=ie.radius,H.shadowMapSize=ie.mapSize,a.directionalShadow[T]=H,a.directionalShadowMap[T]=Z,a.directionalShadowMatrix[T]=x.shadow.matrix,D++}a.directional[T]=k,T++}else if(x.isSpotLight){const k=i.get(x);k.position.setFromMatrixPosition(x.matrixWorld),k.color.copy(N).multiplyScalar(q),k.distance=K,k.coneCos=Math.cos(x.angle),k.penumbraCos=Math.cos(x.angle*(1-x.penumbra)),k.decay=x.decay,a.spot[U]=k;const ie=x.shadow;if(x.map&&(a.spotLightMap[O]=x.map,O++,ie.updateMatrices(x),x.castShadow&&b++),a.spotLightMatrix[U]=ie.matrix,x.castShadow){const H=t.get(x);H.shadowIntensity=ie.intensity,H.shadowBias=ie.bias,H.shadowNormalBias=ie.normalBias,H.shadowRadius=ie.radius,H.shadowMapSize=ie.mapSize,a.spotShadow[U]=H,a.spotShadowMap[U]=Z,g++}U++}else if(x.isRectAreaLight){const k=i.get(x);k.color.copy(N).multiplyScalar(q),k.halfWidth.set(x.width*.5,0,0),k.halfHeight.set(0,x.height*.5,0),a.rectArea[c]=k,c++}else if(x.isPointLight){const k=i.get(x);if(k.color.copy(x.color).multiplyScalar(x.intensity),k.distance=x.distance,k.decay=x.decay,x.castShadow){const ie=x.shadow,H=t.get(x);H.shadowIntensity=ie.intensity,H.shadowBias=ie.bias,H.shadowNormalBias=ie.normalBias,H.shadowRadius=ie.radius,H.shadowMapSize=ie.mapSize,H.shadowCameraNear=ie.camera.near,H.shadowCameraFar=ie.camera.far,a.pointShadow[F]=H,a.pointShadowMap[F]=Z,a.pointShadowMatrix[F]=x.shadow.matrix,C++}a.point[F]=k,F++}else if(x.isHemisphereLight){const k=i.get(x);k.skyColor.copy(x.color).multiplyScalar(q),k.groundColor.copy(x.groundColor).multiplyScalar(q),a.hemi[r]=k,r++}}c>0&&(e.has("OES_texture_float_linear")===!0?(a.rectAreaLTC1=ae.LTC_FLOAT_1,a.rectAreaLTC2=ae.LTC_FLOAT_2):(a.rectAreaLTC1=ae.LTC_HALF_1,a.rectAreaLTC2=ae.LTC_HALF_2)),a.ambient[0]=L,a.ambient[1]=R,a.ambient[2]=E;const V=a.hash;(V.directionalLength!==T||V.pointLength!==F||V.spotLength!==U||V.rectAreaLength!==c||V.hemiLength!==r||V.numDirectionalShadows!==D||V.numPointShadows!==C||V.numSpotShadows!==g||V.numSpotMaps!==O||V.numLightProbes!==w)&&(a.directional.length=T,a.spot.length=U,a.rectArea.length=c,a.point.length=F,a.hemi.length=r,a.directionalShadow.length=D,a.directionalShadowMap.length=D,a.pointShadow.length=C,a.pointShadowMap.length=C,a.spotShadow.length=g,a.spotShadowMap.length=g,a.directionalShadowMatrix.length=D,a.pointShadowMatrix.length=C,a.spotLightMatrix.length=g+O-b,a.spotLightMap.length=O,a.numSpotLightShadowsWithMaps=b,a.numLightProbes=w,V.directionalLength=T,V.pointLength=F,V.spotLength=U,V.rectAreaLength=c,V.hemiLength=r,V.numDirectionalShadows=D,V.numPointShadows=C,V.numSpotShadows=g,V.numSpotMaps=O,V.numLightProbes=w,a.version=vd++)}function P(v,L){let R=0,E=0,T=0,F=0,U=0;const c=L.matrixWorldInverse;for(let r=0,D=v.length;r<D;r++){const C=v[r];if(C.isDirectionalLight){const g=a.directional[R];g.direction.setFromMatrixPosition(C.matrixWorld),l.setFromMatrixPosition(C.target.matrixWorld),g.direction.sub(l),g.direction.transformDirection(c),R++}else if(C.isSpotLight){const g=a.spot[T];g.position.setFromMatrixPosition(C.matrixWorld),g.position.applyMatrix4(c),g.direction.setFromMatrixPosition(C.matrixWorld),l.setFromMatrixPosition(C.target.matrixWorld),g.direction.sub(l),g.direction.transformDirection(c),T++}else if(C.isRectAreaLight){const g=a.rectArea[F];g.position.setFromMatrixPosition(C.matrixWorld),g.position.applyMatrix4(c),m.identity(),o.copy(C.matrixWorld),o.premultiply(c),m.extractRotation(o),g.halfWidth.set(C.width*.5,0,0),g.halfHeight.set(0,C.height*.5,0),g.halfWidth.applyMatrix4(m),g.halfHeight.applyMatrix4(m),F++}else if(C.isPointLight){const g=a.point[E];g.position.setFromMatrixPosition(C.matrixWorld),g.position.applyMatrix4(c),E++}else if(C.isHemisphereLight){const g=a.hemi[U];g.direction.setFromMatrixPosition(C.matrixWorld),g.direction.transformDirection(c),U++}}}return{setup:d,setupView:P,state:a}}function er(e){const i=new Sd(e),t=[],a=[];function l(L){v.camera=L,t.length=0,a.length=0}function o(L){t.push(L)}function m(L){a.push(L)}function d(){i.setup(t)}function P(L){i.setupView(t,L)}const v={lightsArray:t,shadowsArray:a,camera:null,lights:i,transmissionRenderTarget:{}};return{init:l,state:v,setupLights:d,setupLightsView:P,pushLight:o,pushShadow:m}}function Md(e){let i=new WeakMap;function t(l,o=0){const m=i.get(l);let d;return m===void 0?(d=new er(e),i.set(l,[d])):o>=m.length?(d=new er(e),m.push(d)):d=m[o],d}function a(){i=new WeakMap}return{get:t,dispose:a}}const Td=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,xd=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;function Rd(e,i,t){let a=new tr;const l=new ct,o=new ct,m=new lt,d=new hn({depthPacking:_n}),P=new gn,v={},L=t.maxTextureSize,R={[jt]:pt,[pt]:jt,[Mt]:Mt},E=new It({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new ct},radius:{value:4}},vertexShader:Td,fragmentShader:xd}),T=E.clone();T.defines.HORIZONTAL_PASS=1;const F=new rr;F.setAttribute("position",new oi(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const U=new xt(F,E),c=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=or;let r=this.type;this.render=function(b,w,V){if(c.enabled===!1||c.autoUpdate===!1&&c.needsUpdate===!1||b.length===0)return;const p=e.getRenderTarget(),u=e.getActiveCubeFace(),x=e.getActiveMipmapLevel(),N=e.state;N.setBlending(wt),N.buffers.depth.getReversed()===!0?N.buffers.color.setClear(0,0,0,0):N.buffers.color.setClear(1,1,1,1),N.buffers.depth.setTest(!0),N.setScissorTest(!1);const q=r!==St&&this.type===St,K=r===St&&this.type!==St;for(let Z=0,k=b.length;Z<k;Z++){const ie=b[Z],H=ie.shadow;if(H===void 0){console.warn("THREE.WebGLShadowMap:",ie,"has no shadow.");continue}if(H.autoUpdate===!1&&H.needsUpdate===!1)continue;l.copy(H.mapSize);const se=H.getFrameExtents();if(l.multiply(se),o.copy(H.mapSize),(l.x>L||l.y>L)&&(l.x>L&&(o.x=Math.floor(L/se.x),l.x=o.x*se.x,H.mapSize.x=o.x),l.y>L&&(o.y=Math.floor(L/se.y),l.y=o.y*se.y,H.mapSize.y=o.y)),H.map===null||q===!0||K===!0){const Be=this.type!==St?{minFilter:Kt,magFilter:Kt}:{};H.map!==null&&H.map.dispose(),H.map=new Gt(l.x,l.y,Be),H.map.texture.name=ie.name+".shadowMap",H.camera.updateProjectionMatrix()}e.setRenderTarget(H.map),e.clear();const Ce=H.getViewportCount();for(let Be=0;Be<Ce;Be++){const Oe=H.getViewport(Be);m.set(o.x*Oe.x,o.y*Oe.y,o.x*Oe.z,o.y*Oe.w),N.viewport(m),H.updateMatrices(ie,Be),a=H.getFrustum(),g(w,V,H.camera,ie,this.type)}H.isPointLightShadow!==!0&&this.type===St&&D(H,V),H.needsUpdate=!1}r=this.type,c.needsUpdate=!1,e.setRenderTarget(p,u,x)};function D(b,w){const V=i.update(U);E.defines.VSM_SAMPLES!==b.blurSamples&&(E.defines.VSM_SAMPLES=b.blurSamples,T.defines.VSM_SAMPLES=b.blurSamples,E.needsUpdate=!0,T.needsUpdate=!0),b.mapPass===null&&(b.mapPass=new Gt(l.x,l.y)),E.uniforms.shadow_pass.value=b.map.texture,E.uniforms.resolution.value=b.mapSize,E.uniforms.radius.value=b.radius,e.setRenderTarget(b.mapPass),e.clear(),e.renderBufferDirect(w,null,V,E,U,null),T.uniforms.shadow_pass.value=b.mapPass.texture,T.uniforms.resolution.value=b.mapSize,T.uniforms.radius.value=b.radius,e.setRenderTarget(b.map),e.clear(),e.renderBufferDirect(w,null,V,T,U,null)}function C(b,w,V,p){let u=null;const x=V.isPointLight===!0?b.customDistanceMaterial:b.customDepthMaterial;if(x!==void 0)u=x;else if(u=V.isPointLight===!0?P:d,e.localClippingEnabled&&w.clipShadows===!0&&Array.isArray(w.clippingPlanes)&&w.clippingPlanes.length!==0||w.displacementMap&&w.displacementScale!==0||w.alphaMap&&w.alphaTest>0||w.map&&w.alphaTest>0||w.alphaToCoverage===!0){const N=u.uuid,q=w.uuid;let K=v[N];K===void 0&&(K={},v[N]=K);let Z=K[q];Z===void 0&&(Z=u.clone(),K[q]=Z,w.addEventListener("dispose",O)),u=Z}if(u.visible=w.visible,u.wireframe=w.wireframe,p===St?u.side=w.shadowSide!==null?w.shadowSide:w.side:u.side=w.shadowSide!==null?w.shadowSide:R[w.side],u.alphaMap=w.alphaMap,u.alphaTest=w.alphaToCoverage===!0?.5:w.alphaTest,u.map=w.map,u.clipShadows=w.clipShadows,u.clippingPlanes=w.clippingPlanes,u.clipIntersection=w.clipIntersection,u.displacementMap=w.displacementMap,u.displacementScale=w.displacementScale,u.displacementBias=w.displacementBias,u.wireframeLinewidth=w.wireframeLinewidth,u.linewidth=w.linewidth,V.isPointLight===!0&&u.isMeshDistanceMaterial===!0){const N=e.properties.get(u);N.light=V}return u}function g(b,w,V,p,u){if(b.visible===!1)return;if(b.layers.test(w.layers)&&(b.isMesh||b.isLine||b.isPoints)&&(b.castShadow||b.receiveShadow&&u===St)&&(!b.frustumCulled||a.intersectsObject(b))){b.modelViewMatrix.multiplyMatrices(V.matrixWorldInverse,b.matrixWorld);const N=i.update(b),q=b.material;if(Array.isArray(q)){const K=N.groups;for(let Z=0,k=K.length;Z<k;Z++){const ie=K[Z],H=q[ie.materialIndex];if(H&&H.visible){const se=C(b,H,p,u);b.onBeforeShadow(e,b,w,V,N,se,ie),e.renderBufferDirect(V,null,N,se,b,ie),b.onAfterShadow(e,b,w,V,N,se,ie)}}}else if(q.visible){const K=C(b,q,p,u);b.onBeforeShadow(e,b,w,V,N,K,null),e.renderBufferDirect(V,null,N,K,b,null),b.onAfterShadow(e,b,w,V,N,K,null)}}const x=b.children;for(let N=0,q=x.length;N<q;N++)g(x[N],w,V,p,u)}function O(b){b.target.removeEventListener("dispose",O);for(const w in v){const V=v[w],p=b.target.uuid;p in V&&(V[p].dispose(),delete V[p])}}}const Ad={[Fi]:Oi,[Ni]:wi,[Ii]:Di,[di]:yi,[Oi]:Fi,[wi]:Ni,[Di]:Ii,[yi]:di};function bd(e,i){function t(){let _=!1;const Q=new lt;let te=null;const me=new lt(0,0,0,0);return{setMask:function($){te!==$&&!_&&(e.colorMask($,$,$,$),te=$)},setLocked:function($){_=$},setClear:function($,W,ue,Te,tt){tt===!0&&($*=Te,W*=Te,ue*=Te),Q.set($,W,ue,Te),me.equals(Q)===!1&&(e.clearColor($,W,ue,Te),me.copy(Q))},reset:function(){_=!1,te=null,me.set(-1,0,0,0)}}}function a(){let _=!1,Q=!1,te=null,me=null,$=null;return{setReversed:function(W){if(Q!==W){const ue=i.get("EXT_clip_control");W?ue.clipControlEXT(ue.LOWER_LEFT_EXT,ue.ZERO_TO_ONE_EXT):ue.clipControlEXT(ue.LOWER_LEFT_EXT,ue.NEGATIVE_ONE_TO_ONE_EXT),Q=W;const Te=$;$=null,this.setClear(Te)}},getReversed:function(){return Q},setTest:function(W){W?Y(e.DEPTH_TEST):fe(e.DEPTH_TEST)},setMask:function(W){te!==W&&!_&&(e.depthMask(W),te=W)},setFunc:function(W){if(Q&&(W=Ad[W]),me!==W){switch(W){case Fi:e.depthFunc(e.NEVER);break;case Oi:e.depthFunc(e.ALWAYS);break;case Ni:e.depthFunc(e.LESS);break;case di:e.depthFunc(e.LEQUAL);break;case Ii:e.depthFunc(e.EQUAL);break;case yi:e.depthFunc(e.GEQUAL);break;case wi:e.depthFunc(e.GREATER);break;case Di:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}me=W}},setLocked:function(W){_=W},setClear:function(W){$!==W&&(Q&&(W=1-W),e.clearDepth(W),$=W)},reset:function(){_=!1,te=null,me=null,$=null,Q=!1}}}function l(){let _=!1,Q=null,te=null,me=null,$=null,W=null,ue=null,Te=null,tt=null;return{setTest:function(Fe){_||(Fe?Y(e.STENCIL_TEST):fe(e.STENCIL_TEST))},setMask:function(Fe){Q!==Fe&&!_&&(e.stencilMask(Fe),Q=Fe)},setFunc:function(Fe,vt,_t){(te!==Fe||me!==vt||$!==_t)&&(e.stencilFunc(Fe,vt,_t),te=Fe,me=vt,$=_t)},setOp:function(Fe,vt,_t){(W!==Fe||ue!==vt||Te!==_t)&&(e.stencilOp(Fe,vt,_t),W=Fe,ue=vt,Te=_t)},setLocked:function(Fe){_=Fe},setClear:function(Fe){tt!==Fe&&(e.clearStencil(Fe),tt=Fe)},reset:function(){_=!1,Q=null,te=null,me=null,$=null,W=null,ue=null,Te=null,tt=null}}}const o=new t,m=new a,d=new l,P=new WeakMap,v=new WeakMap;let L={},R={},E=new WeakMap,T=[],F=null,U=!1,c=null,r=null,D=null,C=null,g=null,O=null,b=null,w=new qe(0,0,0),V=0,p=!1,u=null,x=null,N=null,q=null,K=null;const Z=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let k=!1,ie=0;const H=e.getParameter(e.VERSION);H.indexOf("WebGL")!==-1?(ie=parseFloat(/^WebGL (\d)/.exec(H)[1]),k=ie>=1):H.indexOf("OpenGL ES")!==-1&&(ie=parseFloat(/^OpenGL ES (\d)/.exec(H)[1]),k=ie>=2);let se=null,Ce={};const Be=e.getParameter(e.SCISSOR_BOX),Oe=e.getParameter(e.VIEWPORT),Je=new lt().fromArray(Be),$e=new lt().fromArray(Oe);function Ge(_,Q,te,me){const $=new Uint8Array(4),W=e.createTexture();e.bindTexture(_,W),e.texParameteri(_,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(_,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let ue=0;ue<te;ue++)_===e.TEXTURE_3D||_===e.TEXTURE_2D_ARRAY?e.texImage3D(Q,0,e.RGBA,1,1,me,0,e.RGBA,e.UNSIGNED_BYTE,$):e.texImage2D(Q+ue,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,$);return W}const z={};z[e.TEXTURE_2D]=Ge(e.TEXTURE_2D,e.TEXTURE_2D,1),z[e.TEXTURE_CUBE_MAP]=Ge(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),z[e.TEXTURE_2D_ARRAY]=Ge(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),z[e.TEXTURE_3D]=Ge(e.TEXTURE_3D,e.TEXTURE_3D,1,1),o.setClear(0,0,0,1),m.setClear(1),d.setClear(0),Y(e.DEPTH_TEST),m.setFunc(di),He(!1),ve(Ra),Y(e.CULL_FACE),ye(wt);function Y(_){L[_]!==!0&&(e.enable(_),L[_]=!0)}function fe(_){L[_]!==!1&&(e.disable(_),L[_]=!1)}function be(_,Q){return R[_]!==Q?(e.bindFramebuffer(_,Q),R[_]=Q,_===e.DRAW_FRAMEBUFFER&&(R[e.FRAMEBUFFER]=Q),_===e.FRAMEBUFFER&&(R[e.DRAW_FRAMEBUFFER]=Q),!0):!1}function Ee(_,Q){let te=T,me=!1;if(_){te=E.get(Q),te===void 0&&(te=[],E.set(Q,te));const $=_.textures;if(te.length!==$.length||te[0]!==e.COLOR_ATTACHMENT0){for(let W=0,ue=$.length;W<ue;W++)te[W]=e.COLOR_ATTACHMENT0+W;te.length=$.length,me=!0}}else te[0]!==e.BACK&&(te[0]=e.BACK,me=!0);me&&e.drawBuffers(te)}function Me(_){return F!==_?(e.useProgram(_),F=_,!0):!1}const ke={[kt]:e.FUNC_ADD,[Gr]:e.FUNC_SUBTRACT,[Hr]:e.FUNC_REVERSE_SUBTRACT};ke[Jn]=e.MIN,ke[Qn]=e.MAX;const h={[tn]:e.ZERO,[en]:e.ONE,[Qr]:e.SRC_COLOR,[Jr]:e.SRC_ALPHA,[$r]:e.SRC_ALPHA_SATURATE,[Zr]:e.DST_COLOR,[jr]:e.DST_ALPHA,[qr]:e.ONE_MINUS_SRC_COLOR,[Kr]:e.ONE_MINUS_SRC_ALPHA,[Yr]:e.ONE_MINUS_DST_COLOR,[Xr]:e.ONE_MINUS_DST_ALPHA,[kr]:e.CONSTANT_COLOR,[Wr]:e.ONE_MINUS_CONSTANT_COLOR,[zr]:e.CONSTANT_ALPHA,[Vr]:e.ONE_MINUS_CONSTANT_ALPHA};function ye(_,Q,te,me,$,W,ue,Te,tt,Fe){if(_===wt){U===!0&&(fe(e.BLEND),U=!1);return}if(U===!1&&(Y(e.BLEND),U=!0),_!==Pn){if(_!==c||Fe!==p){if((r!==kt||g!==kt)&&(e.blendEquation(e.FUNC_ADD),r=kt,g=kt),Fe)switch(_){case si:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case Ca:e.blendFunc(e.ONE,e.ONE);break;case ba:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case Aa:e.blendFuncSeparate(e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE);break;default:console.error("THREE.WebGLState: Invalid blending: ",_);break}else switch(_){case si:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case Ca:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE,e.ONE,e.ONE);break;case ba:console.error("THREE.WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Aa:console.error("THREE.WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:console.error("THREE.WebGLState: Invalid blending: ",_);break}D=null,C=null,O=null,b=null,w.set(0,0,0),V=0,c=_,p=Fe}return}$=$||Q,W=W||te,ue=ue||me,(Q!==r||$!==g)&&(e.blendEquationSeparate(ke[Q],ke[$]),r=Q,g=$),(te!==D||me!==C||W!==O||ue!==b)&&(e.blendFuncSeparate(h[te],h[me],h[W],h[ue]),D=te,C=me,O=W,b=ue),(Te.equals(w)===!1||tt!==V)&&(e.blendColor(Te.r,Te.g,Te.b,tt),w.copy(Te),V=tt),c=_,p=!1}function we(_,Q){_.side===Mt?fe(e.CULL_FACE):Y(e.CULL_FACE);let te=_.side===pt;Q&&(te=!te),He(te),_.blending===si&&_.transparent===!1?ye(wt):ye(_.blending,_.blendEquation,_.blendSrc,_.blendDst,_.blendEquationAlpha,_.blendSrcAlpha,_.blendDstAlpha,_.blendColor,_.blendAlpha,_.premultipliedAlpha),m.setFunc(_.depthFunc),m.setTest(_.depthTest),m.setMask(_.depthWrite),o.setMask(_.colorWrite);const me=_.stencilWrite;d.setTest(me),me&&(d.setMask(_.stencilWriteMask),d.setFunc(_.stencilFunc,_.stencilRef,_.stencilFuncMask),d.setOp(_.stencilFail,_.stencilZFail,_.stencilZPass)),pe(_.polygonOffset,_.polygonOffsetFactor,_.polygonOffsetUnits),_.alphaToCoverage===!0?Y(e.SAMPLE_ALPHA_TO_COVERAGE):fe(e.SAMPLE_ALPHA_TO_COVERAGE)}function He(_){u!==_&&(_?e.frontFace(e.CW):e.frontFace(e.CCW),u=_)}function ve(_){_!==bn?(Y(e.CULL_FACE),_!==x&&(_===Ra?e.cullFace(e.BACK):_===Cn?e.cullFace(e.FRONT):e.cullFace(e.FRONT_AND_BACK))):fe(e.CULL_FACE),x=_}function Ke(_){_!==N&&(k&&e.lineWidth(_),N=_)}function pe(_,Q,te){_?(Y(e.POLYGON_OFFSET_FILL),(q!==Q||K!==te)&&(e.polygonOffset(Q,te),q=Q,K=te)):fe(e.POLYGON_OFFSET_FILL)}function Le(_){_?Y(e.SCISSOR_TEST):fe(e.SCISSOR_TEST)}function rt(_){_===void 0&&(_=e.TEXTURE0+Z-1),se!==_&&(e.activeTexture(_),se=_)}function Qe(_,Q,te){te===void 0&&(se===null?te=e.TEXTURE0+Z-1:te=se);let me=Ce[te];me===void 0&&(me={type:void 0,texture:void 0},Ce[te]=me),(me.type!==_||me.texture!==Q)&&(se!==te&&(e.activeTexture(te),se=te),e.bindTexture(_,Q||z[_]),me.type=_,me.texture=Q)}function f(){const _=Ce[se];_!==void 0&&_.type!==void 0&&(e.bindTexture(_.type,null),_.type=void 0,_.texture=void 0)}function n(){try{e.compressedTexImage2D(...arguments)}catch(_){console.error("THREE.WebGLState:",_)}}function A(){try{e.compressedTexImage3D(...arguments)}catch(_){console.error("THREE.WebGLState:",_)}}function B(){try{e.texSubImage2D(...arguments)}catch(_){console.error("THREE.WebGLState:",_)}}function X(){try{e.texSubImage3D(...arguments)}catch(_){console.error("THREE.WebGLState:",_)}}function G(){try{e.compressedTexSubImage2D(...arguments)}catch(_){console.error("THREE.WebGLState:",_)}}function Se(){try{e.compressedTexSubImage3D(...arguments)}catch(_){console.error("THREE.WebGLState:",_)}}function ee(){try{e.texStorage2D(...arguments)}catch(_){console.error("THREE.WebGLState:",_)}}function ge(){try{e.texStorage3D(...arguments)}catch(_){console.error("THREE.WebGLState:",_)}}function le(){try{e.texImage2D(...arguments)}catch(_){console.error("THREE.WebGLState:",_)}}function J(){try{e.texImage3D(...arguments)}catch(_){console.error("THREE.WebGLState:",_)}}function ne(_){Je.equals(_)===!1&&(e.scissor(_.x,_.y,_.z,_.w),Je.copy(_))}function Pe(_){$e.equals(_)===!1&&(e.viewport(_.x,_.y,_.z,_.w),$e.copy(_))}function he(_,Q){let te=v.get(Q);te===void 0&&(te=new WeakMap,v.set(Q,te));let me=te.get(_);me===void 0&&(me=e.getUniformBlockIndex(Q,_.name),te.set(_,me))}function re(_,Q){const te=v.get(Q).get(_);P.get(Q)!==te&&(e.uniformBlockBinding(Q,te,_.__bindingPointIndex),P.set(Q,te))}function De(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),m.setReversed(!1),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),L={},se=null,Ce={},R={},E=new WeakMap,T=[],F=null,U=!1,c=null,r=null,D=null,C=null,g=null,O=null,b=null,w=new qe(0,0,0),V=0,p=!1,u=null,x=null,N=null,q=null,K=null,Je.set(0,0,e.canvas.width,e.canvas.height),$e.set(0,0,e.canvas.width,e.canvas.height),o.reset(),m.reset(),d.reset()}return{buffers:{color:o,depth:m,stencil:d},enable:Y,disable:fe,bindFramebuffer:be,drawBuffers:Ee,useProgram:Me,setBlending:ye,setMaterial:we,setFlipSided:He,setCullFace:ve,setLineWidth:Ke,setPolygonOffset:pe,setScissorTest:Le,activeTexture:rt,bindTexture:Qe,unbindTexture:f,compressedTexImage2D:n,compressedTexImage3D:A,texImage2D:le,texImage3D:J,updateUBOMapping:he,uniformBlockBinding:re,texStorage2D:ee,texStorage3D:ge,texSubImage2D:B,texSubImage3D:X,compressedTexSubImage2D:G,compressedTexSubImage3D:Se,scissor:ne,viewport:Pe,reset:De}}function Cd(e,i,t,a,l,o,m){const d=i.has("WEBGL_multisampled_render_to_texture")?i.get("WEBGL_multisampled_render_to_texture"):null,P=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),v=new ct,L=new WeakMap;let R;const E=new WeakMap;let T=!1;try{T=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function F(f,n){return T?new OffscreenCanvas(f,n):qn("canvas")}function U(f,n,A){let B=1;const X=Qe(f);if((X.width>A||X.height>A)&&(B=A/Math.max(X.width,X.height)),B<1)if(typeof HTMLImageElement<"u"&&f instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&f instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&f instanceof ImageBitmap||typeof VideoFrame<"u"&&f instanceof VideoFrame){const G=Math.floor(B*X.width),Se=Math.floor(B*X.height);R===void 0&&(R=F(G,Se));const ee=n?F(G,Se):R;return ee.width=G,ee.height=Se,ee.getContext("2d").drawImage(f,0,0,G,Se),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+X.width+"x"+X.height+") to ("+G+"x"+Se+")."),ee}else return"data"in f&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+X.width+"x"+X.height+")."),f;return f}function c(f){return f.generateMipmaps}function r(f){e.generateMipmap(f)}function D(f){return f.isWebGLCubeRenderTarget?e.TEXTURE_CUBE_MAP:f.isWebGL3DRenderTarget?e.TEXTURE_3D:f.isWebGLArrayRenderTarget||f.isCompressedArrayTexture?e.TEXTURE_2D_ARRAY:e.TEXTURE_2D}function C(f,n,A,B,X=!1){if(f!==null){if(e[f]!==void 0)return e[f];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+f+"'")}let G=n;if(n===e.RED&&(A===e.FLOAT&&(G=e.R32F),A===e.HALF_FLOAT&&(G=e.R16F),A===e.UNSIGNED_BYTE&&(G=e.R8)),n===e.RED_INTEGER&&(A===e.UNSIGNED_BYTE&&(G=e.R8UI),A===e.UNSIGNED_SHORT&&(G=e.R16UI),A===e.UNSIGNED_INT&&(G=e.R32UI),A===e.BYTE&&(G=e.R8I),A===e.SHORT&&(G=e.R16I),A===e.INT&&(G=e.R32I)),n===e.RG&&(A===e.FLOAT&&(G=e.RG32F),A===e.HALF_FLOAT&&(G=e.RG16F),A===e.UNSIGNED_BYTE&&(G=e.RG8)),n===e.RG_INTEGER&&(A===e.UNSIGNED_BYTE&&(G=e.RG8UI),A===e.UNSIGNED_SHORT&&(G=e.RG16UI),A===e.UNSIGNED_INT&&(G=e.RG32UI),A===e.BYTE&&(G=e.RG8I),A===e.SHORT&&(G=e.RG16I),A===e.INT&&(G=e.RG32I)),n===e.RGB_INTEGER&&(A===e.UNSIGNED_BYTE&&(G=e.RGB8UI),A===e.UNSIGNED_SHORT&&(G=e.RGB16UI),A===e.UNSIGNED_INT&&(G=e.RGB32UI),A===e.BYTE&&(G=e.RGB8I),A===e.SHORT&&(G=e.RGB16I),A===e.INT&&(G=e.RGB32I)),n===e.RGBA_INTEGER&&(A===e.UNSIGNED_BYTE&&(G=e.RGBA8UI),A===e.UNSIGNED_SHORT&&(G=e.RGBA16UI),A===e.UNSIGNED_INT&&(G=e.RGBA32UI),A===e.BYTE&&(G=e.RGBA8I),A===e.SHORT&&(G=e.RGBA16I),A===e.INT&&(G=e.RGBA32I)),n===e.RGB&&(A===e.UNSIGNED_INT_5_9_9_9_REV&&(G=e.RGB9_E5),A===e.UNSIGNED_INT_10F_11F_11F_REV&&(G=e.R11F_G11F_B10F)),n===e.RGBA){const Se=X?vr:et.getTransfer(B);A===e.FLOAT&&(G=e.RGBA32F),A===e.HALF_FLOAT&&(G=e.RGBA16F),A===e.UNSIGNED_BYTE&&(G=Se===Ye?e.SRGB8_ALPHA8:e.RGBA8),A===e.UNSIGNED_SHORT_4_4_4_4&&(G=e.RGBA4),A===e.UNSIGNED_SHORT_5_5_5_1&&(G=e.RGB5_A1)}return(G===e.R16F||G===e.R32F||G===e.RG16F||G===e.RG32F||G===e.RGBA16F||G===e.RGBA32F)&&i.get("EXT_color_buffer_float"),G}function g(f,n){let A;return f?n===null||n===Jt||n===$t?A=e.DEPTH24_STENCIL8:n===Dt?A=e.DEPTH32F_STENCIL8:n===ui&&(A=e.DEPTH24_STENCIL8,console.warn("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):n===null||n===Jt||n===$t?A=e.DEPTH_COMPONENT24:n===Dt?A=e.DEPTH_COMPONENT32F:n===ui&&(A=e.DEPTH_COMPONENT16),A}function O(f,n){return c(f)===!0||f.isFramebufferTexture&&f.minFilter!==Kt&&f.minFilter!==Bt?Math.log2(Math.max(n.width,n.height))+1:f.mipmaps!==void 0&&f.mipmaps.length>0?f.mipmaps.length:f.isCompressedTexture&&Array.isArray(f.image)?n.mipmaps.length:1}function b(f){const n=f.target;n.removeEventListener("dispose",b),V(n),n.isVideoTexture&&L.delete(n)}function w(f){const n=f.target;n.removeEventListener("dispose",w),u(n)}function V(f){const n=a.get(f);if(n.__webglInit===void 0)return;const A=f.source,B=E.get(A);if(B){const X=B[n.__cacheKey];X.usedTimes--,X.usedTimes===0&&p(f),Object.keys(B).length===0&&E.delete(A)}a.remove(f)}function p(f){const n=a.get(f);e.deleteTexture(n.__webglTexture);const A=f.source,B=E.get(A);delete B[n.__cacheKey],m.memory.textures--}function u(f){const n=a.get(f);if(f.depthTexture&&(f.depthTexture.dispose(),a.remove(f.depthTexture)),f.isWebGLCubeRenderTarget)for(let B=0;B<6;B++){if(Array.isArray(n.__webglFramebuffer[B]))for(let X=0;X<n.__webglFramebuffer[B].length;X++)e.deleteFramebuffer(n.__webglFramebuffer[B][X]);else e.deleteFramebuffer(n.__webglFramebuffer[B]);n.__webglDepthbuffer&&e.deleteRenderbuffer(n.__webglDepthbuffer[B])}else{if(Array.isArray(n.__webglFramebuffer))for(let B=0;B<n.__webglFramebuffer.length;B++)e.deleteFramebuffer(n.__webglFramebuffer[B]);else e.deleteFramebuffer(n.__webglFramebuffer);if(n.__webglDepthbuffer&&e.deleteRenderbuffer(n.__webglDepthbuffer),n.__webglMultisampledFramebuffer&&e.deleteFramebuffer(n.__webglMultisampledFramebuffer),n.__webglColorRenderbuffer)for(let B=0;B<n.__webglColorRenderbuffer.length;B++)n.__webglColorRenderbuffer[B]&&e.deleteRenderbuffer(n.__webglColorRenderbuffer[B]);n.__webglDepthRenderbuffer&&e.deleteRenderbuffer(n.__webglDepthRenderbuffer)}const A=f.textures;for(let B=0,X=A.length;B<X;B++){const G=a.get(A[B]);G.__webglTexture&&(e.deleteTexture(G.__webglTexture),m.memory.textures--),a.remove(A[B])}a.remove(f)}let x=0;function N(){x=0}function q(){const f=x;return f>=l.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+f+" texture units while this GPU supports only "+l.maxTextures),x+=1,f}function K(f){const n=[];return n.push(f.wrapS),n.push(f.wrapT),n.push(f.wrapR||0),n.push(f.magFilter),n.push(f.minFilter),n.push(f.anisotropy),n.push(f.internalFormat),n.push(f.format),n.push(f.type),n.push(f.generateMipmaps),n.push(f.premultiplyAlpha),n.push(f.flipY),n.push(f.unpackAlignment),n.push(f.colorSpace),n.join()}function Z(f,n){const A=a.get(f);if(f.isVideoTexture&&Le(f),f.isRenderTargetTexture===!1&&f.isExternalTexture!==!0&&f.version>0&&A.__version!==f.version){const B=f.image;if(B===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(B.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{z(A,f,n);return}}else f.isExternalTexture&&(A.__webglTexture=f.sourceTexture?f.sourceTexture:null);t.bindTexture(e.TEXTURE_2D,A.__webglTexture,e.TEXTURE0+n)}function k(f,n){const A=a.get(f);if(f.isRenderTargetTexture===!1&&f.version>0&&A.__version!==f.version){z(A,f,n);return}t.bindTexture(e.TEXTURE_2D_ARRAY,A.__webglTexture,e.TEXTURE0+n)}function ie(f,n){const A=a.get(f);if(f.isRenderTargetTexture===!1&&f.version>0&&A.__version!==f.version){z(A,f,n);return}t.bindTexture(e.TEXTURE_3D,A.__webglTexture,e.TEXTURE0+n)}function H(f,n){const A=a.get(f);if(f.version>0&&A.__version!==f.version){Y(A,f,n);return}t.bindTexture(e.TEXTURE_CUBE_MAP,A.__webglTexture,e.TEXTURE0+n)}const se={[nn]:e.REPEAT,[rn]:e.CLAMP_TO_EDGE,[an]:e.MIRRORED_REPEAT},Ce={[Kt]:e.NEAREST,[on]:e.NEAREST_MIPMAP_NEAREST,[ti]:e.NEAREST_MIPMAP_LINEAR,[Bt]:e.LINEAR,[Ei]:e.LINEAR_MIPMAP_NEAREST,[Xt]:e.LINEAR_MIPMAP_LINEAR},Be={[pn]:e.NEVER,[fn]:e.ALWAYS,[un]:e.LESS,[nr]:e.LEQUAL,[dn]:e.EQUAL,[cn]:e.GEQUAL,[ln]:e.GREATER,[sn]:e.NOTEQUAL};function Oe(f,n){if(n.type===Dt&&i.has("OES_texture_float_linear")===!1&&(n.magFilter===Bt||n.magFilter===Ei||n.magFilter===ti||n.magFilter===Xt||n.minFilter===Bt||n.minFilter===Ei||n.minFilter===ti||n.minFilter===Xt)&&console.warn("THREE.WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),e.texParameteri(f,e.TEXTURE_WRAP_S,se[n.wrapS]),e.texParameteri(f,e.TEXTURE_WRAP_T,se[n.wrapT]),(f===e.TEXTURE_3D||f===e.TEXTURE_2D_ARRAY)&&e.texParameteri(f,e.TEXTURE_WRAP_R,se[n.wrapR]),e.texParameteri(f,e.TEXTURE_MAG_FILTER,Ce[n.magFilter]),e.texParameteri(f,e.TEXTURE_MIN_FILTER,Ce[n.minFilter]),n.compareFunction&&(e.texParameteri(f,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(f,e.TEXTURE_COMPARE_FUNC,Be[n.compareFunction])),i.has("EXT_texture_filter_anisotropic")===!0){if(n.magFilter===Kt||n.minFilter!==ti&&n.minFilter!==Xt||n.type===Dt&&i.has("OES_texture_float_linear")===!1)return;if(n.anisotropy>1||a.get(n).__currentAnisotropy){const A=i.get("EXT_texture_filter_anisotropic");e.texParameterf(f,A.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(n.anisotropy,l.getMaxAnisotropy())),a.get(n).__currentAnisotropy=n.anisotropy}}}function Je(f,n){let A=!1;f.__webglInit===void 0&&(f.__webglInit=!0,n.addEventListener("dispose",b));const B=n.source;let X=E.get(B);X===void 0&&(X={},E.set(B,X));const G=K(n);if(G!==f.__cacheKey){X[G]===void 0&&(X[G]={texture:e.createTexture(),usedTimes:0},m.memory.textures++,A=!0),X[G].usedTimes++;const Se=X[f.__cacheKey];Se!==void 0&&(X[f.__cacheKey].usedTimes--,Se.usedTimes===0&&p(n)),f.__cacheKey=G,f.__webglTexture=X[G].texture}return A}function $e(f,n,A){return Math.floor(Math.floor(f/A)/n)}function Ge(f,n,A,B){const X=f.updateRanges;if(X.length===0)t.texSubImage2D(e.TEXTURE_2D,0,0,0,n.width,n.height,A,B,n.data);else{X.sort((le,J)=>le.start-J.start);let G=0;for(let le=1;le<X.length;le++){const J=X[G],ne=X[le],Pe=J.start+J.count,he=$e(ne.start,n.width,4),re=$e(J.start,n.width,4);ne.start<=Pe+1&&he===re&&$e(ne.start+ne.count-1,n.width,4)===he?J.count=Math.max(J.count,ne.start+ne.count-J.start):(++G,X[G]=ne)}X.length=G+1;const Se=e.getParameter(e.UNPACK_ROW_LENGTH),ee=e.getParameter(e.UNPACK_SKIP_PIXELS),ge=e.getParameter(e.UNPACK_SKIP_ROWS);e.pixelStorei(e.UNPACK_ROW_LENGTH,n.width);for(let le=0,J=X.length;le<J;le++){const ne=X[le],Pe=Math.floor(ne.start/4),he=Math.ceil(ne.count/4),re=Pe%n.width,De=Math.floor(Pe/n.width),_=he;e.pixelStorei(e.UNPACK_SKIP_PIXELS,re),e.pixelStorei(e.UNPACK_SKIP_ROWS,De),t.texSubImage2D(e.TEXTURE_2D,0,re,De,_,1,A,B,n.data)}f.clearUpdateRanges(),e.pixelStorei(e.UNPACK_ROW_LENGTH,Se),e.pixelStorei(e.UNPACK_SKIP_PIXELS,ee),e.pixelStorei(e.UNPACK_SKIP_ROWS,ge)}}function z(f,n,A){let B=e.TEXTURE_2D;(n.isDataArrayTexture||n.isCompressedArrayTexture)&&(B=e.TEXTURE_2D_ARRAY),n.isData3DTexture&&(B=e.TEXTURE_3D);const X=Je(f,n),G=n.source;t.bindTexture(B,f.__webglTexture,e.TEXTURE0+A);const Se=a.get(G);if(G.version!==Se.__version||X===!0){t.activeTexture(e.TEXTURE0+A);const ee=et.getPrimaries(et.workingColorSpace),ge=n.colorSpace===Ft?null:et.getPrimaries(n.colorSpace),le=n.colorSpace===Ft||ee===ge?e.NONE:e.BROWSER_DEFAULT_WEBGL;e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,n.flipY),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,n.premultiplyAlpha),e.pixelStorei(e.UNPACK_ALIGNMENT,n.unpackAlignment),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,le);let J=U(n.image,!1,l.maxTextureSize);J=rt(n,J);const ne=o.convert(n.format,n.colorSpace),Pe=o.convert(n.type);let he=C(n.internalFormat,ne,Pe,n.colorSpace,n.isVideoTexture);Oe(B,n);let re;const De=n.mipmaps,_=n.isVideoTexture!==!0,Q=Se.__version===void 0||X===!0,te=G.dataReady,me=O(n,J);if(n.isDepthTexture)he=g(n.format===ci,n.type),Q&&(_?t.texStorage2D(e.TEXTURE_2D,1,he,J.width,J.height):t.texImage2D(e.TEXTURE_2D,0,he,J.width,J.height,0,ne,Pe,null));else if(n.isDataTexture)if(De.length>0){_&&Q&&t.texStorage2D(e.TEXTURE_2D,me,he,De[0].width,De[0].height);for(let $=0,W=De.length;$<W;$++)re=De[$],_?te&&t.texSubImage2D(e.TEXTURE_2D,$,0,0,re.width,re.height,ne,Pe,re.data):t.texImage2D(e.TEXTURE_2D,$,he,re.width,re.height,0,ne,Pe,re.data);n.generateMipmaps=!1}else _?(Q&&t.texStorage2D(e.TEXTURE_2D,me,he,J.width,J.height),te&&Ge(n,J,ne,Pe)):t.texImage2D(e.TEXTURE_2D,0,he,J.width,J.height,0,ne,Pe,J.data);else if(n.isCompressedTexture)if(n.isCompressedArrayTexture){_&&Q&&t.texStorage3D(e.TEXTURE_2D_ARRAY,me,he,De[0].width,De[0].height,J.depth);for(let $=0,W=De.length;$<W;$++)if(re=De[$],n.format!==Tt)if(ne!==null)if(_){if(te)if(n.layerUpdates.size>0){const ue=La(re.width,re.height,n.format,n.type);for(const Te of n.layerUpdates){const tt=re.data.subarray(Te*ue/re.data.BYTES_PER_ELEMENT,(Te+1)*ue/re.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,$,0,0,Te,re.width,re.height,1,ne,tt)}n.clearLayerUpdates()}else t.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,$,0,0,0,re.width,re.height,J.depth,ne,re.data)}else t.compressedTexImage3D(e.TEXTURE_2D_ARRAY,$,he,re.width,re.height,J.depth,0,re.data,0,0);else console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else _?te&&t.texSubImage3D(e.TEXTURE_2D_ARRAY,$,0,0,0,re.width,re.height,J.depth,ne,Pe,re.data):t.texImage3D(e.TEXTURE_2D_ARRAY,$,he,re.width,re.height,J.depth,0,ne,Pe,re.data)}else{_&&Q&&t.texStorage2D(e.TEXTURE_2D,me,he,De[0].width,De[0].height);for(let $=0,W=De.length;$<W;$++)re=De[$],n.format!==Tt?ne!==null?_?te&&t.compressedTexSubImage2D(e.TEXTURE_2D,$,0,0,re.width,re.height,ne,re.data):t.compressedTexImage2D(e.TEXTURE_2D,$,he,re.width,re.height,0,re.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):_?te&&t.texSubImage2D(e.TEXTURE_2D,$,0,0,re.width,re.height,ne,Pe,re.data):t.texImage2D(e.TEXTURE_2D,$,he,re.width,re.height,0,ne,Pe,re.data)}else if(n.isDataArrayTexture)if(_){if(Q&&t.texStorage3D(e.TEXTURE_2D_ARRAY,me,he,J.width,J.height,J.depth),te)if(n.layerUpdates.size>0){const $=La(J.width,J.height,n.format,n.type);for(const W of n.layerUpdates){const ue=J.data.subarray(W*$/J.data.BYTES_PER_ELEMENT,(W+1)*$/J.data.BYTES_PER_ELEMENT);t.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,W,J.width,J.height,1,ne,Pe,ue)}n.clearLayerUpdates()}else t.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,0,J.width,J.height,J.depth,ne,Pe,J.data)}else t.texImage3D(e.TEXTURE_2D_ARRAY,0,he,J.width,J.height,J.depth,0,ne,Pe,J.data);else if(n.isData3DTexture)_?(Q&&t.texStorage3D(e.TEXTURE_3D,me,he,J.width,J.height,J.depth),te&&t.texSubImage3D(e.TEXTURE_3D,0,0,0,0,J.width,J.height,J.depth,ne,Pe,J.data)):t.texImage3D(e.TEXTURE_3D,0,he,J.width,J.height,J.depth,0,ne,Pe,J.data);else if(n.isFramebufferTexture){if(Q)if(_)t.texStorage2D(e.TEXTURE_2D,me,he,J.width,J.height);else{let $=J.width,W=J.height;for(let ue=0;ue<me;ue++)t.texImage2D(e.TEXTURE_2D,ue,he,$,W,0,ne,Pe,null),$>>=1,W>>=1}}else if(De.length>0){if(_&&Q){const $=Qe(De[0]);t.texStorage2D(e.TEXTURE_2D,me,he,$.width,$.height)}for(let $=0,W=De.length;$<W;$++)re=De[$],_?te&&t.texSubImage2D(e.TEXTURE_2D,$,0,0,ne,Pe,re):t.texImage2D(e.TEXTURE_2D,$,he,ne,Pe,re);n.generateMipmaps=!1}else if(_){if(Q){const $=Qe(J);t.texStorage2D(e.TEXTURE_2D,me,he,$.width,$.height)}te&&t.texSubImage2D(e.TEXTURE_2D,0,0,0,ne,Pe,J)}else t.texImage2D(e.TEXTURE_2D,0,he,ne,Pe,J);c(n)&&r(B),Se.__version=G.version,n.onUpdate&&n.onUpdate(n)}f.__version=n.version}function Y(f,n,A){if(n.image.length!==6)return;const B=Je(f,n),X=n.source;t.bindTexture(e.TEXTURE_CUBE_MAP,f.__webglTexture,e.TEXTURE0+A);const G=a.get(X);if(X.version!==G.__version||B===!0){t.activeTexture(e.TEXTURE0+A);const Se=et.getPrimaries(et.workingColorSpace),ee=n.colorSpace===Ft?null:et.getPrimaries(n.colorSpace),ge=n.colorSpace===Ft||Se===ee?e.NONE:e.BROWSER_DEFAULT_WEBGL;e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,n.flipY),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,n.premultiplyAlpha),e.pixelStorei(e.UNPACK_ALIGNMENT,n.unpackAlignment),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,ge);const le=n.isCompressedTexture||n.image[0].isCompressedTexture,J=n.image[0]&&n.image[0].isDataTexture,ne=[];for(let W=0;W<6;W++)!le&&!J?ne[W]=U(n.image[W],!0,l.maxCubemapSize):ne[W]=J?n.image[W].image:n.image[W],ne[W]=rt(n,ne[W]);const Pe=ne[0],he=o.convert(n.format,n.colorSpace),re=o.convert(n.type),De=C(n.internalFormat,he,re,n.colorSpace),_=n.isVideoTexture!==!0,Q=G.__version===void 0||B===!0,te=X.dataReady;let me=O(n,Pe);Oe(e.TEXTURE_CUBE_MAP,n);let $;if(le){_&&Q&&t.texStorage2D(e.TEXTURE_CUBE_MAP,me,De,Pe.width,Pe.height);for(let W=0;W<6;W++){$=ne[W].mipmaps;for(let ue=0;ue<$.length;ue++){const Te=$[ue];n.format!==Tt?he!==null?_?te&&t.compressedTexSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+W,ue,0,0,Te.width,Te.height,he,Te.data):t.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+W,ue,De,Te.width,Te.height,0,Te.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):_?te&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+W,ue,0,0,Te.width,Te.height,he,re,Te.data):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+W,ue,De,Te.width,Te.height,0,he,re,Te.data)}}}else{if($=n.mipmaps,_&&Q){$.length>0&&me++;const W=Qe(ne[0]);t.texStorage2D(e.TEXTURE_CUBE_MAP,me,De,W.width,W.height)}for(let W=0;W<6;W++)if(J){_?te&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+W,0,0,0,ne[W].width,ne[W].height,he,re,ne[W].data):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+W,0,De,ne[W].width,ne[W].height,0,he,re,ne[W].data);for(let ue=0;ue<$.length;ue++){const Te=$[ue].image[W].image;_?te&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+W,ue+1,0,0,Te.width,Te.height,he,re,Te.data):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+W,ue+1,De,Te.width,Te.height,0,he,re,Te.data)}}else{_?te&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+W,0,0,0,he,re,ne[W]):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+W,0,De,he,re,ne[W]);for(let ue=0;ue<$.length;ue++){const Te=$[ue];_?te&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+W,ue+1,0,0,he,re,Te.image[W]):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+W,ue+1,De,he,re,Te.image[W])}}}c(n)&&r(e.TEXTURE_CUBE_MAP),G.__version=X.version,n.onUpdate&&n.onUpdate(n)}f.__version=n.version}function fe(f,n,A,B,X,G){const Se=o.convert(A.format,A.colorSpace),ee=o.convert(A.type),ge=C(A.internalFormat,Se,ee,A.colorSpace),le=a.get(n),J=a.get(A);if(J.__renderTarget=n,!le.__hasExternalTextures){const ne=Math.max(1,n.width>>G),Pe=Math.max(1,n.height>>G);X===e.TEXTURE_3D||X===e.TEXTURE_2D_ARRAY?t.texImage3D(X,G,ge,ne,Pe,n.depth,0,Se,ee,null):t.texImage2D(X,G,ge,ne,Pe,0,Se,ee,null)}t.bindFramebuffer(e.FRAMEBUFFER,f),pe(n)?d.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,B,X,J.__webglTexture,0,Ke(n)):(X===e.TEXTURE_2D||X>=e.TEXTURE_CUBE_MAP_POSITIVE_X&&X<=e.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&e.framebufferTexture2D(e.FRAMEBUFFER,B,X,J.__webglTexture,G),t.bindFramebuffer(e.FRAMEBUFFER,null)}function be(f,n,A){if(e.bindRenderbuffer(e.RENDERBUFFER,f),n.depthBuffer){const B=n.depthTexture,X=B&&B.isDepthTexture?B.type:null,G=g(n.stencilBuffer,X),Se=n.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,ee=Ke(n);pe(n)?d.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,ee,G,n.width,n.height):A?e.renderbufferStorageMultisample(e.RENDERBUFFER,ee,G,n.width,n.height):e.renderbufferStorage(e.RENDERBUFFER,G,n.width,n.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,Se,e.RENDERBUFFER,f)}else{const B=n.textures;for(let X=0;X<B.length;X++){const G=B[X],Se=o.convert(G.format,G.colorSpace),ee=o.convert(G.type),ge=C(G.internalFormat,Se,ee,G.colorSpace),le=Ke(n);A&&pe(n)===!1?e.renderbufferStorageMultisample(e.RENDERBUFFER,le,ge,n.width,n.height):pe(n)?d.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,le,ge,n.width,n.height):e.renderbufferStorage(e.RENDERBUFFER,ge,n.width,n.height)}}e.bindRenderbuffer(e.RENDERBUFFER,null)}function Ee(f,n){if(n&&n.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(t.bindFramebuffer(e.FRAMEBUFFER,f),!(n.depthTexture&&n.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");const A=a.get(n.depthTexture);A.__renderTarget=n,(!A.__webglTexture||n.depthTexture.image.width!==n.width||n.depthTexture.image.height!==n.height)&&(n.depthTexture.image.width=n.width,n.depthTexture.image.height=n.height,n.depthTexture.needsUpdate=!0),Z(n.depthTexture,0);const B=A.__webglTexture,X=Ke(n);if(n.depthTexture.format===Vi)pe(n)?d.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,B,0,X):e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,B,0);else if(n.depthTexture.format===ci)pe(n)?d.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.TEXTURE_2D,B,0,X):e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.TEXTURE_2D,B,0);else throw new Error("Unknown depthTexture format")}function Me(f){const n=a.get(f),A=f.isWebGLCubeRenderTarget===!0;if(n.__boundDepthTexture!==f.depthTexture){const B=f.depthTexture;if(n.__depthDisposeCallback&&n.__depthDisposeCallback(),B){const X=()=>{delete n.__boundDepthTexture,delete n.__depthDisposeCallback,B.removeEventListener("dispose",X)};B.addEventListener("dispose",X),n.__depthDisposeCallback=X}n.__boundDepthTexture=B}if(f.depthTexture&&!n.__autoAllocateDepthBuffer){if(A)throw new Error("target.depthTexture not supported in Cube render targets");const B=f.texture.mipmaps;B&&B.length>0?Ee(n.__webglFramebuffer[0],f):Ee(n.__webglFramebuffer,f)}else if(A){n.__webglDepthbuffer=[];for(let B=0;B<6;B++)if(t.bindFramebuffer(e.FRAMEBUFFER,n.__webglFramebuffer[B]),n.__webglDepthbuffer[B]===void 0)n.__webglDepthbuffer[B]=e.createRenderbuffer(),be(n.__webglDepthbuffer[B],f,!1);else{const X=f.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,G=n.__webglDepthbuffer[B];e.bindRenderbuffer(e.RENDERBUFFER,G),e.framebufferRenderbuffer(e.FRAMEBUFFER,X,e.RENDERBUFFER,G)}}else{const B=f.texture.mipmaps;if(B&&B.length>0?t.bindFramebuffer(e.FRAMEBUFFER,n.__webglFramebuffer[0]):t.bindFramebuffer(e.FRAMEBUFFER,n.__webglFramebuffer),n.__webglDepthbuffer===void 0)n.__webglDepthbuffer=e.createRenderbuffer(),be(n.__webglDepthbuffer,f,!1);else{const X=f.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,G=n.__webglDepthbuffer;e.bindRenderbuffer(e.RENDERBUFFER,G),e.framebufferRenderbuffer(e.FRAMEBUFFER,X,e.RENDERBUFFER,G)}}t.bindFramebuffer(e.FRAMEBUFFER,null)}function ke(f,n,A){const B=a.get(f);n!==void 0&&fe(B.__webglFramebuffer,f,f.texture,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,0),A!==void 0&&Me(f)}function h(f){const n=f.texture,A=a.get(f),B=a.get(n);f.addEventListener("dispose",w);const X=f.textures,G=f.isWebGLCubeRenderTarget===!0,Se=X.length>1;if(Se||(B.__webglTexture===void 0&&(B.__webglTexture=e.createTexture()),B.__version=n.version,m.memory.textures++),G){A.__webglFramebuffer=[];for(let ee=0;ee<6;ee++)if(n.mipmaps&&n.mipmaps.length>0){A.__webglFramebuffer[ee]=[];for(let ge=0;ge<n.mipmaps.length;ge++)A.__webglFramebuffer[ee][ge]=e.createFramebuffer()}else A.__webglFramebuffer[ee]=e.createFramebuffer()}else{if(n.mipmaps&&n.mipmaps.length>0){A.__webglFramebuffer=[];for(let ee=0;ee<n.mipmaps.length;ee++)A.__webglFramebuffer[ee]=e.createFramebuffer()}else A.__webglFramebuffer=e.createFramebuffer();if(Se)for(let ee=0,ge=X.length;ee<ge;ee++){const le=a.get(X[ee]);le.__webglTexture===void 0&&(le.__webglTexture=e.createTexture(),m.memory.textures++)}if(f.samples>0&&pe(f)===!1){A.__webglMultisampledFramebuffer=e.createFramebuffer(),A.__webglColorRenderbuffer=[],t.bindFramebuffer(e.FRAMEBUFFER,A.__webglMultisampledFramebuffer);for(let ee=0;ee<X.length;ee++){const ge=X[ee];A.__webglColorRenderbuffer[ee]=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,A.__webglColorRenderbuffer[ee]);const le=o.convert(ge.format,ge.colorSpace),J=o.convert(ge.type),ne=C(ge.internalFormat,le,J,ge.colorSpace,f.isXRRenderTarget===!0),Pe=Ke(f);e.renderbufferStorageMultisample(e.RENDERBUFFER,Pe,ne,f.width,f.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+ee,e.RENDERBUFFER,A.__webglColorRenderbuffer[ee])}e.bindRenderbuffer(e.RENDERBUFFER,null),f.depthBuffer&&(A.__webglDepthRenderbuffer=e.createRenderbuffer(),be(A.__webglDepthRenderbuffer,f,!0)),t.bindFramebuffer(e.FRAMEBUFFER,null)}}if(G){t.bindTexture(e.TEXTURE_CUBE_MAP,B.__webglTexture),Oe(e.TEXTURE_CUBE_MAP,n);for(let ee=0;ee<6;ee++)if(n.mipmaps&&n.mipmaps.length>0)for(let ge=0;ge<n.mipmaps.length;ge++)fe(A.__webglFramebuffer[ee][ge],f,n,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+ee,ge);else fe(A.__webglFramebuffer[ee],f,n,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+ee,0);c(n)&&r(e.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(Se){for(let ee=0,ge=X.length;ee<ge;ee++){const le=X[ee],J=a.get(le);let ne=e.TEXTURE_2D;(f.isWebGL3DRenderTarget||f.isWebGLArrayRenderTarget)&&(ne=f.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),t.bindTexture(ne,J.__webglTexture),Oe(ne,le),fe(A.__webglFramebuffer,f,le,e.COLOR_ATTACHMENT0+ee,ne,0),c(le)&&r(ne)}t.unbindTexture()}else{let ee=e.TEXTURE_2D;if((f.isWebGL3DRenderTarget||f.isWebGLArrayRenderTarget)&&(ee=f.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),t.bindTexture(ee,B.__webglTexture),Oe(ee,n),n.mipmaps&&n.mipmaps.length>0)for(let ge=0;ge<n.mipmaps.length;ge++)fe(A.__webglFramebuffer[ge],f,n,e.COLOR_ATTACHMENT0,ee,ge);else fe(A.__webglFramebuffer,f,n,e.COLOR_ATTACHMENT0,ee,0);c(n)&&r(ee),t.unbindTexture()}f.depthBuffer&&Me(f)}function ye(f){const n=f.textures;for(let A=0,B=n.length;A<B;A++){const X=n[A];if(c(X)){const G=D(f),Se=a.get(X).__webglTexture;t.bindTexture(G,Se),r(G),t.unbindTexture()}}}const we=[],He=[];function ve(f){if(f.samples>0){if(pe(f)===!1){const n=f.textures,A=f.width,B=f.height;let X=e.COLOR_BUFFER_BIT;const G=f.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,Se=a.get(f),ee=n.length>1;if(ee)for(let le=0;le<n.length;le++)t.bindFramebuffer(e.FRAMEBUFFER,Se.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+le,e.RENDERBUFFER,null),t.bindFramebuffer(e.FRAMEBUFFER,Se.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+le,e.TEXTURE_2D,null,0);t.bindFramebuffer(e.READ_FRAMEBUFFER,Se.__webglMultisampledFramebuffer);const ge=f.texture.mipmaps;ge&&ge.length>0?t.bindFramebuffer(e.DRAW_FRAMEBUFFER,Se.__webglFramebuffer[0]):t.bindFramebuffer(e.DRAW_FRAMEBUFFER,Se.__webglFramebuffer);for(let le=0;le<n.length;le++){if(f.resolveDepthBuffer&&(f.depthBuffer&&(X|=e.DEPTH_BUFFER_BIT),f.stencilBuffer&&f.resolveStencilBuffer&&(X|=e.STENCIL_BUFFER_BIT)),ee){e.framebufferRenderbuffer(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,Se.__webglColorRenderbuffer[le]);const J=a.get(n[le]).__webglTexture;e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,J,0)}e.blitFramebuffer(0,0,A,B,0,0,A,B,X,e.NEAREST),P===!0&&(we.length=0,He.length=0,we.push(e.COLOR_ATTACHMENT0+le),f.depthBuffer&&f.resolveDepthBuffer===!1&&(we.push(G),He.push(G),e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,He)),e.invalidateFramebuffer(e.READ_FRAMEBUFFER,we))}if(t.bindFramebuffer(e.READ_FRAMEBUFFER,null),t.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),ee)for(let le=0;le<n.length;le++){t.bindFramebuffer(e.FRAMEBUFFER,Se.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+le,e.RENDERBUFFER,Se.__webglColorRenderbuffer[le]);const J=a.get(n[le]).__webglTexture;t.bindFramebuffer(e.FRAMEBUFFER,Se.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+le,e.TEXTURE_2D,J,0)}t.bindFramebuffer(e.DRAW_FRAMEBUFFER,Se.__webglMultisampledFramebuffer)}else if(f.depthBuffer&&f.resolveDepthBuffer===!1&&P){const n=f.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,[n])}}}function Ke(f){return Math.min(l.maxSamples,f.samples)}function pe(f){const n=a.get(f);return f.samples>0&&i.has("WEBGL_multisampled_render_to_texture")===!0&&n.__useRenderToTexture!==!1}function Le(f){const n=m.render.frame;L.get(f)!==n&&(L.set(f,n),f.update())}function rt(f,n){const A=f.colorSpace,B=f.format,X=f.type;return f.isCompressedTexture===!0||f.isVideoTexture===!0||A!==pi&&A!==Ft&&(et.getTransfer(A)===Ye?(B!==Tt||X!==yt)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",A)),n}function Qe(f){return typeof HTMLImageElement<"u"&&f instanceof HTMLImageElement?(v.width=f.naturalWidth||f.width,v.height=f.naturalHeight||f.height):typeof VideoFrame<"u"&&f instanceof VideoFrame?(v.width=f.displayWidth,v.height=f.displayHeight):(v.width=f.width,v.height=f.height),v}this.allocateTextureUnit=q,this.resetTextureUnits=N,this.setTexture2D=Z,this.setTexture2DArray=k,this.setTexture3D=ie,this.setTextureCube=H,this.rebindTextures=ke,this.setupRenderTarget=h,this.updateRenderTargetMipmap=ye,this.updateMultisampleRenderTarget=ve,this.setupDepthRenderbuffer=Me,this.setupFrameBufferTexture=fe,this.useMultisampledRTT=pe}function Pd(e,i){function t(a,l=Ft){let o;const m=et.getTransfer(l);if(a===yt)return e.UNSIGNED_BYTE;if(a===sr)return e.UNSIGNED_SHORT_4_4_4_4;if(a===lr)return e.UNSIGNED_SHORT_5_5_5_1;if(a===vn)return e.UNSIGNED_INT_5_9_9_9_REV;if(a===En)return e.UNSIGNED_INT_10F_11F_11F_REV;if(a===Sn)return e.BYTE;if(a===Mn)return e.SHORT;if(a===ui)return e.UNSIGNED_SHORT;if(a===ur)return e.INT;if(a===Jt)return e.UNSIGNED_INT;if(a===Dt)return e.FLOAT;if(a===fi)return e.HALF_FLOAT;if(a===Tn)return e.ALPHA;if(a===xn)return e.RGB;if(a===Tt)return e.RGBA;if(a===Vi)return e.DEPTH_COMPONENT;if(a===ci)return e.DEPTH_STENCIL;if(a===Rn)return e.RED;if(a===fr)return e.RED_INTEGER;if(a===An)return e.RG;if(a===pr)return e.RG_INTEGER;if(a===mr)return e.RGBA_INTEGER;if(a===Si||a===Mi||a===Ti||a===xi)if(m===Ye)if(o=i.get("WEBGL_compressed_texture_s3tc_srgb"),o!==null){if(a===Si)return o.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(a===Mi)return o.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(a===Ti)return o.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(a===xi)return o.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(o=i.get("WEBGL_compressed_texture_s3tc"),o!==null){if(a===Si)return o.COMPRESSED_RGB_S3TC_DXT1_EXT;if(a===Mi)return o.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(a===Ti)return o.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(a===xi)return o.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(a===Zi||a===$i||a===Ji||a===Qi)if(o=i.get("WEBGL_compressed_texture_pvrtc"),o!==null){if(a===Zi)return o.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(a===$i)return o.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(a===Ji)return o.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(a===Qi)return o.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(a===ea||a===ta||a===ia)if(o=i.get("WEBGL_compressed_texture_etc"),o!==null){if(a===ea||a===ta)return m===Ye?o.COMPRESSED_SRGB8_ETC2:o.COMPRESSED_RGB8_ETC2;if(a===ia)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:o.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(a===aa||a===ra||a===na||a===oa||a===sa||a===la||a===ca||a===da||a===ua||a===fa||a===pa||a===ma||a===ha||a===_a)if(o=i.get("WEBGL_compressed_texture_astc"),o!==null){if(a===aa)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:o.COMPRESSED_RGBA_ASTC_4x4_KHR;if(a===ra)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:o.COMPRESSED_RGBA_ASTC_5x4_KHR;if(a===na)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:o.COMPRESSED_RGBA_ASTC_5x5_KHR;if(a===oa)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:o.COMPRESSED_RGBA_ASTC_6x5_KHR;if(a===sa)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:o.COMPRESSED_RGBA_ASTC_6x6_KHR;if(a===la)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:o.COMPRESSED_RGBA_ASTC_8x5_KHR;if(a===ca)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:o.COMPRESSED_RGBA_ASTC_8x6_KHR;if(a===da)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:o.COMPRESSED_RGBA_ASTC_8x8_KHR;if(a===ua)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:o.COMPRESSED_RGBA_ASTC_10x5_KHR;if(a===fa)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:o.COMPRESSED_RGBA_ASTC_10x6_KHR;if(a===pa)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:o.COMPRESSED_RGBA_ASTC_10x8_KHR;if(a===ma)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:o.COMPRESSED_RGBA_ASTC_10x10_KHR;if(a===ha)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:o.COMPRESSED_RGBA_ASTC_12x10_KHR;if(a===_a)return m===Ye?o.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:o.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(a===ga||a===va||a===Ea)if(o=i.get("EXT_texture_compression_bptc"),o!==null){if(a===ga)return m===Ye?o.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:o.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(a===va)return o.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(a===Ea)return o.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(a===Sa||a===Ma||a===Ta||a===xa)if(o=i.get("EXT_texture_compression_rgtc"),o!==null){if(a===Sa)return o.COMPRESSED_RED_RGTC1_EXT;if(a===Ma)return o.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(a===Ta)return o.COMPRESSED_RED_GREEN_RGTC2_EXT;if(a===xa)return o.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return a===$t?e.UNSIGNED_INT_24_8:e[a]!==void 0?e[a]:null}return{convert:t}}const Ld=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Ud=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;class Dd{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(i,t){if(this.texture===null){const a=new cr(i.texture);(i.depthNear!==t.depthNear||i.depthFar!==t.depthFar)&&(this.depthNear=i.depthNear,this.depthFar=i.depthFar),this.texture=a}}getMesh(i){if(this.texture!==null&&this.mesh===null){const t=i.cameras[0].viewport,a=new It({vertexShader:Ld,fragmentShader:Ud,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new xt(new dr(20,20),a)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class wd extends Or{constructor(i,t){super();const a=this;let l=null,o=1,m=null,d="local-floor",P=1,v=null,L=null,R=null,E=null,T=null,F=null;const U=typeof XRWebGLBinding<"u",c=new Dd,r={},D=t.getContextAttributes();let C=null,g=null;const O=[],b=[],w=new ct;let V=null;const p=new ni;p.viewport=new lt;const u=new ni;u.viewport=new lt;const x=[p,u],N=new Fr;let q=null,K=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(z){let Y=O[z];return Y===void 0&&(Y=new vi,O[z]=Y),Y.getTargetRaySpace()},this.getControllerGrip=function(z){let Y=O[z];return Y===void 0&&(Y=new vi,O[z]=Y),Y.getGripSpace()},this.getHand=function(z){let Y=O[z];return Y===void 0&&(Y=new vi,O[z]=Y),Y.getHandSpace()};function Z(z){const Y=b.indexOf(z.inputSource);if(Y===-1)return;const fe=O[Y];fe!==void 0&&(fe.update(z.inputSource,z.frame,v||m),fe.dispatchEvent({type:z.type,data:z.inputSource}))}function k(){l.removeEventListener("select",Z),l.removeEventListener("selectstart",Z),l.removeEventListener("selectend",Z),l.removeEventListener("squeeze",Z),l.removeEventListener("squeezestart",Z),l.removeEventListener("squeezeend",Z),l.removeEventListener("end",k),l.removeEventListener("inputsourceschange",ie);for(let z=0;z<O.length;z++){const Y=b[z];Y!==null&&(b[z]=null,O[z].disconnect(Y))}q=null,K=null,c.reset();for(const z in r)delete r[z];i.setRenderTarget(C),T=null,E=null,R=null,l=null,g=null,Ge.stop(),a.isPresenting=!1,i.setPixelRatio(V),i.setSize(w.width,w.height,!1),a.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(z){o=z,a.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(z){d=z,a.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return v||m},this.setReferenceSpace=function(z){v=z},this.getBaseLayer=function(){return E!==null?E:T},this.getBinding=function(){return R===null&&U&&(R=new XRWebGLBinding(l,t)),R},this.getFrame=function(){return F},this.getSession=function(){return l},this.setSession=async function(z){if(l=z,l!==null){if(C=i.getRenderTarget(),l.addEventListener("select",Z),l.addEventListener("selectstart",Z),l.addEventListener("selectend",Z),l.addEventListener("squeeze",Z),l.addEventListener("squeezestart",Z),l.addEventListener("squeezeend",Z),l.addEventListener("end",k),l.addEventListener("inputsourceschange",ie),D.xrCompatible!==!0&&await t.makeXRCompatible(),V=i.getPixelRatio(),i.getSize(w),U&&"createProjectionLayer"in XRWebGLBinding.prototype){let Y=null,fe=null,be=null;D.depth&&(be=D.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,Y=D.stencil?ci:Vi,fe=D.stencil?$t:Jt);const Ee={colorFormat:t.RGBA8,depthFormat:be,scaleFactor:o};R=this.getBinding(),E=R.createProjectionLayer(Ee),l.updateRenderState({layers:[E]}),i.setPixelRatio(1),i.setSize(E.textureWidth,E.textureHeight,!1),g=new Gt(E.textureWidth,E.textureHeight,{format:Tt,type:yt,depthTexture:new ar(E.textureWidth,E.textureHeight,fe,void 0,void 0,void 0,void 0,void 0,void 0,Y),stencilBuffer:D.stencil,colorSpace:i.outputColorSpace,samples:D.antialias?4:0,resolveDepthBuffer:E.ignoreDepthValues===!1,resolveStencilBuffer:E.ignoreDepthValues===!1})}else{const Y={antialias:D.antialias,alpha:!0,depth:D.depth,stencil:D.stencil,framebufferScaleFactor:o};T=new XRWebGLLayer(l,t,Y),l.updateRenderState({baseLayer:T}),i.setPixelRatio(1),i.setSize(T.framebufferWidth,T.framebufferHeight,!1),g=new Gt(T.framebufferWidth,T.framebufferHeight,{format:Tt,type:yt,colorSpace:i.outputColorSpace,stencilBuffer:D.stencil,resolveDepthBuffer:T.ignoreDepthValues===!1,resolveStencilBuffer:T.ignoreDepthValues===!1})}g.isXRRenderTarget=!0,this.setFoveation(P),v=null,m=await l.requestReferenceSpace(d),Ge.setContext(l),Ge.start(),a.isPresenting=!0,a.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(l!==null)return l.environmentBlendMode},this.getDepthTexture=function(){return c.getDepthTexture()};function ie(z){for(let Y=0;Y<z.removed.length;Y++){const fe=z.removed[Y],be=b.indexOf(fe);be>=0&&(b[be]=null,O[be].disconnect(fe))}for(let Y=0;Y<z.added.length;Y++){const fe=z.added[Y];let be=b.indexOf(fe);if(be===-1){for(let Me=0;Me<O.length;Me++)if(Me>=b.length){b.push(fe),be=Me;break}else if(b[Me]===null){b[Me]=fe,be=Me;break}if(be===-1)break}const Ee=O[be];Ee&&Ee.connect(fe)}}const H=new Ve,se=new Ve;function Ce(z,Y,fe){H.setFromMatrixPosition(Y.matrixWorld),se.setFromMatrixPosition(fe.matrixWorld);const be=H.distanceTo(se),Ee=Y.projectionMatrix.elements,Me=fe.projectionMatrix.elements,ke=Ee[14]/(Ee[10]-1),h=Ee[14]/(Ee[10]+1),ye=(Ee[9]+1)/Ee[5],we=(Ee[9]-1)/Ee[5],He=(Ee[8]-1)/Ee[0],ve=(Me[8]+1)/Me[0],Ke=ke*He,pe=ke*ve,Le=be/(-He+ve),rt=Le*-He;if(Y.matrixWorld.decompose(z.position,z.quaternion,z.scale),z.translateX(rt),z.translateZ(Le),z.matrixWorld.compose(z.position,z.quaternion,z.scale),z.matrixWorldInverse.copy(z.matrixWorld).invert(),Ee[10]===-1)z.projectionMatrix.copy(Y.projectionMatrix),z.projectionMatrixInverse.copy(Y.projectionMatrixInverse);else{const Qe=ke+Le,f=h+Le,n=Ke-rt,A=pe+(be-rt),B=ye*h/f*Qe,X=we*h/f*Qe;z.projectionMatrix.makePerspective(n,A,B,X,Qe,f),z.projectionMatrixInverse.copy(z.projectionMatrix).invert()}}function Be(z,Y){Y===null?z.matrixWorld.copy(z.matrix):z.matrixWorld.multiplyMatrices(Y.matrixWorld,z.matrix),z.matrixWorldInverse.copy(z.matrixWorld).invert()}this.updateCamera=function(z){if(l===null)return;let Y=z.near,fe=z.far;c.texture!==null&&(c.depthNear>0&&(Y=c.depthNear),c.depthFar>0&&(fe=c.depthFar)),N.near=u.near=p.near=Y,N.far=u.far=p.far=fe,(q!==N.near||K!==N.far)&&(l.updateRenderState({depthNear:N.near,depthFar:N.far}),q=N.near,K=N.far),N.layers.mask=z.layers.mask|6,p.layers.mask=N.layers.mask&3,u.layers.mask=N.layers.mask&5;const be=z.parent,Ee=N.cameras;Be(N,be);for(let Me=0;Me<Ee.length;Me++)Be(Ee[Me],be);Ee.length===2?Ce(N,p,u):N.projectionMatrix.copy(p.projectionMatrix),Oe(z,N,be)};function Oe(z,Y,fe){fe===null?z.matrix.copy(Y.matrixWorld):(z.matrix.copy(fe.matrixWorld),z.matrix.invert(),z.matrix.multiply(Y.matrixWorld)),z.matrix.decompose(z.position,z.quaternion,z.scale),z.updateMatrixWorld(!0),z.projectionMatrix.copy(Y.projectionMatrix),z.projectionMatrixInverse.copy(Y.projectionMatrixInverse),z.isPerspectiveCamera&&(z.fov=Br*2*Math.atan(1/z.projectionMatrix.elements[5]),z.zoom=1)}this.getCamera=function(){return N},this.getFoveation=function(){if(!(E===null&&T===null))return P},this.setFoveation=function(z){P=z,E!==null&&(E.fixedFoveation=z),T!==null&&T.fixedFoveation!==void 0&&(T.fixedFoveation=z)},this.hasDepthSensing=function(){return c.texture!==null},this.getDepthSensingMesh=function(){return c.getMesh(N)},this.getCameraTexture=function(z){return r[z]};let Je=null;function $e(z,Y){if(L=Y.getViewerPose(v||m),F=Y,L!==null){const fe=L.views;T!==null&&(i.setRenderTargetFramebuffer(g,T.framebuffer),i.setRenderTarget(g));let be=!1;fe.length!==N.cameras.length&&(N.cameras.length=0,be=!0);for(let Me=0;Me<fe.length;Me++){const ke=fe[Me];let h=null;if(T!==null)h=T.getViewport(ke);else{const we=R.getViewSubImage(E,ke);h=we.viewport,Me===0&&(i.setRenderTargetTextures(g,we.colorTexture,we.depthStencilTexture),i.setRenderTarget(g))}let ye=x[Me];ye===void 0&&(ye=new ni,ye.layers.enable(Me),ye.viewport=new lt,x[Me]=ye),ye.matrix.fromArray(ke.transform.matrix),ye.matrix.decompose(ye.position,ye.quaternion,ye.scale),ye.projectionMatrix.fromArray(ke.projectionMatrix),ye.projectionMatrixInverse.copy(ye.projectionMatrix).invert(),ye.viewport.set(h.x,h.y,h.width,h.height),Me===0&&(N.matrix.copy(ye.matrix),N.matrix.decompose(N.position,N.quaternion,N.scale)),be===!0&&N.cameras.push(ye)}const Ee=l.enabledFeatures;if(Ee&&Ee.includes("depth-sensing")&&l.depthUsage=="gpu-optimized"&&U){R=a.getBinding();const Me=R.getDepthInformation(fe[0]);Me&&Me.isValid&&Me.texture&&c.init(Me,l.renderState)}if(Ee&&Ee.includes("camera-access")&&U){i.state.unbindTexture(),R=a.getBinding();for(let Me=0;Me<fe.length;Me++){const ke=fe[Me].camera;if(ke){let h=r[ke];h||(h=new cr,r[ke]=h);const ye=R.getCameraImage(ke);h.sourceTexture=ye}}}}for(let fe=0;fe<O.length;fe++){const be=b[fe],Ee=O[fe];be!==null&&Ee!==void 0&&Ee.update(be,Y,v||m)}Je&&Je(z,Y),Y.detectedPlanes&&a.dispatchEvent({type:"planesdetected",data:Y}),F=null}const Ge=new Er;Ge.setAnimationLoop($e),this.setAnimationLoop=function(z){Je=z},this.dispose=function(){}}}const Pt=new gr,yd=new qt;function Id(e,i){function t(c,r){c.matrixAutoUpdate===!0&&c.updateMatrix(),r.value.copy(c.matrix)}function a(c,r){r.color.getRGB(c.fogColor.value,_r(e)),r.isFog?(c.fogNear.value=r.near,c.fogFar.value=r.far):r.isFogExp2&&(c.fogDensity.value=r.density)}function l(c,r,D,C,g){r.isMeshBasicMaterial||r.isMeshLambertMaterial?o(c,r):r.isMeshToonMaterial?(o(c,r),R(c,r)):r.isMeshPhongMaterial?(o(c,r),L(c,r)):r.isMeshStandardMaterial?(o(c,r),E(c,r),r.isMeshPhysicalMaterial&&T(c,r,g)):r.isMeshMatcapMaterial?(o(c,r),F(c,r)):r.isMeshDepthMaterial?o(c,r):r.isMeshDistanceMaterial?(o(c,r),U(c,r)):r.isMeshNormalMaterial?o(c,r):r.isLineBasicMaterial?(m(c,r),r.isLineDashedMaterial&&d(c,r)):r.isPointsMaterial?P(c,r,D,C):r.isSpriteMaterial?v(c,r):r.isShadowMaterial?(c.color.value.copy(r.color),c.opacity.value=r.opacity):r.isShaderMaterial&&(r.uniformsNeedUpdate=!1)}function o(c,r){c.opacity.value=r.opacity,r.color&&c.diffuse.value.copy(r.color),r.emissive&&c.emissive.value.copy(r.emissive).multiplyScalar(r.emissiveIntensity),r.map&&(c.map.value=r.map,t(r.map,c.mapTransform)),r.alphaMap&&(c.alphaMap.value=r.alphaMap,t(r.alphaMap,c.alphaMapTransform)),r.bumpMap&&(c.bumpMap.value=r.bumpMap,t(r.bumpMap,c.bumpMapTransform),c.bumpScale.value=r.bumpScale,r.side===pt&&(c.bumpScale.value*=-1)),r.normalMap&&(c.normalMap.value=r.normalMap,t(r.normalMap,c.normalMapTransform),c.normalScale.value.copy(r.normalScale),r.side===pt&&c.normalScale.value.negate()),r.displacementMap&&(c.displacementMap.value=r.displacementMap,t(r.displacementMap,c.displacementMapTransform),c.displacementScale.value=r.displacementScale,c.displacementBias.value=r.displacementBias),r.emissiveMap&&(c.emissiveMap.value=r.emissiveMap,t(r.emissiveMap,c.emissiveMapTransform)),r.specularMap&&(c.specularMap.value=r.specularMap,t(r.specularMap,c.specularMapTransform)),r.alphaTest>0&&(c.alphaTest.value=r.alphaTest);const D=i.get(r),C=D.envMap,g=D.envMapRotation;C&&(c.envMap.value=C,Pt.copy(g),Pt.x*=-1,Pt.y*=-1,Pt.z*=-1,C.isCubeTexture&&C.isRenderTargetTexture===!1&&(Pt.y*=-1,Pt.z*=-1),c.envMapRotation.value.setFromMatrix4(yd.makeRotationFromEuler(Pt)),c.flipEnvMap.value=C.isCubeTexture&&C.isRenderTargetTexture===!1?-1:1,c.reflectivity.value=r.reflectivity,c.ior.value=r.ior,c.refractionRatio.value=r.refractionRatio),r.lightMap&&(c.lightMap.value=r.lightMap,c.lightMapIntensity.value=r.lightMapIntensity,t(r.lightMap,c.lightMapTransform)),r.aoMap&&(c.aoMap.value=r.aoMap,c.aoMapIntensity.value=r.aoMapIntensity,t(r.aoMap,c.aoMapTransform))}function m(c,r){c.diffuse.value.copy(r.color),c.opacity.value=r.opacity,r.map&&(c.map.value=r.map,t(r.map,c.mapTransform))}function d(c,r){c.dashSize.value=r.dashSize,c.totalSize.value=r.dashSize+r.gapSize,c.scale.value=r.scale}function P(c,r,D,C){c.diffuse.value.copy(r.color),c.opacity.value=r.opacity,c.size.value=r.size*D,c.scale.value=C*.5,r.map&&(c.map.value=r.map,t(r.map,c.uvTransform)),r.alphaMap&&(c.alphaMap.value=r.alphaMap,t(r.alphaMap,c.alphaMapTransform)),r.alphaTest>0&&(c.alphaTest.value=r.alphaTest)}function v(c,r){c.diffuse.value.copy(r.color),c.opacity.value=r.opacity,c.rotation.value=r.rotation,r.map&&(c.map.value=r.map,t(r.map,c.mapTransform)),r.alphaMap&&(c.alphaMap.value=r.alphaMap,t(r.alphaMap,c.alphaMapTransform)),r.alphaTest>0&&(c.alphaTest.value=r.alphaTest)}function L(c,r){c.specular.value.copy(r.specular),c.shininess.value=Math.max(r.shininess,1e-4)}function R(c,r){r.gradientMap&&(c.gradientMap.value=r.gradientMap)}function E(c,r){c.metalness.value=r.metalness,r.metalnessMap&&(c.metalnessMap.value=r.metalnessMap,t(r.metalnessMap,c.metalnessMapTransform)),c.roughness.value=r.roughness,r.roughnessMap&&(c.roughnessMap.value=r.roughnessMap,t(r.roughnessMap,c.roughnessMapTransform)),r.envMap&&(c.envMapIntensity.value=r.envMapIntensity)}function T(c,r,D){c.ior.value=r.ior,r.sheen>0&&(c.sheenColor.value.copy(r.sheenColor).multiplyScalar(r.sheen),c.sheenRoughness.value=r.sheenRoughness,r.sheenColorMap&&(c.sheenColorMap.value=r.sheenColorMap,t(r.sheenColorMap,c.sheenColorMapTransform)),r.sheenRoughnessMap&&(c.sheenRoughnessMap.value=r.sheenRoughnessMap,t(r.sheenRoughnessMap,c.sheenRoughnessMapTransform))),r.clearcoat>0&&(c.clearcoat.value=r.clearcoat,c.clearcoatRoughness.value=r.clearcoatRoughness,r.clearcoatMap&&(c.clearcoatMap.value=r.clearcoatMap,t(r.clearcoatMap,c.clearcoatMapTransform)),r.clearcoatRoughnessMap&&(c.clearcoatRoughnessMap.value=r.clearcoatRoughnessMap,t(r.clearcoatRoughnessMap,c.clearcoatRoughnessMapTransform)),r.clearcoatNormalMap&&(c.clearcoatNormalMap.value=r.clearcoatNormalMap,t(r.clearcoatNormalMap,c.clearcoatNormalMapTransform),c.clearcoatNormalScale.value.copy(r.clearcoatNormalScale),r.side===pt&&c.clearcoatNormalScale.value.negate())),r.dispersion>0&&(c.dispersion.value=r.dispersion),r.iridescence>0&&(c.iridescence.value=r.iridescence,c.iridescenceIOR.value=r.iridescenceIOR,c.iridescenceThicknessMinimum.value=r.iridescenceThicknessRange[0],c.iridescenceThicknessMaximum.value=r.iridescenceThicknessRange[1],r.iridescenceMap&&(c.iridescenceMap.value=r.iridescenceMap,t(r.iridescenceMap,c.iridescenceMapTransform)),r.iridescenceThicknessMap&&(c.iridescenceThicknessMap.value=r.iridescenceThicknessMap,t(r.iridescenceThicknessMap,c.iridescenceThicknessMapTransform))),r.transmission>0&&(c.transmission.value=r.transmission,c.transmissionSamplerMap.value=D.texture,c.transmissionSamplerSize.value.set(D.width,D.height),r.transmissionMap&&(c.transmissionMap.value=r.transmissionMap,t(r.transmissionMap,c.transmissionMapTransform)),c.thickness.value=r.thickness,r.thicknessMap&&(c.thicknessMap.value=r.thicknessMap,t(r.thicknessMap,c.thicknessMapTransform)),c.attenuationDistance.value=r.attenuationDistance,c.attenuationColor.value.copy(r.attenuationColor)),r.anisotropy>0&&(c.anisotropyVector.value.set(r.anisotropy*Math.cos(r.anisotropyRotation),r.anisotropy*Math.sin(r.anisotropyRotation)),r.anisotropyMap&&(c.anisotropyMap.value=r.anisotropyMap,t(r.anisotropyMap,c.anisotropyMapTransform))),c.specularIntensity.value=r.specularIntensity,c.specularColor.value.copy(r.specularColor),r.specularColorMap&&(c.specularColorMap.value=r.specularColorMap,t(r.specularColorMap,c.specularColorMapTransform)),r.specularIntensityMap&&(c.specularIntensityMap.value=r.specularIntensityMap,t(r.specularIntensityMap,c.specularIntensityMapTransform))}function F(c,r){r.matcap&&(c.matcap.value=r.matcap)}function U(c,r){const D=i.get(r).light;c.referencePosition.value.setFromMatrixPosition(D.matrixWorld),c.nearDistance.value=D.shadow.camera.near,c.farDistance.value=D.shadow.camera.far}return{refreshFogUniforms:a,refreshMaterialUniforms:l}}function Nd(e,i,t,a){let l={},o={},m=[];const d=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function P(D,C){const g=C.program;a.uniformBlockBinding(D,g)}function v(D,C){let g=l[D.id];g===void 0&&(F(D),g=L(D),l[D.id]=g,D.addEventListener("dispose",c));const O=C.program;a.updateUBOMapping(D,O);const b=i.render.frame;o[D.id]!==b&&(E(D),o[D.id]=b)}function L(D){const C=R();D.__bindingPointIndex=C;const g=e.createBuffer(),O=D.__size,b=D.usage;return e.bindBuffer(e.UNIFORM_BUFFER,g),e.bufferData(e.UNIFORM_BUFFER,O,b),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,C,g),g}function R(){for(let D=0;D<d;D++)if(m.indexOf(D)===-1)return m.push(D),D;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function E(D){const C=l[D.id],g=D.uniforms,O=D.__cache;e.bindBuffer(e.UNIFORM_BUFFER,C);for(let b=0,w=g.length;b<w;b++){const V=Array.isArray(g[b])?g[b]:[g[b]];for(let p=0,u=V.length;p<u;p++){const x=V[p];if(T(x,b,p,O)===!0){const N=x.__offset,q=Array.isArray(x.value)?x.value:[x.value];let K=0;for(let Z=0;Z<q.length;Z++){const k=q[Z],ie=U(k);typeof k=="number"||typeof k=="boolean"?(x.__data[0]=k,e.bufferSubData(e.UNIFORM_BUFFER,N+K,x.__data)):k.isMatrix3?(x.__data[0]=k.elements[0],x.__data[1]=k.elements[1],x.__data[2]=k.elements[2],x.__data[3]=0,x.__data[4]=k.elements[3],x.__data[5]=k.elements[4],x.__data[6]=k.elements[5],x.__data[7]=0,x.__data[8]=k.elements[6],x.__data[9]=k.elements[7],x.__data[10]=k.elements[8],x.__data[11]=0):(k.toArray(x.__data,K),K+=ie.storage/Float32Array.BYTES_PER_ELEMENT)}e.bufferSubData(e.UNIFORM_BUFFER,N,x.__data)}}}e.bindBuffer(e.UNIFORM_BUFFER,null)}function T(D,C,g,O){const b=D.value,w=C+"_"+g;if(O[w]===void 0)return typeof b=="number"||typeof b=="boolean"?O[w]=b:O[w]=b.clone(),!0;{const V=O[w];if(typeof b=="number"||typeof b=="boolean"){if(V!==b)return O[w]=b,!0}else if(V.equals(b)===!1)return V.copy(b),!0}return!1}function F(D){const C=D.uniforms;let g=0;const O=16;for(let w=0,V=C.length;w<V;w++){const p=Array.isArray(C[w])?C[w]:[C[w]];for(let u=0,x=p.length;u<x;u++){const N=p[u],q=Array.isArray(N.value)?N.value:[N.value];for(let K=0,Z=q.length;K<Z;K++){const k=q[K],ie=U(k),H=g%O,se=H%ie.boundary,Ce=H+se;g+=se,Ce!==0&&O-Ce<ie.storage&&(g+=O-Ce),N.__data=new Float32Array(ie.storage/Float32Array.BYTES_PER_ELEMENT),N.__offset=g,g+=ie.storage}}}const b=g%O;return b>0&&(g+=O-b),D.__size=g,D.__cache={},this}function U(D){const C={boundary:0,storage:0};return typeof D=="number"||typeof D=="boolean"?(C.boundary=4,C.storage=4):D.isVector2?(C.boundary=8,C.storage=8):D.isVector3||D.isColor?(C.boundary=16,C.storage=12):D.isVector4?(C.boundary=16,C.storage=16):D.isMatrix3?(C.boundary=48,C.storage=48):D.isMatrix4?(C.boundary=64,C.storage=64):D.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",D),C}function c(D){const C=D.target;C.removeEventListener("dispose",c);const g=m.indexOf(C.__bindingPointIndex);m.splice(g,1),e.deleteBuffer(l[C.id]),delete l[C.id],delete o[C.id]}function r(){for(const D in l)e.deleteBuffer(l[D]);m=[],l={},o={}}return{bind:P,update:v,dispose:r}}class Fd{constructor(i={}){const{canvas:t=Ur(),context:a=null,depth:l=!0,stencil:o=!1,alpha:m=!1,antialias:d=!1,premultipliedAlpha:P=!0,preserveDrawingBuffer:v=!1,powerPreference:L="default",failIfMajorPerformanceCaveat:R=!1,reversedDepthBuffer:E=!1}=i;this.isWebGLRenderer=!0;let T;if(a!==null){if(typeof WebGLRenderingContext<"u"&&a instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");T=a.getContextAttributes().alpha}else T=m;const F=new Uint32Array(4),U=new Int32Array(4);let c=null,r=null;const D=[],C=[];this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=Rt,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const g=this;let O=!1;this._outputColorSpace=Dr;let b=0,w=0,V=null,p=-1,u=null;const x=new lt,N=new lt;let q=null;const K=new qe(0);let Z=0,k=t.width,ie=t.height,H=1,se=null,Ce=null;const Be=new lt(0,0,k,ie),Oe=new lt(0,0,k,ie);let Je=!1;const $e=new tr;let Ge=!1,z=!1;const Y=new qt,fe=new Ve,be=new lt,Ee={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let Me=!1;function ke(){return V===null?H:1}let h=a;function ye(s,M){return t.getContext(s,M)}try{const s={alpha:!0,depth:l,stencil:o,antialias:d,premultipliedAlpha:P,preserveDrawingBuffer:v,powerPreference:L,failIfMajorPerformanceCaveat:R};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${wr}`),t.addEventListener("webglcontextlost",te,!1),t.addEventListener("webglcontextrestored",me,!1),t.addEventListener("webglcontextcreationerror",$,!1),h===null){const M="webgl2";if(h=ye(M,s),h===null)throw ye(M)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(s){throw console.error("THREE.WebGLRenderer: "+s.message),s}let we,He,ve,Ke,pe,Le,rt,Qe,f,n,A,B,X,G,Se,ee,ge,le,J,ne,Pe,he,re,De;function _(){we=new Yl(h),we.init(),he=new Pd(h,we),He=new Hl(h,we,i,he),ve=new bd(h,we),He.reversedDepthBuffer&&E&&ve.buffers.depth.setReversed(!0),Ke=new jl(h),pe=new pd,Le=new Cd(h,we,ve,pe,He,he,Ke),rt=new Vl(g),Qe=new Xl(g),f=new eo(h),re=new Fl(h,f),n=new Kl(h,f,Ke,re),A=new $l(h,n,f,Ke),J=new Zl(h,He,Le),ee=new Gl(pe),B=new fd(g,rt,Qe,we,He,re,ee),X=new Id(g,pe),G=new hd,Se=new Md(we),le=new Ol(g,rt,Qe,ve,A,T,P),ge=new Rd(g,A,He),De=new Nd(h,Ke,He,ve),ne=new Bl(h,we,Ke),Pe=new ql(h,we,Ke),Ke.programs=B.programs,g.capabilities=He,g.extensions=we,g.properties=pe,g.renderLists=G,g.shadowMap=ge,g.state=ve,g.info=Ke}_();const Q=new wd(g,h);this.xr=Q,this.getContext=function(){return h},this.getContextAttributes=function(){return h.getContextAttributes()},this.forceContextLoss=function(){const s=we.get("WEBGL_lose_context");s&&s.loseContext()},this.forceContextRestore=function(){const s=we.get("WEBGL_lose_context");s&&s.restoreContext()},this.getPixelRatio=function(){return H},this.setPixelRatio=function(s){s!==void 0&&(H=s,this.setSize(k,ie,!1))},this.getSize=function(s){return s.set(k,ie)},this.setSize=function(s,M,y=!0){if(Q.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}k=s,ie=M,t.width=Math.floor(s*H),t.height=Math.floor(M*H),y===!0&&(t.style.width=s+"px",t.style.height=M+"px"),this.setViewport(0,0,s,M)},this.getDrawingBufferSize=function(s){return s.set(k*H,ie*H).floor()},this.setDrawingBufferSize=function(s,M,y){k=s,ie=M,H=y,t.width=Math.floor(s*y),t.height=Math.floor(M*y),this.setViewport(0,0,s,M)},this.getCurrentViewport=function(s){return s.copy(x)},this.getViewport=function(s){return s.copy(Be)},this.setViewport=function(s,M,y,I){s.isVector4?Be.set(s.x,s.y,s.z,s.w):Be.set(s,M,y,I),ve.viewport(x.copy(Be).multiplyScalar(H).round())},this.getScissor=function(s){return s.copy(Oe)},this.setScissor=function(s,M,y,I){s.isVector4?Oe.set(s.x,s.y,s.z,s.w):Oe.set(s,M,y,I),ve.scissor(N.copy(Oe).multiplyScalar(H).round())},this.getScissorTest=function(){return Je},this.setScissorTest=function(s){ve.setScissorTest(Je=s)},this.setOpaqueSort=function(s){se=s},this.setTransparentSort=function(s){Ce=s},this.getClearColor=function(s){return s.copy(le.getClearColor())},this.setClearColor=function(){le.setClearColor(...arguments)},this.getClearAlpha=function(){return le.getClearAlpha()},this.setClearAlpha=function(){le.setClearAlpha(...arguments)},this.clear=function(s=!0,M=!0,y=!0){let I=0;if(s){let S=!1;if(V!==null){const j=V.texture.format;S=j===mr||j===pr||j===fr}if(S){const j=V.texture.type,oe=j===yt||j===Jt||j===ui||j===$t||j===sr||j===lr,ce=le.getClearColor(),de=le.getClearAlpha(),xe=ce.r,Ae=ce.g,Re=ce.b;oe?(F[0]=xe,F[1]=Ae,F[2]=Re,F[3]=de,h.clearBufferuiv(h.COLOR,0,F)):(U[0]=xe,U[1]=Ae,U[2]=Re,U[3]=de,h.clearBufferiv(h.COLOR,0,U))}else I|=h.COLOR_BUFFER_BIT}M&&(I|=h.DEPTH_BUFFER_BIT),y&&(I|=h.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),h.clear(I)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener("webglcontextlost",te,!1),t.removeEventListener("webglcontextrestored",me,!1),t.removeEventListener("webglcontextcreationerror",$,!1),le.dispose(),G.dispose(),Se.dispose(),pe.dispose(),rt.dispose(),Qe.dispose(),A.dispose(),re.dispose(),De.dispose(),B.dispose(),Q.dispose(),Q.removeEventListener("sessionstart",_t),Q.removeEventListener("sessionend",Wi),At.stop()};function te(s){s.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),O=!0}function me(){console.log("THREE.WebGLRenderer: Context Restored."),O=!1;const s=Ke.autoReset,M=ge.enabled,y=ge.autoUpdate,I=ge.needsUpdate,S=ge.type;_(),Ke.autoReset=s,ge.enabled=M,ge.autoUpdate=y,ge.needsUpdate=I,ge.type=S}function $(s){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",s.statusMessage)}function W(s){const M=s.target;M.removeEventListener("dispose",W),ue(M)}function ue(s){Te(s),pe.remove(s)}function Te(s){const M=pe.get(s).programs;M!==void 0&&(M.forEach(function(y){B.releaseProgram(y)}),s.isShaderMaterial&&B.releaseShaderCache(s))}this.renderBufferDirect=function(s,M,y,I,S,j){M===null&&(M=Ee);const oe=S.isMesh&&S.matrixWorld.determinant()<0,ce=Rr(s,M,y,I,S);ve.setMaterial(I,oe);let de=y.index,xe=1;if(I.wireframe===!0){if(de=n.getWireframeAttribute(y),de===void 0)return;xe=2}const Ae=y.drawRange,Re=y.attributes.position;let Ie=Ae.start*xe,ze=(Ae.start+Ae.count)*xe;j!==null&&(Ie=Math.max(Ie,j.start*xe),ze=Math.min(ze,(j.start+j.count)*xe)),de!==null?(Ie=Math.max(Ie,0),ze=Math.min(ze,de.count)):Re!=null&&(Ie=Math.max(Ie,0),ze=Math.min(ze,Re.count));const Xe=ze-Ie;if(Xe<0||Xe===1/0)return;re.setup(S,I,ce,y,de);let je,We=ne;if(de!==null&&(je=f.get(de),We=Pe,We.setIndex(je)),S.isMesh)I.wireframe===!0?(ve.setLineWidth(I.wireframeLinewidth*ke()),We.setMode(h.LINES)):We.setMode(h.TRIANGLES);else if(S.isLine){let _e=I.linewidth;_e===void 0&&(_e=1),ve.setLineWidth(_e*ke()),S.isLineSegments?We.setMode(h.LINES):S.isLineLoop?We.setMode(h.LINE_LOOP):We.setMode(h.LINE_STRIP)}else S.isPoints?We.setMode(h.POINTS):S.isSprite&&We.setMode(h.TRIANGLES);if(S.isBatchedMesh)if(S._multiDrawInstances!==null)Ui("THREE.WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection."),We.renderMultiDrawInstances(S._multiDrawStarts,S._multiDrawCounts,S._multiDrawCount,S._multiDrawInstances);else if(we.get("WEBGL_multi_draw"))We.renderMultiDraw(S._multiDrawStarts,S._multiDrawCounts,S._multiDrawCount);else{const _e=S._multiDrawStarts,nt=S._multiDrawCounts,Et=S._multiDrawCount,mt=de?f.get(de).bytesPerElement:1,Nt=pe.get(I).currentProgram.getUniforms();for(let dt=0;dt<Et;dt++)Nt.setValue(h,"_gl_DrawID",dt),We.render(_e[dt]/mt,nt[dt])}else if(S.isInstancedMesh)We.renderInstances(Ie,Xe,S.count);else if(y.isInstancedBufferGeometry){const _e=y._maxInstanceCount!==void 0?y._maxInstanceCount:1/0,nt=Math.min(y.instanceCount,_e);We.renderInstances(Ie,Xe,nt)}else We.render(Ie,Xe)};function tt(s,M,y){s.transparent===!0&&s.side===Mt&&s.forceSinglePass===!1?(s.side=pt,s.needsUpdate=!0,ei(s,M,y),s.side=jt,s.needsUpdate=!0,ei(s,M,y),s.side=Mt):ei(s,M,y)}this.compile=function(s,M,y=null){y===null&&(y=s),r=Se.get(y),r.init(M),C.push(r),y.traverseVisible(function(S){S.isLight&&S.layers.test(M.layers)&&(r.pushLight(S),S.castShadow&&r.pushShadow(S))}),s!==y&&s.traverseVisible(function(S){S.isLight&&S.layers.test(M.layers)&&(r.pushLight(S),S.castShadow&&r.pushShadow(S))}),r.setupLights();const I=new Set;return s.traverse(function(S){if(!(S.isMesh||S.isPoints||S.isLine||S.isSprite))return;const j=S.material;if(j)if(Array.isArray(j))for(let oe=0;oe<j.length;oe++){const ce=j[oe];tt(ce,y,S),I.add(ce)}else tt(j,y,S),I.add(j)}),r=C.pop(),I},this.compileAsync=function(s,M,y=null){const I=this.compile(s,M,y);return new Promise(S=>{function j(){if(I.forEach(function(oe){pe.get(oe).currentProgram.isReady()&&I.delete(oe)}),I.size===0){S(s);return}setTimeout(j,10)}we.get("KHR_parallel_shader_compile")!==null?j():setTimeout(j,10)})};let Fe=null;function vt(s){Fe&&Fe(s)}function _t(){At.stop()}function Wi(){At.start()}const At=new Er;At.setAnimationLoop(vt),typeof self<"u"&&At.setContext(self),this.setAnimationLoop=function(s){Fe=s,Q.setAnimationLoop(s),s===null?At.stop():At.start()},Q.addEventListener("sessionstart",_t),Q.addEventListener("sessionend",Wi),this.render=function(s,M){if(M!==void 0&&M.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(O===!0)return;if(s.matrixWorldAutoUpdate===!0&&s.updateMatrixWorld(),M.parent===null&&M.matrixWorldAutoUpdate===!0&&M.updateMatrixWorld(),Q.enabled===!0&&Q.isPresenting===!0&&(Q.cameraAutoUpdate===!0&&Q.updateCamera(M),M=Q.getCamera()),s.isScene===!0&&s.onBeforeRender(g,s,M,V),r=Se.get(s,C.length),r.init(M),C.push(r),Y.multiplyMatrices(M.projectionMatrix,M.matrixWorldInverse),$e.setFromProjectionMatrix(Y,ji,M.reversedDepth),z=this.localClippingEnabled,Ge=ee.init(this.clippingPlanes,z),c=G.get(s,D.length),c.init(),D.push(c),Q.enabled===!0&&Q.isPresenting===!0){const j=g.xr.getDepthSensingMesh();j!==null&&_i(j,M,-1/0,g.sortObjects)}_i(s,M,0,g.sortObjects),c.finish(),g.sortObjects===!0&&c.sort(se,Ce),Me=Q.enabled===!1||Q.isPresenting===!1||Q.hasDepthSensing()===!1,Me&&le.addToRenderList(c,s),this.info.render.frame++,Ge===!0&&ee.beginShadows();const y=r.state.shadowsArray;ge.render(y,s,M),Ge===!0&&ee.endShadows(),this.info.autoReset===!0&&this.info.reset();const I=c.opaque,S=c.transmissive;if(r.setupLights(),M.isArrayCamera){const j=M.cameras;if(S.length>0)for(let oe=0,ce=j.length;oe<ce;oe++){const de=j[oe];Xi(I,S,s,de)}Me&&le.render(s);for(let oe=0,ce=j.length;oe<ce;oe++){const de=j[oe];ki(c,s,de,de.viewport)}}else S.length>0&&Xi(I,S,s,M),Me&&le.render(s),ki(c,s,M);V!==null&&w===0&&(Le.updateMultisampleRenderTarget(V),Le.updateRenderTargetMipmap(V)),s.isScene===!0&&s.onAfterRender(g,s,M),re.resetDefaultState(),p=-1,u=null,C.pop(),C.length>0?(r=C[C.length-1],Ge===!0&&ee.setGlobalState(g.clippingPlanes,r.state.camera)):r=null,D.pop(),D.length>0?c=D[D.length-1]:c=null};function _i(s,M,y,I){if(s.visible===!1)return;if(s.layers.test(M.layers)){if(s.isGroup)y=s.renderOrder;else if(s.isLOD)s.autoUpdate===!0&&s.update(M);else if(s.isLight)r.pushLight(s),s.castShadow&&r.pushShadow(s);else if(s.isSprite){if(!s.frustumCulled||$e.intersectsSprite(s)){I&&be.setFromMatrixPosition(s.matrixWorld).applyMatrix4(Y);const j=A.update(s),oe=s.material;oe.visible&&c.push(s,j,oe,y,be.z,null)}}else if((s.isMesh||s.isLine||s.isPoints)&&(!s.frustumCulled||$e.intersectsObject(s))){const j=A.update(s),oe=s.material;if(I&&(s.boundingSphere!==void 0?(s.boundingSphere===null&&s.computeBoundingSphere(),be.copy(s.boundingSphere.center)):(j.boundingSphere===null&&j.computeBoundingSphere(),be.copy(j.boundingSphere.center)),be.applyMatrix4(s.matrixWorld).applyMatrix4(Y)),Array.isArray(oe)){const ce=j.groups;for(let de=0,xe=ce.length;de<xe;de++){const Ae=ce[de],Re=oe[Ae.materialIndex];Re&&Re.visible&&c.push(s,j,Re,y,be.z,Ae)}}else oe.visible&&c.push(s,j,oe,y,be.z,null)}}const S=s.children;for(let j=0,oe=S.length;j<oe;j++)_i(S[j],M,y,I)}function ki(s,M,y,I){const S=s.opaque,j=s.transmissive,oe=s.transparent;r.setupLightsView(y),Ge===!0&&ee.setGlobalState(g.clippingPlanes,y),I&&ve.viewport(x.copy(I)),S.length>0&&Qt(S,M,y),j.length>0&&Qt(j,M,y),oe.length>0&&Qt(oe,M,y),ve.buffers.depth.setTest(!0),ve.buffers.depth.setMask(!0),ve.buffers.color.setMask(!0),ve.setPolygonOffset(!1)}function Xi(s,M,y,I){if((y.isScene===!0?y.overrideMaterial:null)!==null)return;r.state.transmissionRenderTarget[I.id]===void 0&&(r.state.transmissionRenderTarget[I.id]=new Gt(1,1,{generateMipmaps:!0,type:we.has("EXT_color_buffer_half_float")||we.has("EXT_color_buffer_float")?fi:yt,minFilter:Xt,samples:4,stencilBuffer:o,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:et.workingColorSpace}));const S=r.state.transmissionRenderTarget[I.id],j=I.viewport||x;S.setSize(j.z*g.transmissionResolutionScale,j.w*g.transmissionResolutionScale);const oe=g.getRenderTarget(),ce=g.getActiveCubeFace(),de=g.getActiveMipmapLevel();g.setRenderTarget(S),g.getClearColor(K),Z=g.getClearAlpha(),Z<1&&g.setClearColor(16777215,.5),g.clear(),Me&&le.render(y);const xe=g.toneMapping;g.toneMapping=Rt;const Ae=I.viewport;if(I.viewport!==void 0&&(I.viewport=void 0),r.setupLightsView(I),Ge===!0&&ee.setGlobalState(g.clippingPlanes,I),Qt(s,y,I),Le.updateMultisampleRenderTarget(S),Le.updateRenderTargetMipmap(S),we.has("WEBGL_multisampled_render_to_texture")===!1){let Re=!1;for(let Ie=0,ze=M.length;Ie<ze;Ie++){const Xe=M[Ie],je=Xe.object,We=Xe.geometry,_e=Xe.material,nt=Xe.group;if(_e.side===Mt&&je.layers.test(I.layers)){const Et=_e.side;_e.side=pt,_e.needsUpdate=!0,Yi(je,y,I,We,_e,nt),_e.side=Et,_e.needsUpdate=!0,Re=!0}}Re===!0&&(Le.updateMultisampleRenderTarget(S),Le.updateRenderTargetMipmap(S))}g.setRenderTarget(oe,ce,de),g.setClearColor(K,Z),Ae!==void 0&&(I.viewport=Ae),g.toneMapping=xe}function Qt(s,M,y){const I=M.isScene===!0?M.overrideMaterial:null;for(let S=0,j=s.length;S<j;S++){const oe=s[S],ce=oe.object,de=oe.geometry,xe=oe.group;let Ae=oe.material;Ae.allowOverride===!0&&I!==null&&(Ae=I),ce.layers.test(y.layers)&&Yi(ce,M,y,de,Ae,xe)}}function Yi(s,M,y,I,S,j){s.onBeforeRender(g,M,y,I,S,j),s.modelViewMatrix.multiplyMatrices(y.matrixWorldInverse,s.matrixWorld),s.normalMatrix.getNormalMatrix(s.modelViewMatrix),S.onBeforeRender(g,M,y,I,s,j),S.transparent===!0&&S.side===Mt&&S.forceSinglePass===!1?(S.side=pt,S.needsUpdate=!0,g.renderBufferDirect(y,M,I,S,s,j),S.side=jt,S.needsUpdate=!0,g.renderBufferDirect(y,M,I,S,s,j),S.side=Mt):g.renderBufferDirect(y,M,I,S,s,j),s.onAfterRender(g,M,y,I,S,j)}function ei(s,M,y){M.isScene!==!0&&(M=Ee);const I=pe.get(s),S=r.state.lights,j=r.state.shadowsArray,oe=S.state.version,ce=B.getParameters(s,S.state,j,M,y),de=B.getProgramCacheKey(ce);let xe=I.programs;I.environment=s.isMeshStandardMaterial?M.environment:null,I.fog=M.fog,I.envMap=(s.isMeshStandardMaterial?Qe:rt).get(s.envMap||I.environment),I.envMapRotation=I.environment!==null&&s.envMap===null?M.environmentRotation:s.envMapRotation,xe===void 0&&(s.addEventListener("dispose",W),xe=new Map,I.programs=xe);let Ae=xe.get(de);if(Ae!==void 0){if(I.currentProgram===Ae&&I.lightsStateVersion===oe)return qi(s,ce),Ae}else ce.uniforms=B.getUniforms(s),s.onBeforeCompile(ce,g),Ae=B.acquireProgram(ce,de),xe.set(de,Ae),I.uniforms=ce.uniforms;const Re=I.uniforms;return(!s.isShaderMaterial&&!s.isRawShaderMaterial||s.clipping===!0)&&(Re.clippingPlanes=ee.uniform),qi(s,ce),I.needsLights=br(s),I.lightsStateVersion=oe,I.needsLights&&(Re.ambientLightColor.value=S.state.ambient,Re.lightProbe.value=S.state.probe,Re.directionalLights.value=S.state.directional,Re.directionalLightShadows.value=S.state.directionalShadow,Re.spotLights.value=S.state.spot,Re.spotLightShadows.value=S.state.spotShadow,Re.rectAreaLights.value=S.state.rectArea,Re.ltc_1.value=S.state.rectAreaLTC1,Re.ltc_2.value=S.state.rectAreaLTC2,Re.pointLights.value=S.state.point,Re.pointLightShadows.value=S.state.pointShadow,Re.hemisphereLights.value=S.state.hemi,Re.directionalShadowMap.value=S.state.directionalShadowMap,Re.directionalShadowMatrix.value=S.state.directionalShadowMatrix,Re.spotShadowMap.value=S.state.spotShadowMap,Re.spotLightMatrix.value=S.state.spotLightMatrix,Re.spotLightMap.value=S.state.spotLightMap,Re.pointShadowMap.value=S.state.pointShadowMap,Re.pointShadowMatrix.value=S.state.pointShadowMatrix),I.currentProgram=Ae,I.uniformsList=null,Ae}function Ki(s){if(s.uniformsList===null){const M=s.currentProgram.getUniforms();s.uniformsList=li.seqWithValue(M.seq,s.uniforms)}return s.uniformsList}function qi(s,M){const y=pe.get(s);y.outputColorSpace=M.outputColorSpace,y.batching=M.batching,y.batchingColor=M.batchingColor,y.instancing=M.instancing,y.instancingColor=M.instancingColor,y.instancingMorph=M.instancingMorph,y.skinning=M.skinning,y.morphTargets=M.morphTargets,y.morphNormals=M.morphNormals,y.morphColors=M.morphColors,y.morphTargetsCount=M.morphTargetsCount,y.numClippingPlanes=M.numClippingPlanes,y.numIntersection=M.numClipIntersection,y.vertexAlphas=M.vertexAlphas,y.vertexTangents=M.vertexTangents,y.toneMapping=M.toneMapping}function Rr(s,M,y,I,S){M.isScene!==!0&&(M=Ee),Le.resetTextureUnits();const j=M.fog,oe=I.isMeshStandardMaterial?M.environment:null,ce=V===null?g.outputColorSpace:V.isXRRenderTarget===!0?V.texture.colorSpace:pi,de=(I.isMeshStandardMaterial?Qe:rt).get(I.envMap||oe),xe=I.vertexColors===!0&&!!y.attributes.color&&y.attributes.color.itemSize===4,Ae=!!y.attributes.tangent&&(!!I.normalMap||I.anisotropy>0),Re=!!y.morphAttributes.position,Ie=!!y.morphAttributes.normal,ze=!!y.morphAttributes.color;let Xe=Rt;I.toneMapped&&(V===null||V.isXRRenderTarget===!0)&&(Xe=g.toneMapping);const je=y.morphAttributes.position||y.morphAttributes.normal||y.morphAttributes.color,We=je!==void 0?je.length:0,_e=pe.get(I),nt=r.state.lights;if(Ge===!0&&(z===!0||s!==u)){const ot=s===u&&I.id===p;ee.setState(I,s,ot)}let Et=!1;I.version===_e.__version?(_e.needsLights&&_e.lightsStateVersion!==nt.state.version||_e.outputColorSpace!==ce||S.isBatchedMesh&&_e.batching===!1||!S.isBatchedMesh&&_e.batching===!0||S.isBatchedMesh&&_e.batchingColor===!0&&S.colorTexture===null||S.isBatchedMesh&&_e.batchingColor===!1&&S.colorTexture!==null||S.isInstancedMesh&&_e.instancing===!1||!S.isInstancedMesh&&_e.instancing===!0||S.isSkinnedMesh&&_e.skinning===!1||!S.isSkinnedMesh&&_e.skinning===!0||S.isInstancedMesh&&_e.instancingColor===!0&&S.instanceColor===null||S.isInstancedMesh&&_e.instancingColor===!1&&S.instanceColor!==null||S.isInstancedMesh&&_e.instancingMorph===!0&&S.morphTexture===null||S.isInstancedMesh&&_e.instancingMorph===!1&&S.morphTexture!==null||_e.envMap!==de||I.fog===!0&&_e.fog!==j||_e.numClippingPlanes!==void 0&&(_e.numClippingPlanes!==ee.numPlanes||_e.numIntersection!==ee.numIntersection)||_e.vertexAlphas!==xe||_e.vertexTangents!==Ae||_e.morphTargets!==Re||_e.morphNormals!==Ie||_e.morphColors!==ze||_e.toneMapping!==Xe||_e.morphTargetsCount!==We)&&(Et=!0):(Et=!0,_e.__version=I.version);let mt=_e.currentProgram;Et===!0&&(mt=ei(I,M,S));let Nt=!1,dt=!1,Wt=!1;const Ze=mt.getUniforms(),ut=_e.uniforms;if(ve.useProgram(mt.program)&&(Nt=!0,dt=!0,Wt=!0),I.id!==p&&(p=I.id,dt=!0),Nt||u!==s){ve.buffers.depth.getReversed()&&s.reversedDepth!==!0&&(s._reversedDepth=!0,s.updateProjectionMatrix()),Ze.setValue(h,"projectionMatrix",s.projectionMatrix),Ze.setValue(h,"viewMatrix",s.matrixWorldInverse);const ot=Ze.map.cameraPosition;ot!==void 0&&ot.setValue(h,fe.setFromMatrixPosition(s.matrixWorld)),He.logarithmicDepthBuffer&&Ze.setValue(h,"logDepthBufFC",2/(Math.log(s.far+1)/Math.LN2)),(I.isMeshPhongMaterial||I.isMeshToonMaterial||I.isMeshLambertMaterial||I.isMeshBasicMaterial||I.isMeshStandardMaterial||I.isShaderMaterial)&&Ze.setValue(h,"isOrthographic",s.isOrthographicCamera===!0),u!==s&&(u=s,dt=!0,Wt=!0)}if(S.isSkinnedMesh){Ze.setOptional(h,S,"bindMatrix"),Ze.setOptional(h,S,"bindMatrixInverse");const ot=S.skeleton;ot&&(ot.boneTexture===null&&ot.computeBoneTexture(),Ze.setValue(h,"boneTexture",ot.boneTexture,Le))}S.isBatchedMesh&&(Ze.setOptional(h,S,"batchingTexture"),Ze.setValue(h,"batchingTexture",S._matricesTexture,Le),Ze.setOptional(h,S,"batchingIdTexture"),Ze.setValue(h,"batchingIdTexture",S._indirectTexture,Le),Ze.setOptional(h,S,"batchingColorTexture"),S._colorsTexture!==null&&Ze.setValue(h,"batchingColorTexture",S._colorsTexture,Le));const ft=y.morphAttributes;if((ft.position!==void 0||ft.normal!==void 0||ft.color!==void 0)&&J.update(S,y,mt),(dt||_e.receiveShadow!==S.receiveShadow)&&(_e.receiveShadow=S.receiveShadow,Ze.setValue(h,"receiveShadow",S.receiveShadow)),I.isMeshGouraudMaterial&&I.envMap!==null&&(ut.envMap.value=de,ut.flipEnvMap.value=de.isCubeTexture&&de.isRenderTargetTexture===!1?-1:1),I.isMeshStandardMaterial&&I.envMap===null&&M.environment!==null&&(ut.envMapIntensity.value=M.environmentIntensity),dt&&(Ze.setValue(h,"toneMappingExposure",g.toneMappingExposure),_e.needsLights&&Ar(ut,Wt),j&&I.fog===!0&&X.refreshFogUniforms(ut,j),X.refreshMaterialUniforms(ut,I,H,ie,r.state.transmissionRenderTarget[s.id]),li.upload(h,Ki(_e),ut,Le)),I.isShaderMaterial&&I.uniformsNeedUpdate===!0&&(li.upload(h,Ki(_e),ut,Le),I.uniformsNeedUpdate=!1),I.isSpriteMaterial&&Ze.setValue(h,"center",S.center),Ze.setValue(h,"modelViewMatrix",S.modelViewMatrix),Ze.setValue(h,"normalMatrix",S.normalMatrix),Ze.setValue(h,"modelMatrix",S.matrixWorld),I.isShaderMaterial||I.isRawShaderMaterial){const ot=I.uniformsGroups;for(let ht=0,gi=ot.length;ht<gi;ht++){const bt=ot[ht];De.update(bt,mt),De.bind(bt,mt)}}return mt}function Ar(s,M){s.ambientLightColor.needsUpdate=M,s.lightProbe.needsUpdate=M,s.directionalLights.needsUpdate=M,s.directionalLightShadows.needsUpdate=M,s.pointLights.needsUpdate=M,s.pointLightShadows.needsUpdate=M,s.spotLights.needsUpdate=M,s.spotLightShadows.needsUpdate=M,s.rectAreaLights.needsUpdate=M,s.hemisphereLights.needsUpdate=M}function br(s){return s.isMeshLambertMaterial||s.isMeshToonMaterial||s.isMeshPhongMaterial||s.isMeshStandardMaterial||s.isShadowMaterial||s.isShaderMaterial&&s.lights===!0}this.getActiveCubeFace=function(){return b},this.getActiveMipmapLevel=function(){return w},this.getRenderTarget=function(){return V},this.setRenderTargetTextures=function(s,M,y){const I=pe.get(s);I.__autoAllocateDepthBuffer=s.resolveDepthBuffer===!1,I.__autoAllocateDepthBuffer===!1&&(I.__useRenderToTexture=!1),pe.get(s.texture).__webglTexture=M,pe.get(s.depthTexture).__webglTexture=I.__autoAllocateDepthBuffer?void 0:y,I.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(s,M){const y=pe.get(s);y.__webglFramebuffer=M,y.__useDefaultFramebuffer=M===void 0};const Cr=h.createFramebuffer();this.setRenderTarget=function(s,M=0,y=0){V=s,b=M,w=y;let I=!0,S=null,j=!1,oe=!1;if(s){const ce=pe.get(s);if(ce.__useDefaultFramebuffer!==void 0)ve.bindFramebuffer(h.FRAMEBUFFER,null),I=!1;else if(ce.__webglFramebuffer===void 0)Le.setupRenderTarget(s);else if(ce.__hasExternalTextures)Le.rebindTextures(s,pe.get(s.texture).__webglTexture,pe.get(s.depthTexture).__webglTexture);else if(s.depthBuffer){const Ae=s.depthTexture;if(ce.__boundDepthTexture!==Ae){if(Ae!==null&&pe.has(Ae)&&(s.width!==Ae.image.width||s.height!==Ae.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");Le.setupDepthRenderbuffer(s)}}const de=s.texture;(de.isData3DTexture||de.isDataArrayTexture||de.isCompressedArrayTexture)&&(oe=!0);const xe=pe.get(s).__webglFramebuffer;s.isWebGLCubeRenderTarget?(Array.isArray(xe[M])?S=xe[M][y]:S=xe[M],j=!0):s.samples>0&&Le.useMultisampledRTT(s)===!1?S=pe.get(s).__webglMultisampledFramebuffer:Array.isArray(xe)?S=xe[y]:S=xe,x.copy(s.viewport),N.copy(s.scissor),q=s.scissorTest}else x.copy(Be).multiplyScalar(H).floor(),N.copy(Oe).multiplyScalar(H).floor(),q=Je;if(y!==0&&(S=Cr),ve.bindFramebuffer(h.FRAMEBUFFER,S)&&I&&ve.drawBuffers(s,S),ve.viewport(x),ve.scissor(N),ve.setScissorTest(q),j){const ce=pe.get(s.texture);h.framebufferTexture2D(h.FRAMEBUFFER,h.COLOR_ATTACHMENT0,h.TEXTURE_CUBE_MAP_POSITIVE_X+M,ce.__webglTexture,y)}else if(oe){const ce=M;for(let de=0;de<s.textures.length;de++){const xe=pe.get(s.textures[de]);h.framebufferTextureLayer(h.FRAMEBUFFER,h.COLOR_ATTACHMENT0+de,xe.__webglTexture,y,ce)}}else if(s!==null&&y!==0){const ce=pe.get(s.texture);h.framebufferTexture2D(h.FRAMEBUFFER,h.COLOR_ATTACHMENT0,h.TEXTURE_2D,ce.__webglTexture,y)}p=-1},this.readRenderTargetPixels=function(s,M,y,I,S,j,oe,ce=0){if(!(s&&s.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let de=pe.get(s).__webglFramebuffer;if(s.isWebGLCubeRenderTarget&&oe!==void 0&&(de=de[oe]),de){ve.bindFramebuffer(h.FRAMEBUFFER,de);try{const xe=s.textures[ce],Ae=xe.format,Re=xe.type;if(!He.textureFormatReadable(Ae)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!He.textureTypeReadable(Re)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}M>=0&&M<=s.width-I&&y>=0&&y<=s.height-S&&(s.textures.length>1&&h.readBuffer(h.COLOR_ATTACHMENT0+ce),h.readPixels(M,y,I,S,he.convert(Ae),he.convert(Re),j))}finally{const xe=V!==null?pe.get(V).__webglFramebuffer:null;ve.bindFramebuffer(h.FRAMEBUFFER,xe)}}},this.readRenderTargetPixelsAsync=async function(s,M,y,I,S,j,oe,ce=0){if(!(s&&s.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let de=pe.get(s).__webglFramebuffer;if(s.isWebGLCubeRenderTarget&&oe!==void 0&&(de=de[oe]),de)if(M>=0&&M<=s.width-I&&y>=0&&y<=s.height-S){ve.bindFramebuffer(h.FRAMEBUFFER,de);const xe=s.textures[ce],Ae=xe.format,Re=xe.type;if(!He.textureFormatReadable(Ae))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!He.textureTypeReadable(Re))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const Ie=h.createBuffer();h.bindBuffer(h.PIXEL_PACK_BUFFER,Ie),h.bufferData(h.PIXEL_PACK_BUFFER,j.byteLength,h.STREAM_READ),s.textures.length>1&&h.readBuffer(h.COLOR_ATTACHMENT0+ce),h.readPixels(M,y,I,S,he.convert(Ae),he.convert(Re),0);const ze=V!==null?pe.get(V).__webglFramebuffer:null;ve.bindFramebuffer(h.FRAMEBUFFER,ze);const Xe=h.fenceSync(h.SYNC_GPU_COMMANDS_COMPLETE,0);return h.flush(),await yr(h,Xe,4),h.bindBuffer(h.PIXEL_PACK_BUFFER,Ie),h.getBufferSubData(h.PIXEL_PACK_BUFFER,0,j),h.deleteBuffer(Ie),h.deleteSync(Xe),j}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(s,M=null,y=0){const I=Math.pow(2,-y),S=Math.floor(s.image.width*I),j=Math.floor(s.image.height*I),oe=M!==null?M.x:0,ce=M!==null?M.y:0;Le.setTexture2D(s,0),h.copyTexSubImage2D(h.TEXTURE_2D,y,0,0,oe,ce,S,j),ve.unbindTexture()};const Pr=h.createFramebuffer(),Lr=h.createFramebuffer();this.copyTextureToTexture=function(s,M,y=null,I=null,S=0,j=null){j===null&&(S!==0?(Ui("WebGLRenderer: copyTextureToTexture function signature has changed to support src and dst mipmap levels."),j=S,S=0):j=0);let oe,ce,de,xe,Ae,Re,Ie,ze,Xe;const je=s.isCompressedTexture?s.mipmaps[j]:s.image;if(y!==null)oe=y.max.x-y.min.x,ce=y.max.y-y.min.y,de=y.isBox3?y.max.z-y.min.z:1,xe=y.min.x,Ae=y.min.y,Re=y.isBox3?y.min.z:0;else{const ft=Math.pow(2,-S);oe=Math.floor(je.width*ft),ce=Math.floor(je.height*ft),s.isDataArrayTexture?de=je.depth:s.isData3DTexture?de=Math.floor(je.depth*ft):de=1,xe=0,Ae=0,Re=0}I!==null?(Ie=I.x,ze=I.y,Xe=I.z):(Ie=0,ze=0,Xe=0);const We=he.convert(M.format),_e=he.convert(M.type);let nt;M.isData3DTexture?(Le.setTexture3D(M,0),nt=h.TEXTURE_3D):M.isDataArrayTexture||M.isCompressedArrayTexture?(Le.setTexture2DArray(M,0),nt=h.TEXTURE_2D_ARRAY):(Le.setTexture2D(M,0),nt=h.TEXTURE_2D),h.pixelStorei(h.UNPACK_FLIP_Y_WEBGL,M.flipY),h.pixelStorei(h.UNPACK_PREMULTIPLY_ALPHA_WEBGL,M.premultiplyAlpha),h.pixelStorei(h.UNPACK_ALIGNMENT,M.unpackAlignment);const Et=h.getParameter(h.UNPACK_ROW_LENGTH),mt=h.getParameter(h.UNPACK_IMAGE_HEIGHT),Nt=h.getParameter(h.UNPACK_SKIP_PIXELS),dt=h.getParameter(h.UNPACK_SKIP_ROWS),Wt=h.getParameter(h.UNPACK_SKIP_IMAGES);h.pixelStorei(h.UNPACK_ROW_LENGTH,je.width),h.pixelStorei(h.UNPACK_IMAGE_HEIGHT,je.height),h.pixelStorei(h.UNPACK_SKIP_PIXELS,xe),h.pixelStorei(h.UNPACK_SKIP_ROWS,Ae),h.pixelStorei(h.UNPACK_SKIP_IMAGES,Re);const Ze=s.isDataArrayTexture||s.isData3DTexture,ut=M.isDataArrayTexture||M.isData3DTexture;if(s.isDepthTexture){const ft=pe.get(s),ot=pe.get(M),ht=pe.get(ft.__renderTarget),gi=pe.get(ot.__renderTarget);ve.bindFramebuffer(h.READ_FRAMEBUFFER,ht.__webglFramebuffer),ve.bindFramebuffer(h.DRAW_FRAMEBUFFER,gi.__webglFramebuffer);for(let bt=0;bt<de;bt++)Ze&&(h.framebufferTextureLayer(h.READ_FRAMEBUFFER,h.COLOR_ATTACHMENT0,pe.get(s).__webglTexture,S,Re+bt),h.framebufferTextureLayer(h.DRAW_FRAMEBUFFER,h.COLOR_ATTACHMENT0,pe.get(M).__webglTexture,j,Xe+bt)),h.blitFramebuffer(xe,Ae,oe,ce,Ie,ze,oe,ce,h.DEPTH_BUFFER_BIT,h.NEAREST);ve.bindFramebuffer(h.READ_FRAMEBUFFER,null),ve.bindFramebuffer(h.DRAW_FRAMEBUFFER,null)}else if(S!==0||s.isRenderTargetTexture||pe.has(s)){const ft=pe.get(s),ot=pe.get(M);ve.bindFramebuffer(h.READ_FRAMEBUFFER,Pr),ve.bindFramebuffer(h.DRAW_FRAMEBUFFER,Lr);for(let ht=0;ht<de;ht++)Ze?h.framebufferTextureLayer(h.READ_FRAMEBUFFER,h.COLOR_ATTACHMENT0,ft.__webglTexture,S,Re+ht):h.framebufferTexture2D(h.READ_FRAMEBUFFER,h.COLOR_ATTACHMENT0,h.TEXTURE_2D,ft.__webglTexture,S),ut?h.framebufferTextureLayer(h.DRAW_FRAMEBUFFER,h.COLOR_ATTACHMENT0,ot.__webglTexture,j,Xe+ht):h.framebufferTexture2D(h.DRAW_FRAMEBUFFER,h.COLOR_ATTACHMENT0,h.TEXTURE_2D,ot.__webglTexture,j),S!==0?h.blitFramebuffer(xe,Ae,oe,ce,Ie,ze,oe,ce,h.COLOR_BUFFER_BIT,h.NEAREST):ut?h.copyTexSubImage3D(nt,j,Ie,ze,Xe+ht,xe,Ae,oe,ce):h.copyTexSubImage2D(nt,j,Ie,ze,xe,Ae,oe,ce);ve.bindFramebuffer(h.READ_FRAMEBUFFER,null),ve.bindFramebuffer(h.DRAW_FRAMEBUFFER,null)}else ut?s.isDataTexture||s.isData3DTexture?h.texSubImage3D(nt,j,Ie,ze,Xe,oe,ce,de,We,_e,je.data):M.isCompressedArrayTexture?h.compressedTexSubImage3D(nt,j,Ie,ze,Xe,oe,ce,de,We,je.data):h.texSubImage3D(nt,j,Ie,ze,Xe,oe,ce,de,We,_e,je):s.isDataTexture?h.texSubImage2D(h.TEXTURE_2D,j,Ie,ze,oe,ce,We,_e,je.data):s.isCompressedTexture?h.compressedTexSubImage2D(h.TEXTURE_2D,j,Ie,ze,je.width,je.height,We,je.data):h.texSubImage2D(h.TEXTURE_2D,j,Ie,ze,oe,ce,We,_e,je);h.pixelStorei(h.UNPACK_ROW_LENGTH,Et),h.pixelStorei(h.UNPACK_IMAGE_HEIGHT,mt),h.pixelStorei(h.UNPACK_SKIP_PIXELS,Nt),h.pixelStorei(h.UNPACK_SKIP_ROWS,dt),h.pixelStorei(h.UNPACK_SKIP_IMAGES,Wt),j===0&&M.generateMipmaps&&h.generateMipmap(nt),ve.unbindTexture()},this.initRenderTarget=function(s){pe.get(s).__webglFramebuffer===void 0&&Le.setupRenderTarget(s)},this.initTexture=function(s){s.isCubeTexture?Le.setTextureCube(s,0):s.isData3DTexture?Le.setTexture3D(s,0):s.isDataArrayTexture||s.isCompressedArrayTexture?Le.setTexture2DArray(s,0):Le.setTexture2D(s,0),ve.unbindTexture()},this.resetState=function(){b=0,w=0,V=null,ve.reset(),re.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return ji}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(i){this._outputColorSpace=i;const t=this.getContext();t.drawingBufferColorSpace=et._getDrawingBufferColorSpace(i),t.unpackColorSpace=et._getUnpackColorSpace()}}export{Ia as P,Fd as W};
