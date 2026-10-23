# Third-party notices

## node-taglib-sharp

M4A metadata writes use **node-taglib-sharp 6.0.3** by Ben Russell, a Node.js port
of TagLib#. Upstream: <https://github.com/benrr101/node-taglib-sharp/tree/v6.0.3>.
License: LGPL-2.1-or-later; the complete license is included in the installed
package at `node_modules/node-taglib-sharp/LICENSE`. The package is used
unmodified, remains an external runtime dependency (not bundled into Auralis
code), and can be replaced with a compatible modified version. It edits only
disposable staging files; Auralis verifies tags before replacing an original.

## Startup album card fonts

The card bundles local WOFF2 editions of:

- **Bodoni Moda**, Copyright 2020 The Bodoni Moda Project Authors
  (<https://github.com/indestructible-type/Bodoni>), source commit
  `30ce6cdc354ef179a3b72ba0f0e71826e599348c`.
- **Allura**, Copyright 2010 The Allura Project Authors
  (<https://github.com/googlefonts/allura>), source commit
  `38a78b41510a10b1129c50fa5177b642bd2b4a19`.

Both are licensed under SIL Open Font License 1.1. Complete copyright and
license notices are in `src/renderer/assets/fonts/startup-album/*-OFL.txt`
and embedded in each bundled font's name-table license field. Outlines and
character coverage are unchanged; the original TTFs were compressed to WOFF2.

## georgedoescode/generative-utils

`src/renderer/features/startupAlbum/rendering/backgrounds/vendor/spline.ts` adapts the spline
path conversion from [`src/spline.js`](https://github.com/georgedoescode/generative-utils/blob/c26bbcfaecefd4f8302326c71fd18bfd8f413866/src/spline.js).
Source commit: `c26bbcfaecefd4f8302326c71fd18bfd8f413866`. The adaptation adds
TypeScript point tuples and omits unused callback and object-input support.
It is used by the startup album card's procedural backgrounds and their design prototype.

MIT License

Copyright (c) 2021 George Francis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## selop/pokebox

`src/renderer/features/startupAlbum/rendering/vendor/pokeboxFoil.ts` contains
formatting-adapted GLSL functions from `blend.glsl`, `rainbow.glsl`, `voronoi.glsl`
and `holo-shine.glsl` in [`selop/pokebox`](https://github.com/selop/pokebox/tree/7f6b1b4b6bb4684f80b49d1318b2a1c90a357b80/src/shaders/common).
`cardCoating.ts` adapts the crossed light-band composition from `regular-holo.frag`
at the same commit, `7f6b1b4b6bb4684f80b49d1318b2a1c90a357b80`.
The integration supplies local procedural masks, view-angle inputs, protected
metadata and one bounded display-space colour budget. No card artwork, external
foil textures, camera tracking or application dependencies are included.
The full notice below is also retained in the renderer module for built bundles.

MIT License

Copyright (c) 2026 Sergej Lopatkin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## jberg/butterchurn

`src/shared/audio/bassEnvelope.ts` adapts the attack/release smoothing and
frame-rate compensation from [`AudioLevels`](https://github.com/jberg/butterchurn/blob/99e69b35d315eea03954d75b5862f4e09212338b/src/audio/audioLevels.js)
at commit `99e69b35d315eea03954d75b5862f4e09212338b`.
The adaptation accepts linear low-band RMS, uses elapsed seconds, bounds
normalization gain, and returns zero for silence.

Copyright (c) 2013-2018 Jordan Berg

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## nikdelvin/liquid-glass

Earlier versions included a formatting-adapted port of the SVG displacement filter algorithm from
[`nikdelvin/liquid-glass`](https://github.com/nikdelvin/liquid-glass) at commit
`49251869805a117db87c70998e3f7b83719c690e`.

The unused implementation was removed on 2026-10-06. This notice is retained for historical attribution.

Copyright (c) 2025 Nikita Stadnik

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## SVG loading-to-success feedback — svg-loading and Segment

`SaveProgressIcon.vue` adapts the circular SVG geometry, loading sequence and
success stroke drawing from [jagjitgill/svg-loading](https://github.com/jagjitgill/svg-loading),
commit `edf7b8499754b7c23aa9ed3e5e7b656ea493ab61` (`dist/svg-loading.js`).
The Vue adapter adds cancellation, reduced-motion support, a short success hold
and unmount cleanup instead of the upstream DOM/button mutation layer.

`src/renderer/shared/feedback/vendor/segment.js` vendors
[lmgonzalves/segment](https://github.com/lmgonzalves/segment), version 1.1.3,
commit `dbd180703b1b94f6293688adaddda48b8d61b7e5` (`dist/segment.js`).
Only the UMD export wrapper is replaced by ESM; the SVG stroke animation engine
is unchanged. Both upstream projects use the MIT license.

MIT License

Copyright (c) 2017 Jag (svg-loading)

Copyright (c) 2015 Luis Manuel (Segment)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## n3r4zzurr0/svg-spinners — Blocks Wave

`PlayingIndicator.vue` and `animatePlaybackBlocks` adapt the geometry and timing from
[`svg-css/blocks-wave.svg`](https://github.com/n3r4zzurr0/svg-spinners/blob/main/svg-css/blocks-wave.svg).
The adaptation uses Web Animations transforms and adds playback, visibility and reduced-motion controls.

MIT License (MIT)

Copyright (c) Utkarsh Verma

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
