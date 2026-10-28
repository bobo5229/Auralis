# Third-party notices

## Three.js runtime

The prototype bundles the project's existing `three@0.180.0` dependency and its `SVGLoader`. It does not install another 3D library. The following notice is reproduced from `node_modules/three/LICENSE`.

```text
The MIT License

Copyright © 2010-2025 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## TinySDF distance transform

`distanceField.js` adapts the 1D/2D Euclidean distance transform from Mapbox TinySDF, revision `81da9d8c66bbaa55018296d00cc1f11755a0e004`. The input is a rasterized badge contour rather than text. Distances remain floating point for material deformation. No font rasterizer, package dependency, or WebGL renderer is imported.

- Source: <https://github.com/mapbox/tiny-sdf/blob/81da9d8c66bbaa55018296d00cc1f11755a0e004/index.js>
- License: <https://github.com/mapbox/tiny-sdf/blob/81da9d8c66bbaa55018296d00cc1f11755a0e004/LICENSE.txt>

```text
BSD-2-Clause
Copyright (c) 2016-2024 Mapbox, Inc.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS” AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Algorithm references without copied implementation

- [NormalMap-Online](https://github.com/cpetry/NormalMap-Online/blob/gh-pages/javascripts/shader/NormalMapShader.js), [MIT license](https://github.com/cpetry/NormalMap-Online/blob/gh-pages/LICENSE): reference for deriving normals from a height field. This demo independently computes central differences on a cached pressure envelope, using Canvas2D rather than the source's GLSL pipeline.
- [React Motion](https://github.com/chenglou/react-motion/blob/master/src/stepper.js), [MIT license](https://github.com/chenglou/react-motion/blob/master/LICENSE): reference for damped motion and stopping criteria. This demo independently uses a closed-form critically damped response, with faster compression and slower partial rebound to a retained impression, rather than the source's numerical stepper or React runtime.
