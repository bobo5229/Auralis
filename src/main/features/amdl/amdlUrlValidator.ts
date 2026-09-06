export function validateAppleMusicUrl(rawUrl: string): {
  valid: boolean
  normalizedUrl?: string
  error?: string
} {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'URL is required' }
  }

  const trimmed = rawUrl.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'URL must use https protocol' }
  }

  if (parsed.hostname !== 'music.apple.com') {
    return { valid: false, error: 'URL hostname must be music.apple.com' }
  }

  return { valid: true, normalizedUrl: parsed.toString() }
}
