# Rhine — Auralis immersive player

The MVP displays the **current album** in a repeating decorative archive. The array
is not a browser for the entire library. Playback remains owned by `usePlayback`.
Motion responds to play/pause and progress; it is not an audio spectrum analyser.

## Upstream

Scene code and models adapted from [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI),
commit `129553bce3496f3826ef343b539ca46d25b94852` (2026-10-02).
Copyright (c) 2026 LBEILC. MIT license is preserved in
`src/renderer/public/licenses/RhineLabUI.txt`, also shipped in the renderer build.

Imported: scene dependencies under `scene/` and both GLB files under `assets/`.
Auralis adaptations: display-only slots, local asset URLs, album sleeve, Auralis
label, asynchronous disposal guards, playback presentation and Vue lifecycle.
No upstream terminal audio, fonts, PWA, wallpaper host or archive text is imported.

Upstream's README expressly licenses author-created GLB models and Blender work
under MIT, but excludes Arknights names, marks, original visual designs and other
third-party rights, including their presentation inside models. The MIT license
does not grant those third-party rights. The overlay uses Auralis branding.

## Validation

Run the targeted lifecycle and route-loader unit tests, build/type checks, and an
isolated Electron renderer check. Inspect entry/reveal/return, rapid entry/exit,
late model and artwork loads, play/pause/seek/track changes, missing artwork,
empty playback, reduced motion, WebGL loss, resize and hidden-window suspension.
