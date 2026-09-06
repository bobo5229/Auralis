import type { AmdlStage } from '@shared/types/amdl'

export interface AmdlParsedLine {
  stage?: AmdlStage
  alreadyExists?: boolean
  message?: string
}

export function parseAmdlOutputLine(line: string): AmdlParsedLine {
  const trimmed = line.trim()
  if (!trimmed) {
    return {}
  }

  if (trimmed.includes('Track already exists locally.')) {
    return {
      alreadyExists: true,
      message: 'Track already exists locally.',
    }
  }

  if (trimmed === 'Decrypted' || trimmed.startsWith('Decrypted')) {
    return {
      stage: 'processing',
      message: 'Decrypted',
    }
  }

  if (trimmed === 'Downloaded' || trimmed.startsWith('Downloaded')) {
    return {
      stage: 'processing',
      message: 'Downloaded',
    }
  }

  if (trimmed.startsWith('Queue ') || trimmed.startsWith('Track ') || trimmed.includes('Song->')) {
    return {
      stage: 'preparing',
      message: trimmed,
    }
  }

  return {}
}
