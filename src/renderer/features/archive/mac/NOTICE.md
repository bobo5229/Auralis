# image-q

The Mac archive cover pipeline uses image-q 4.0.0 in a Vite module Worker.
Palette generation (WuQuant), nearest-color mapping, Floyd–Steinberg and
Atkinson error diffusion are provided by image-q. See LICENSE for MIT terms.

Source: https://github.com/ibezkrovnyi/image-quantization

The fixed strength 0.65 maps to the library's minimum color-distance threshold
for dithering: `(1 - strength) * 0.2`; zero selects nearest-color mapping.
It does not blend original colors back into the output palette.

The worker is built with the player through `npm run build`; it requires no network access.
