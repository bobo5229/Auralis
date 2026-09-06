import type { AmdlStage } from '@shared/types/amdl'

export interface AmdlCompletionSummary {
  completed: number
  total: number
  warnings: number
  errors: number
}

export interface AmdlParsedLine {
  stage?: AmdlStage
  alreadyExists?: boolean
  message?: string
  completionSummary?: AmdlCompletionSummary
}

const SUMMARY_REGEX = /Completed:\s*(\d+)\s*\/\s*(\d+).*?Warnings:\s*(\d+).*?Errors:\s*(\d+)/i

export function parseAmdlOutputLine(line: string): AmdlParsedLine {
  const trimmed = line.trim()
  if (!trimmed) {
    return {}
  }

  const summaryMatch = trimmed.match(SUMMARY_REGEX)
  if (summaryMatch) {
    return {
      message: trimmed,
      completionSummary: {
        completed: parseInt(summaryMatch[1], 10),
        total: parseInt(summaryMatch[2], 10),
        warnings: parseInt(summaryMatch[3], 10),
        errors: parseInt(summaryMatch[4], 10),
      },
    }
  }

  if (trimmed.includes('Track already exists locally.')) {
    return {
      alreadyExists: true,
      message: 'Track already exists locally.',
    }
  }

  if (trimmed === 'Decrypted' || trimmed.startsWith('Decrypted')) {
    return {
      stage: 'finalizing',
      message: 'Decrypted',
    }
  }

  if (trimmed === 'Downloaded' || trimmed.startsWith('Downloaded')) {
    return {
      stage: 'processing',
      message: 'Downloaded',
    }
  }

  if (trimmed.startsWith('Queue ')) {
    return {
      stage: 'preparing',
      message: trimmed,
    }
  }

  if (trimmed.startsWith('Track ') || trimmed.includes('Song->')) {
    return {
      stage: 'downloading',
      message: trimmed,
    }
  }

  return {}
}
