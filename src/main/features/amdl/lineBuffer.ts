export class LineBuffer {
  private remainder = ''

  push(chunk: string | Buffer): string[] {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    const combined = this.remainder + text
    const lines = combined.split(/\r?\n/)
    // The last element is whatever comes after the final newline (or the whole string if no newline)
    this.remainder = lines.pop() ?? ''
    return lines
  }

  flush(): string[] {
    if (this.remainder.length > 0) {
      const leftover = this.remainder
      this.remainder = ''
      return [leftover]
    }
    return []
  }
}
