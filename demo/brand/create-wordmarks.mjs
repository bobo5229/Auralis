// Original lettering sketches. Coordinates are authored here; no font outlines are used.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const rounded = [
  [58, 'M4 64 23 13Q27 4 31 13L50 64M13 43C21 34 28 51 35 42S43 38 45 42'],
  [47, 'M4 25V48Q4 64 18 64T34 48V25M34 48V64'],
  [35, 'M4 64V25M4 39Q10 22 25 26'],
  [47, 'M34 29Q26 20 15 25T4 45Q4 65 19 64T34 49M34 25V64'],
  [23, 'M5 8V55Q5 64 14 64'],
  [22, 'M7 28V64M7 12V13'],
  [39, 'M29 29Q13 18 5 30T16 44Q35 47 29 59T4 60'],
]
const geometric = [
  [58, 'M4 64 27 8 50 64M14 43H40'],
  [47, 'M4 25V53L14 64H25L35 53V25M35 53V64'],
  [35, 'M4 64V25M4 37 14 25H26'],
  [47, 'M35 25H15L4 36V53L15 64H25L35 53M35 25V64'],
  [24, 'M5 8V64H15'],
  [22, 'M7 28V64M7 10V14'],
  [40, 'M31 25H14L4 34V39L29 50V55L20 64H3'],
]
const electronic = [
  [60, 'M4 64 22 8H32L50 64M15 43H39'],
  [48, 'M4 25V53Q4 64 15 64H24Q35 64 35 53V25M35 56V64'],
  [37, 'M4 64V35Q4 25 14 25H26'],
  [49, 'M34 25H15Q4 25 4 36V53Q4 64 15 64H25Q35 64 35 53V37H19M35 55V64'],
  [25, 'M5 8V55Q5 64 16 64'],
  [24, 'M8 28V64M8 8V15'],
  [43, 'M32 25H14Q4 25 4 35Q4 44 15 44H21Q32 44 32 54Q32 64 22 64H3'],
]
const serif = [
  [63, 'M4 64 28 8 52 64M13 43H42M0 64H17M39 64H59'],
  [49, 'M6 25V51Q6 64 20 64Q35 64 35 48V25M35 48V64M1 25H12M30 25H41M35 64H43'],
  [37, 'M6 64V25M6 39Q13 21 28 26M0 25H6M0 64H15'],
  [47, 'M6 30Q25 17 33 30V64M33 40Q4 38 4 54Q4 69 21 63L33 54M33 64H40'],
  [26, 'M8 8V64M1 8H8M1 64H17'],
  [25, 'M8 28V64M1 28H8M1 64H16M8 12V13'],
  [42, 'M31 36V25M31 29Q14 17 6 30Q0 42 19 46T28 62Q16 70 4 59M4 54V65'],
]
const script = [
  [63, 'M0 63Q14 44 24 16Q32 -1 36 14L46 62Q49 69 57 57M10 47Q28 35 43 42'],
  [49, 'M3 31 0 50Q-2 67 12 63Q25 58 29 30L25 51Q23 71 42 55'],
  [40, 'M0 61 9 28Q5 44 16 34Q29 22 28 33Q27 40 20 42M20 42Q20 66 34 55'],
  [50, 'M35 31Q24 21 13 29Q-1 40 1 54Q4 69 19 60Q29 53 35 31L29 52Q27 70 44 55'],
  [30, 'M0 59Q14 42 18 17Q22 -2 12 10Q4 22 5 49Q4 72 24 55'],
  [26, 'M7 30 3 50Q0 70 20 55M11 14 12 12'],
  [43, 'M31 27Q13 19 7 31Q2 39 18 44Q35 50 21 61Q6 71 0 60M21 61Q31 64 38 55'],
]

const variants = [
  ['resonant', rounded, 7, 'round', ''],
  ['faceted', geometric, 9, 'butt', ''],
  ['editorial', serif, 2.8, 'round', 'serif'],
  ['flow', script, 4.7, 'round', ''],
  ['signal', electronic, 6, 'butt', ''],
]
for (const [id, glyphs, stroke, cap, detail] of variants) {
  let x = 12
  const letters = glyphs
    .map(([advance, d], index) => {
      const extra =
        detail === 'serif'
          ? [
              'M28 8 52 64',
              'M6 25V51',
              'M6 25V64',
              'M33 31V64',
              'M8 8V64',
              'M8 28V64',
              'M6 30Q0 42 19 46T28 62',
            ][index]
          : ''
      const node = `<g transform="translate(${x} 0)"><path d="${d}"/>${extra ? `<path d="${extra}" stroke-width="6.5"/>` : ''}</g>`
      x += advance
      return node
    })
    .join('\n    ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 3} 80" role="img" aria-labelledby="title">
  <title id="title">Auralis — ${id}</title>
  <g fill="none" stroke="#171c1a" stroke-width="${stroke}" stroke-linecap="${cap}" stroke-linejoin="${id === 'faceted' ? 'miter' : 'round'}">
    ${letters}
  </g>
</svg>\n`
  writeFileSync(fileURLToPath(new URL(`assets/wordmark-${id}.svg`, import.meta.url)), svg, 'utf8')
}
