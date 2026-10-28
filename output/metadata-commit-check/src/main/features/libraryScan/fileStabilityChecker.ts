import { stat } from 'node:fs/promises'

export interface StabilityResult {
  stable: boolean
  filePath: string
  fileSize: number
  fileMtimeMs: number
}

const STABILITY_DELAY_MS = 800

export async function checkFileStability(filePath: string): Promise<StabilityResult> {
  try {
    const first = await stat(filePath)

    await new Promise((resolve) => setTimeout(resolve, STABILITY_DELAY_MS))

    const second = await stat(filePath)

    const stable = first.size === second.size && first.mtimeMs === second.mtimeMs

    return {
      stable,
      filePath,
      fileSize: second.size,
      fileMtimeMs: second.mtimeMs,
    }
  } catch {
    return {
      stable: false,
      filePath,
      fileSize: 0,
      fileMtimeMs: 0,
    }
  }
}
