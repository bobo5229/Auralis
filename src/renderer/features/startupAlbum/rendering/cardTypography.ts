import './cardTypography.css'
import { cardLayout } from './cardLayout'

export const cardTitleFamily =
  '"Auralis Card Title", "Auralis Desktop Lyrics SC", "SimSun", "Yu Mincho", serif'
export const cardArtistFamily =
  '"Auralis Card Signature", "Auralis Desktop Lyrics SC", "SimSun", "Yu Mincho", serif'

// Subtle same-colour reinforcement, in the card's logical print coordinates.
export const cardArtistStrokeWidth = 0.8

// Canvas textures do not repaint when a web font finishes loading. Load before
// measuring and rasterizing both the artwork and its glyph protection mask.
export async function loadCardFonts(title: string, artist: string): Promise<void> {
  await Promise.allSettled([
    document.fonts.load(`600 ${cardLayout.title.fontSize}px ${cardTitleFamily}`, title),
    document.fonts.load(`400 ${cardLayout.artist.fontSize}px ${cardArtistFamily}`, artist),
  ])
}
