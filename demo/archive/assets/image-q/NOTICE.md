# image-q

The cover filter demo bundles image-q 4.0.0 in a local Blob Worker.
Palette generation (WuQuant), nearest-color mapping, Floyd–Steinberg and
Atkinson error diffusion are provided by image-q. See LICENSE for MIT terms.

Source: https://github.com/ibezkrovnyi/image-quantization

The UI strength control maps to the library's minimum color-distance threshold
for dithering: `(1 - strength) * 0.2`; zero selects nearest-color mapping.
It does not blend original colors back into the output palette.

Build from workspace root: install image-q 4.0.0 into the isolated
`.electron-home/cover-filter-build` prefix, then run
`node demo/archive/cover-lofi-build.cjs` using the workspace's esbuild.
The built HTML + bundle and existing `demo/albums/cd-startup-assets.js`
run offline without the build dependencies.
