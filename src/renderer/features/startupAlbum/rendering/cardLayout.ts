// Logical print coordinates, independent of the display's device pixel ratio.
export const cardLayout = {
  width: 720,
  height: 1032,
  cover: { x: 44, y: 210, size: 632 },
  header: { x: 44, y: 70, width: 632, height: 118 },
  footer: { x: 44, y: 866, width: 632, height: 76 },
  title: { fontSize: 54, compactFontSize: 48, centerY: 136, lineHeight: 56, inset: 16 },
  artist: { fontSize: 60, centerY: 910, inset: 16 },
  frame: { outerInset: 15, innerInset: 28, coverInset: 8 },
} as const
