import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { statSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { openMpv } from './mpv-ipc.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    mpv: { type: 'string' },
    volume: { type: 'string', default: '20' },
  },
})
if (!values.mpv || positionals.length < 2)
  throw new Error(
    'Usage: node scripts/mpv-probe/listen.mjs --mpv <mpv.exe> [--volume 20] <track1> <track2> ...',
  )
function localFile(path) {
  const absolute = resolve(path)
  if (!statSync(absolute).isFile()) throw new Error(`Not a file: ${absolute}`)
  return absolute
}
const files = positionals.map(localFile)
const volume = Number(values.volume)
if (!Number.isFinite(volume) || volume < 0 || volume > 100) throw new Error('Volume must be 0..100')
const player = await openMpv(resolve(values.mpv), [
  '--gapless-audio=yes',
  '--replaygain=no',
  `--volume=${volume}`,
  '--pause=yes',
])
let input
try {
  await player.command('observe_property', 1, 'time-pos')
  await player.command('observe_property', 2, 'playlist-pos')
  for (const [index, file] of files.entries())
    await player.command('loadfile', file, index === 0 ? 'replace' : 'append')
  await player.waitForEvent('file-loaded')
  await player.command('set_property', 'pause', false)
  console.log('Playing via mpv, gapless=yes, no silence trimming or crossfade.')
  console.log(
    'Commands: p | next | prev | seek <seconds> | volume <0..100> | status | list | add <path> | remove <index> | move <from> <to> | q',
  )
  console.log('Playlist indices are zero-based. Stop Auralis playback before listening.')
  input = createInterface({ input: process.stdin, output: process.stdout })
  for await (const line of input) {
    const [action, ...args] = line.trim().split(/\s+/)
    if (action === 'q') break
    try {
      if (action === 'p') await player.command('cycle', 'pause')
      else if (action === 'next' || action === 'prev')
        await player.command(`playlist-${action}`, 'force')
      else if (action === 'seek' || action === 'volume') {
        const value = Number(args[0])
        if (!Number.isFinite(value) || value < 0 || (action === 'volume' && value > 100))
          throw new Error('Invalid value')
        if (action === 'seek') await player.command('seek', value, 'absolute+exact')
        else await player.command('set_property', 'volume', value)
      } else if (action === 'list') console.log(await player.command('get_property', 'playlist'))
      else if (action === 'add')
        await player.command(
          'loadfile',
          localFile(line.trim().slice(4).replace(/^"|"$/g, '')),
          'append',
        )
      else if (action === 'remove' || action === 'move') {
        const indices = args.map(Number)
        if (
          indices.length !== (action === 'move' ? 2 : 1) ||
          indices.some((i) => !Number.isInteger(i) || i < 0)
        )
          throw new Error('Invalid index')
        await player.command(`playlist-${action}`, ...indices)
      } else if (action !== 'status' && action) throw new Error('Unknown command')
      const status = {}
      for (const key of ['path', 'playlist-pos', 'time-pos', 'duration', 'pause'])
        status[key] = await player.command('get_property', key).catch((error) => String(error))
      console.log(status)
    } catch (error) {
      console.error(String(error))
    }
  }
} finally {
  input?.close()
  await player.close()
}
