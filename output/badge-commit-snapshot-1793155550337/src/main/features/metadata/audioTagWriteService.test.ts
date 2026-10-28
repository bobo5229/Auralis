import { describe, expect, it } from 'vitest'
import { resolveCoverFileExtension } from './audioTagWriteService'

describe('resolveCoverFileExtension', () => {
  it('maps common image MIME types', () => {
    expect(resolveCoverFileExtension('image/png')).toBe('.png')
    expect(resolveCoverFileExtension('image/webp')).toBe('.webp')
    expect(resolveCoverFileExtension('image/jpeg')).toBe('.jpg')
    expect(resolveCoverFileExtension('image/jpg')).toBe('.jpg')
  })
})
