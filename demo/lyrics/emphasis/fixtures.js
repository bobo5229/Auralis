export const enhanced = `[ti:慢下来]
[ar:Auralis 原创示例]
[00:02.000]<00:02.000>风<00:02.500>经过<00:03.200>安静的<00:04.100>海<00:06.000>
[00:07.000]<00:07.000>我把<00:07.700>回声<00:08.700>留在<00:09.400>窗外<00:11.000>
[00:12.000]<00:12.000>让<00:12.500>这一刻<00:13.300>慢<00:14.100>下来<00:16.400>
[00:18.000]<00:18.000>等<00:18.500>一颗星<00:20.000>落进<00:20.700>心海<00:23.400>
[00:25.000]<00:25.000>所有<00:25.800>远方<00:26.700>都有<00:27.500>归来`

export const plain = `[ti:慢下来]
[ar:Auralis 原创示例]
[00:02.000]风经过安静的海
[00:07.000]我把回声留在窗外
[00:12.000]让这一刻慢下来
[00:18.000]等一颗星落进心海
[00:25.000]所有远方都有归来`

export function contentKey(text) {
  let value = 2166136261
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619)
  return `auralis-emphasis-demo-v1:${(value >>> 0).toString(16)}`
}

export function effectEnvelope(time, start, end) {
  if (!Number.isFinite(end) || end <= start || time <= start || time >= end) return 0
  const progress = (time - start) / (end - start)
  // A long plateau lets sustained syllables hang; both edges return to rest.
  const attack = Math.min(1, progress / 0.28)
  const release = Math.min(1, (1 - progress) / 0.3)
  const ease = (x) => 1 - (1 - x) ** 3
  return ease(attack) * ease(release)
}
