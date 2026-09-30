---
target: archive-heatmap-demo.html
total_score: 21
max_score: 32
na_heuristics: 5,9
p0_count: 0
p1_count: 2
target_identity: "file:D:\\VSCode\\Auralis\\archive-heatmap-demo-html"
timestamp: 2026-09-29T12-39-27Z
slug: archive-heatmap-demo-html
---
### Design Specificity Verdict
Highly specific and uniquely opinionated. The design fully commits to a skeuomorphic, cyberpunk/synthwave "hardware terminal" aesthetic. It escapes the "bland web" trap by using bespoke UI paradigms—tactical metal spines, CRT scanlines, and deep 3D-transformed floating panels.

The detector found 16 issues, primarily flagging the exact techniques used to build this aesthetic: 7 occurrences of dark-glow (zero-offset glowing shadows), a pulsing-dot (the terminal LED), a repeating-stripes-gradient (the left spine grip), and a codex-grid-background. While the detector flags these as "AI-slop," in this context they are deliberate, thematic successes. However, the detector also caught genuine quality issues that hurt the design: 3 instances of severe wide-tracking (up to 0.25em on body text) and 2 instances of cramped-padding where text crashes flush into the hardware borders.

### Overall Impression
An absolute visual triumph in terms of atmosphere and tactile feedback, but it currently sacrifices too much legibility and usability to maintain that aesthetic. The biggest opportunity is making the actual data readable without breaking the cyberpunk illusion.

### What's Working
1. Unapologetic Aesthetic Commitment: The skeuomorphic details (heavy metal printer head, rubber spine grip) combined with the CRT scanlines create a masterful, immersive atmosphere.
2. Tactile Micro-interactions: The Z-HUD pixel hover effect that scales up and glows, along with the text decoding animation, makes the interface feel incredibly alive and reactive.
3. Thematic Cohesion: The color profiles (MIAMI_SYNTH, CYBER_ACID, DEEP_CORE) instantly alter the mood without breaking the physical terminal metaphor.

### Priority Issues

**[P1] Legibility Crushed by Atmosphere (Typography & Contrast)**
*   **What:** Body text uses extreme letter-spacing (wide-tracking: 0.25em), tiny font sizes (8-10px), and low contrast (#76777b on dark gray), which is then obscured by a 60% opacity CRT overlay.
*   **Why it matters:** Users will strain to read the tracklist, stats, and metrics, defeating the purpose of a data dashboard.
*   **Fix:** Reduce CRT opacity slightly over text zones, remove the excessive letter-spacing from body/list text, bump minimum font sizes to 11px, and increase secondary text contrast.
*   **Suggested command:** $impeccable typeset

**[P1] Claustrophobic Data Containers (Cramped Padding)**
*   **What:** The detector found text flush against the borders in the right panel's .feeder-header and .feeder-footer. The central track list is also artificially restricted to a tiny scrollable box.
*   **Why it matters:** It makes the UI feel broken and visually suffocating. The hardware skeuomorphism is restricting the data view rather than framing it.
*   **Fix:** Add proper inset padding (12-16px) to the feeder headers/footers, and allow the inner .feeder-screen to expand dynamically or use a taller minimum height.
*   **Suggested command:** $impeccable layout

**[P2] Interaction Precision vs. 3D Perspective (Fitts's Law)**
*   **What:** The 14x14px heatmap cells in a dense 52x7 grid are hard to target, exacerbated by the 3D perspective (rotateX) of the Z-HUD mode.
*   **Why it matters:** Users will struggle to hover over a specific day accurately, leading to cursor slipping and frustrating misclicks.
*   **Fix:** Implement a larger invisible hit area around the pixels, or a "magnetic" hover state that snaps to the nearest cell when the mouse is nearby.
*   **Suggested command:** $impeccable adapt

**[P2] Information Hierarchy Distortion**
*   **What:** The decorative hardware elements (radar grid lines, metallic screws, spines) draw as much visual weight as the primary data itself.
*   **Why it matters:** The signal-to-noise ratio is too low; the interface is loud everywhere.
*   **Fix:** Tone down the contrast on the skeuomorphic hardware grooves and shadows slightly, allowing the glowing data (the heatmap and the tracklist) to be the brightest elements on screen.
*   **Suggested command:** $impeccable quieter

### Persona Red Flags
**Alex (Impatient Power User):**
*   No keyboard navigation detected for the heatmap grid.
*   Hovering over tiny individual pixels to see daily data is too slow; wants a way to scrub or aggregate the data quickly.

**Sam (Accessibility-Dependent User):**
*   The global cursor: crosshair and reliance on precise hover/click states for the heatmap completely break the experience for keyboard or touch-only users.
*   Contrast ratios for text heavily fail WCAG AA standards.

### Minor Observations
*   The tactical-spine rubber grip texture is a gorgeous detail, but it eats 38-48px of valuable horizontal space on the left panel.
*   The CSS color-mix() usage for the radar polygon is a great modern touch.
*   The Z-HUD flex overrides might cause the center heatmap to stretch awkwardly on ultrawide monitors due to the absolute positioning of the side panels.
