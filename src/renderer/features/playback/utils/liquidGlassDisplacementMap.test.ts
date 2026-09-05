import { describe, expect, it } from 'vitest'
import {
  getDisplacementMap,
  getDisplacementFilter,
  isBackdropFilterUrlSyntaxAccepted,
} from './liquidGlassDisplacementMap'

describe('nikdelvin/liquid-glass algorithm', () => {
  const options = {
    width: 800,
    height: 72,
    radius: 28,
    depth: 10,
    strength: 30,
    chromaticAberration: 4,
  }

  it('generates a valid vector SVG displacement map Data URI', () => {
    const mapUri = getDisplacementMap(options)
    expect(mapUri).toMatch(/^data:image\/svg\+xml;utf8,/)
    const decoded = decodeURIComponent(mapUri)
    expect(decoded).toContain('<svg height="72" width="800"')
    expect(decoded).toContain('id="Y"')
    expect(decoded).toContain('id="X"')
    expect(decoded).toContain('rx="28"')
    expect(decoded).toContain('ry="28"')
    expect(decoded).toContain('fill="#808080"')
  })

  it('keeps valid zero-valued edge inputs in the displacement map', () => {
    const mapUri = getDisplacementMap({
      width: 1,
      height: 1,
      radius: 0,
      depth: 0,
    })
    const decoded = decodeURIComponent(mapUri)

    expect(decoded).toContain('<svg height="1" width="1"')
    expect(decoded).toContain('rx="0"')
    expect(decoded).toContain('ry="0"')
    expect(decoded).toContain('height="1" width="1"')
  })

  it('generates a 3-channel chromatic aberration displacement filter referencing #displace', () => {
    const filterUri = getDisplacementFilter(options)
    expect(filterUri).toMatch(/#displace$/)
    const decoded = decodeURIComponent(filterUri)
    expect(decoded).toContain('<filter id="displace"')
    expect(decoded).toContain('result="displacedR"')
    expect(decoded).toContain('result="displacedG"')
    expect(decoded).toContain('result="displacedB"')
    expect(decoded).toContain('feBlend in="displacedR" in2="displacedG"')
    expect(decoded).toContain('scale="38"') // strength (30) + cab (4) * 2 = 38 for R
    expect(decoded).toContain('scale="34"') // strength (30) + cab (4) = 34 for G
    expect(decoded).toContain('scale="30"') // strength (30) for B
  })

  it('keeps all RGB displacement scales at zero for zero intensity', () => {
    const decoded = decodeURIComponent(
      getDisplacementFilter({
        width: 1,
        height: 1,
        radius: 0,
        depth: 0,
        strength: 0,
        chromaticAberration: 0,
      }),
    )

    expect([...decoded.matchAll(/scale="0"/g)]).toHaveLength(3)
  })

  it('accepts only CSSOM-normalized backdrop-filter URL parser values', () => {
    expect(isBackdropFilterUrlSyntaxAccepted('url("#auralis-liquid-glass-parser-test")')).toBe(true)
    expect(isBackdropFilterUrlSyntaxAccepted('url(#auralis-liquid-glass-parser-test)')).toBe(true)
    expect(isBackdropFilterUrlSyntaxAccepted('blur(1px)')).toBe(false)
    expect(isBackdropFilterUrlSyntaxAccepted('')).toBe(false)
  })
})
