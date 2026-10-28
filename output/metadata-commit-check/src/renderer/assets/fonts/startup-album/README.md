# Startup album lettering

- `BodoniModa-variable.woff2`: title, weights 400–900, optical sizes 6–96. The card font-face fixes `opsz=18` to retain hairlines at its displayed size, independently of the larger Canvas drawing size.
  Source: `indestructible-type/Bodoni`, commit
  `30ce6cdc354ef179a3b72ba0f0e71826e599348c`,
  `fonts/variable/BodoniModa[opsz,wght].ttf`.
- `Allura-Regular.woff2`: artist signature, weight 400.
  Source: `googlefonts/allura`, commit
  `38a78b41510a10b1129c50fa5177b642bd2b4a19`, `fonts/ttf/Allura-Regular.ttf`.

Both use SIL OFL 1.1; complete notices are in the adjacent `*-OFL.txt` files.
Converted with FontTools to WOFF2 without subsetting or changing outlines.
The full corresponding OFL notice is embedded in each font's name ID 13 so
that bundled font files retain it. Chinese uses the existing GenRyuMin family;
missing characters use the system serif fallback.
