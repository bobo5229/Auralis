import { openMpvClient } from './mpvClient'

/** mpv rebases some containers (e.g. MP3) but retains MP4's zero origin.
 * Query the actual demuxer instead of inferring behavior from an extension/tag.
 */
export async function readMpvTimestampOrigin(
  executable: string,
  path: string,
  signal: AbortSignal,
): Promise<number> {
  const lifetime = AbortSignal.any([signal, AbortSignal.timeout(10000)])
  let loaded!: () => void
  let failed!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => {
    loaded = resolve
    failed = reject
  })
  // Avoid an unhandled rejection if startup fails before awaiting the load.
  void ready.catch(() => undefined)
  const abort = () => failed(new Error('Transition timestamp query cancelled or timed out'))
  lifetime.addEventListener('abort', abort, { once: true })
  let client: Awaited<ReturnType<typeof openMpvClient>> | undefined
  try {
    lifetime.throwIfAborted()
    client = await openMpvClient(
      executable,
      (event) => {
        if (event.event === 'file-loaded') loaded()
        if (event.event === 'end-file' && event.reason === 'error')
          failed(new Error('Transition timestamp query failed'))
      },
      failed,
      lifetime,
      ['--ao=null', '--pause=yes'],
    )
    await client.command('loadfile', path, 'replace')
    await ready
    const origin = await client.command('get_property', 'demuxer-start-time')
    if (typeof origin !== 'number' || !Number.isFinite(origin))
      throw new Error('Invalid demuxer timestamp origin')
    return origin
  } finally {
    lifetime.removeEventListener('abort', abort)
    await client?.close()
  }
}

/** ashowinfo reports PCM PTS in samples; pts_time is rounded decimal output. */
export function parseFirstPcmTimestamp(
  diagnostics: string,
  rate: number,
  channels: number,
): number | undefined {
  const match =
    /\[Parsed_ashowinfo_\d+ @ [^\]]+\] n:0 pts:(-?\d+) pts_time:[^\s]+ .*?channels:(\d+).*?rate:(\d+)/.exec(
      diagnostics,
    )
  if (!match) return undefined
  if (Number(match[2]) !== channels || Number(match[3]) !== rate)
    throw new Error('Unexpected audio decode format')
  const origin = Number(match[1]) / rate
  if (!Number.isFinite(origin) || origin < 0) throw new Error('Unsupported audio timestamp origin')
  return origin
}
