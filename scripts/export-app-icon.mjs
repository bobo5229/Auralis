import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const iconDirectory = new URL('../resources/icons/', import.meta.url)
const mark = await readFile(new URL('auralis-mark.svg', iconDirectory), 'utf8')
const svgBody = /<svg\b[^>]*>([\s\S]*?)<\/svg>/.exec(mark)?.[1]
if (!svgBody || !/viewBox="0 0 64 64"/.test(mark)) {
  throw new Error('The Auralis brand mark must have a 64 × 64 viewBox.')
}

const paths = svgBody
  .replace(/<title>[\s\S]*?<\/title>/, '')
  .replace(/^ {2}/gm, '')
  .trim()
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none">
  <!-- Generated from auralis-mark.svg by scripts/export-app-icon.mjs. -->
  <rect x="48" y="48" width="928" height="928" rx="252" fill="#292B2D"/>
  <g transform="translate(128 128) scale(12)" color="#F3EEE6">
${paths
  .split('\n')
  .map((line) => `    ${line}`)
  .join('\n')}
  </g>
</svg>
`
const png = await sharp(Buffer.from(iconSvg)).png().toBuffer()

// ICO directory entries point to PNG payloads; 0 encodes a 256px dimension.
const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = await Promise.all(
  sizes.map((size) => sharp(png).resize(size, size).png().toBuffer()),
)
const directory = Buffer.alloc(6 + sizes.length * 16)
directory.writeUInt16LE(1, 2)
directory.writeUInt16LE(sizes.length, 4)
let offset = directory.length
sizes.forEach((size, index) => {
  const entry = 6 + index * 16
  directory.writeUInt8(size === 256 ? 0 : size, entry)
  directory.writeUInt8(size === 256 ? 0 : size, entry + 1)
  directory.writeUInt16LE(1, entry + 4)
  directory.writeUInt16LE(32, entry + 6)
  directory.writeUInt32LE(images[index].length, entry + 8)
  directory.writeUInt32LE(offset, entry + 12)
  offset += images[index].length
})

await writeFile(new URL('auralis-icon.svg', iconDirectory), iconSvg, 'utf8')
await writeFile(new URL('icon.png', iconDirectory), png)
await writeFile(new URL('icon.ico', iconDirectory), Buffer.concat([directory, ...images]))
console.log(`Exported ${fileURLToPath(iconDirectory)}: 1024px PNG; ICO ${sizes.join('/')}px`)
